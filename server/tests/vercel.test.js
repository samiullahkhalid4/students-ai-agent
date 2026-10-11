import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createClient } from "@libsql/client";
import { createTursoMemory } from "../agents/tursoMemory.js";
import { createAgentController } from "../agents/controller.js";
import { createApp } from "../app.js";
import { createVercelHandler } from "../vercelApp.js";
import { fixtures, pass, queueProvider } from "./fixtures.js";

async function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "study-turso-"));
  const url = `file:${path.join(dir, "study.db")}`;
  const client = createClient({ url });
  const memory = await createTursoMemory({ client });
  t.after(() => { client.close(); rmSync(dir, { recursive: true, force: true }); });
  return { memory, client, url };
}
const sessionData = { name: "Ayesha", subject: "AI", filename: "lecture.txt", lectureText: "Original lecture" };
const settings = { provider: "gemini", model: "test", apiKey: "", tursoUrl: "libsql://example.turso.io", tursoToken: "test-only" };

test("Vercel entry returns JSON setup errors and retries failed initialization", async () => {
  await request(createVercelHandler({ ...settings, tursoToken: "" }))
    .get("/api/health").expect(503).expect(({ body }) => assert.equal(body.code, "MISSING_DATABASE_CONFIG"));
  await request(createVercelHandler({ ...settings, tursoUrl: "file:/tmp/study.db" }))
    .get("/api/health").expect(503).expect(({ body }) => assert.equal(body.code, "INVALID_DATABASE_CONFIG"));
  let attempts = 0;
  const handler = createVercelHandler(settings, async () => { attempts++; throw new Error("secret connection detail"); });
  for (let i = 0; i < 2; i++) {
    await request(handler).get("/api/health").expect(503).expect(({ body }) => {
      assert.equal(body.code, "DATABASE_UNAVAILABLE");
      assert.doesNotMatch(body.error, /secret connection detail/);
    });
  }
  assert.equal(attempts, 2);
});

test("Vercel entry serves API paths, PDF uploads and database history without a listener", async (t) => {
  const { memory } = await setup(t);
  const handler = createVercelHandler(settings, async () => memory);
  await request(handler).get("/api/health").expect(200).expect(({ body }) => {
    assert.equal(body.storage, "turso");
    assert.equal(body.aiConfigured, false);
    assert.equal(body.tursoToken, undefined);
  });
  const uploaded = await request(handler).post("/api/study/upload")
    .field("name", "Ayesha").field("subject", "AI")
    .attach("file", readFileSync(new URL("../../samples/lecture.pdf", import.meta.url)), "lecture.pdf").expect(201);
  const id = uploaded.body.session.id;
  assert.match(uploaded.body.session.lecture_text, /bounded revision loop/i);
  await request(handler).get(`/api/study/session/${id}`).expect(200);
  await request(handler).get("/api/study/sessions").expect(200);
  await request(handler).get(`/api/study/session/${id}/history`).expect(200);
  await request(handler).post("/api/study/generate").send({ sessionId: id, task: "summary" })
    .expect(503).expect(({ body }) => assert.equal(body.code, "MISSING_API_KEY"));
  await request(handler).get("/api/unknown").expect(404).expect("Content-Type", /json/);
});

for (const task of Object.keys(fixtures)) {
  test(`hosted SQLite adapter generates and persists ${task}`, async (t) => {
    const { memory } = await setup(t);
    const session = await memory.saveStudySession(sessionData);
    const app = createApp({ memory, provider: queueProvider([fixtures[task], pass]), serveClient: false });
    const generated = await request(app).post("/api/study/generate").send({ sessionId: session.id, task }).expect(200);
    assert.deepEqual(generated.body.result.output, fixtures[task]);
    const saved = await memory.getStudySession(session.id);
    assert.deepEqual(saved.outputs[0].output, fixtures[task]);
    if (task === "mcqs") {
      const scored = await request(app).post("/api/study/quiz-score").send({ sessionId: session.id, outputId: saved.outputs[0].id, answers: ["B", ...Array(9).fill("A")] }).expect(201);
      assert.equal(scored.body.result.score, 9);
    }
  });
}

test("separate instances share progress and cannot generate the same session concurrently", async (t) => {
  const { memory, client, url } = await setup(t);
  const otherClient = createClient({ url });
  t.after(() => otherClient.close());
  const other = await createTursoMemory({ client: otherClient });
  const session = await memory.saveStudySession(sessionData);
  let release, signal;
  const pending = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { signal = resolve; });
  let calls = 0;
  const first = createAgentController({ memory, provider: { name: "test", model: "test", async generateText() {
    if (calls++ === 0) { signal(); await pending; return JSON.stringify(fixtures.summary); }
    return JSON.stringify(pass);
  } } });
  const second = createAgentController({ memory: other, provider: queueProvider([]) });
  const generation = first.generate(session.id, "summary");
  await started;
  try {
    assert.equal((await second.getStatus(session.id)).stage, "Executor");
    await assert.rejects(second.generate(session.id, "mcqs"), { code: "SESSION_BUSY" });
  } finally { release(); }
  await generation;
  assert.equal((await second.getStatus(session.id)).status, "complete");
  const reloaded = await other.getStudySession(session.id);
  assert.equal(reloaded.outputs.length, 1);
  assert.equal((await other.listStudySessions())[0].id, session.id);
  // Expired runs become retryable even after a function is terminated.
  await memory.acquireTask(session.id, { status: "running", stage: "Executor", trace: [] });
  await client.execute({ sql: "UPDATE agent_runs SET lease_until = 0 WHERE session_id = ?", args: [session.id] });
  assert.equal((await second.getStatus(session.id)).status, "error");
  const token = await other.acquireTask(session.id, { status: "running", trace: [] });
  await other.saveTaskState(session.id, token, { status: "complete", trace: [] }, true);
});

test("hosted adapter revision is bounded and rejected outputs are not saved", async (t) => {
  const { memory } = await setup(t);
  const session = await memory.saveStudySession(sessionData);
  const reject = { passed: false, issues: ["Unsupported fact"], revisedOutput: null };
  const controller = createAgentController({ memory, provider: queueProvider([fixtures.summary, reject, fixtures.summary, reject]) });
  await assert.rejects(controller.generate(session.id, "summary"), { code: "CRITIC_REJECTED" });
  assert.equal((await memory.getStudySession(session.id)).outputs.length, 0);
  assert.equal((await memory.getTaskState(session.id)).revisionCount, 1);
  const retry = createAgentController({ memory, provider: queueProvider([fixtures.summary, pass]) });
  await retry.generate(session.id, "summary");
});
