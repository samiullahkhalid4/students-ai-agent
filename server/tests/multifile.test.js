import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import request from "supertest";
import { createDatabase } from "../db/database.js";
import { createMemory } from "../agents/memory.js";
import { createTursoMemory } from "../agents/tursoMemory.js";
import { createAgentController } from "../agents/controller.js";
import { createApp } from "../app.js";
import { fixtures, pass, queueProvider } from "./fixtures.js";

const first = { name: "Ayesha", subject: "AI", filename: "intro.txt", lectureText: "FIRST_SOURCE: agents perceive and act." };
const second = { filename: "search.txt", lectureText: "SECOND_SOURCE: breadth first search explores each depth." };
async function setup(t, storage) {
  if (storage === "local") {
    const db = createDatabase(":memory:");
    t.after(() => db.close());
    return { memory: createMemory(db), reopen: () => createMemory(db),
      execute: async (sql, args = []) => db.prepare(sql).run(...args) };
  }
  const dir = mkdtempSync(path.join(tmpdir(), "study-files-"));
  const client = createClient({ url: `file:${path.join(dir, "study.db")}` });
  t.after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });
  return { memory: await createTursoMemory({ client }), reopen: () => createTursoMemory({ client }),
    execute: (sql, args = []) => client.execute({ sql, args }) };
}
for (const storage of ["local", "turso"]) {
  test(`${storage}: files stay in one subject, retries are idempotent, and selected sources reach both AI calls`, async (t) => {
    const { memory } = await setup(t, storage);
    const original = await memory.saveStudySession(first);
    const session = await memory.addStudyFile(original.id, second);
    await memory.addStudyFile(original.id, second);
    assert.equal(session.files.length, 2);
    assert.equal((await memory.getStudySession(original.id)).files.length, 2);
    assert.equal((await memory.listStudySessions()).length, 1);
    assert.equal((await memory.listStudySessions())[0].file_count, 2);
    const prompts = [];
    const provider = { name: "fixture", model: "fixture", async generateText(prompt) {
      prompts.push(prompt); return JSON.stringify(prompts.length % 2 ? fixtures.summary : pass);
    } };
    const controller = createAgentController({ memory, provider });
    const selected = await controller.generate(session.id, "summary", [session.files[1].id]);
    assert.equal(prompts.length, 2);
    for (const prompt of prompts) { assert.match(prompt, /SECOND_SOURCE/); assert.doesNotMatch(prompt, /FIRST_SOURCE/); }
    assert.deepEqual(selected.result.metadata.sources, [{ id: session.files[1].id, filename: second.filename }]);
    prompts.length = 0;
    const combined = await controller.generate(session.id, "summary");
    for (const prompt of prompts) { assert.match(prompt, /FIRST_SOURCE/); assert.match(prompt, /SECOND_SOURCE/); }
    assert.equal(combined.result.metadata.sources.length, 2);
    assert.equal((await memory.getStudySession(session.id)).outputs.length, 2);
  });

  test(`${storage}: invalid selections and oversized combined notes stop before AI, saved content stays intact`, async (t) => {
    const { memory } = await setup(t, storage);
    const session = await memory.saveStudySession({ ...first, lectureText: "a".repeat(35000) });
    const withFiles = await memory.addStudyFile(session.id, { ...second, lectureText: "b".repeat(35000) });
    const other = await memory.saveStudySession(first);
    const provider = queueProvider([]);
    const controller = createAgentController({ memory, provider });
    await assert.rejects(controller.generate(session.id, "summary"), { code: "SELECTION_TOO_LONG" });
    for (const ids of [[], [other.files[0].id], [withFiles.files[0].id, withFiles.files[0].id]])
      await assert.rejects(controller.generate(session.id, "summary", ids), { code: "INVALID_FILES" });
    assert.equal(provider.calls, 0);
    const saved = await memory.getStudySession(session.id);
    assert.equal(saved.files.length, 2);
    assert.equal(saved.files[0].lecture_text.length, 35000);
    assert.equal(saved.outputs.length, 0);
    const valid = createAgentController({ memory, provider: queueProvider([fixtures.summary, pass]) });
    await valid.generate(session.id, "summary", [saved.files[0].id]);
  });

  test(`${storage}: older sessions migrate once and keep quiz history when files are added`, async (t) => {
    const { memory, reopen, execute } = await setup(t, storage);
    const session = await memory.saveStudySession(first);
    const result = await memory.saveGeneratedOutput(session.id, "mcqs", fixtures.mcqs, { critic: pass });
    await memory.saveQuizResult(session.id, result.id, Array(10).fill("A"));
    // Reproduce the pre-migration state: session and outputs exist without source rows.
    await execute("DELETE FROM lecture_files WHERE session_id = ?", [session.id]);
    const migrated = await reopen();
    await reopen();
    const legacy = await migrated.getStudySession(session.id);
    assert.equal(legacy.files.length, 1);
    assert.equal(legacy.files[0].filename, first.filename);
    assert.equal(legacy.files[0].lecture_text, first.lectureText);
    const added = await migrated.addStudyFile(session.id, second);
    assert.equal(added.files.length, 2);
    assert.equal(added.outputs[0].id, result.id);
    assert.equal(added.quizResults[0].score, 10);
    assert.equal(added.outputs[0].metadata.sources, undefined);
  });

  test(`${storage}: upload API appends files and rejects invalid documents without creating sessions`, async (t) => {
    const { memory } = await setup(t, storage);
    const app = createApp({ memory, provider: queueProvider([]), serveClient: false });
    const session = await memory.saveStudySession(first);
    const endpoint = `/api/study/session/${session.id}/files`;
    await request(app).post(endpoint).attach("file", Buffer.from(second.lectureText), second.filename).expect(201);
    await request(app).post(endpoint).attach("file", Buffer.from("bad"), "broken.pdf").expect(400);
    await request(app).post(endpoint).expect(400);
    await request(app).post("/api/study/session/999/files").attach("file", Buffer.from("notes"), "notes.txt").expect(404);
    assert.equal((await memory.listStudySessions()).length, 1);
    assert.equal((await memory.getStudySession(session.id)).files.length, 2);
    await request(app).post("/api/study/generate").send({ sessionId: session.id, task: "summary", fileIds: [] }).expect(400);
  });

  test(`${storage}: files added during generation do not change the result's source snapshot`, async (t) => {
    const { memory } = await setup(t, storage);
    const session = await memory.saveStudySession(first);
    let count = 0;
    const provider = { name: "fixture", model: "fixture", async generateText(prompt) {
      assert.doesNotMatch(prompt, /SECOND_SOURCE/);
      if (++count === 1) { await memory.addStudyFile(session.id, second); return JSON.stringify(fixtures.summary); }
      return JSON.stringify(pass);
    } };
    const { result } = await createAgentController({ memory, provider }).generate(session.id, "summary");
    assert.deepEqual(result.metadata.availableFileIds, [session.files[0].id]);
    assert.deepEqual(result.metadata.sources, [{ id: session.files[0].id, filename: first.filename }]);
    assert.equal((await memory.getStudySession(session.id)).files.length, 2);
  });

  test(`${storage}: the 50-file limit rolls back the new file and allows an existing-file retry`, async (t) => {
    const { memory } = await setup(t, storage);
    const session = await memory.saveStudySession(first);
    for (let i = 1; i < 50; i++) await memory.addStudyFile(session.id, { filename: `lecture-${i}.txt`, lectureText: `Notes ${i}` });
    await assert.rejects(async () => memory.addStudyFile(session.id, second), { code: "FILE_LIMIT" });
    const saved = await memory.addStudyFile(session.id, first);
    assert.equal(saved.files.length, 50);
  });
}
