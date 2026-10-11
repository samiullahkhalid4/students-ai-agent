import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../app.js";
import { createDatabase } from "../db/database.js";
import { createMemory } from "../agents/memory.js";
import { createGeminiProvider } from "../services/geminiProvider.js";
import { AppError } from "../services/errors.js";
import { fixtures, pass, queueProvider } from "./fixtures.js";

const sample = (extension) =>
  new URL(`../../samples/lecture.${extension}`, import.meta.url);
function setup(t, responses = [], providerOverride) {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  const provider = providerOverride || queueProvider(responses);
  return {
    db,
    provider,
    app: createApp({ db, provider }),
    memory: createMemory(db),
  };
}
function upload(app, extension = "txt") {
  return request(app)
    .post("/api/study/upload")
    .field("name", "Ayesha Khan")
    .field("subject", "Artificial Intelligence")
    .attach("file", readFileSync(sample(extension)), `lecture.${extension}`);
}

for (const extension of ["txt", "pdf", "docx"])
  test(`extracts and stores real ${extension.toUpperCase()} lecture`, async (t) => {
    const { app } = setup(t);
    const res = await upload(app, extension);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.session.lecture_text, /bounded revision loop/i);
    const loaded = await request(app)
      .get(`/api/study/session/${res.body.session.id}`)
      .expect(200);
    assert.equal(loaded.body.session.student_name, "Ayesha Khan");
    assert.equal(loaded.body.session.filename, `lecture.${extension}`);
  });
for (const task of Object.keys(fixtures))
  test(`generates, verifies and saves ${task}`, async (t) => {
    const { app, provider } = setup(t, [fixtures[task], pass]);
    const { body } = await upload(app);
    const res = await request(app)
      .post("/api/study/generate")
      .send({ sessionId: body.session.id, task })
      .expect(200);
    assert.deepEqual(res.body.result.output, fixtures[task]);
    assert.equal(res.body.state.status, "complete");
    assert.equal(provider.calls, 2);
    assert.equal(res.body.result.metadata.critic.passed, true);
    const loaded = await request(app)
      .get(`/api/study/session/${body.session.id}`)
      .expect(200);
    assert.equal(loaded.body.session.outputs.length, 1);
  });
test("accepts one critic revision and checks it again", async (t) => {
  const revised = {
    ...fixtures.summary,
    overview: "Revised grounded overview.",
  };
  const { app, provider } = setup(t, [
    fixtures.summary,
    { passed: false, issues: ["Improve the overview"], revisedOutput: revised },
    pass,
  ]);
  const { body } = await upload(app);
  const res = await request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" })
    .expect(200);
  assert.equal(res.body.result.metadata.revisionCount, 1);
  assert.deepEqual(res.body.result.output, revised);
  assert.equal(provider.calls, 3);
});
test("regenerates once when critic provides no revised output", async (t) => {
  const { app, provider } = setup(t, [
    fixtures.summary,
    { passed: false, issues: ["Missing coverage"], revisedOutput: null },
    fixtures.summary,
    pass,
  ]);
  const { body } = await upload(app);
  await request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" })
    .expect(200);
  assert.equal(provider.calls, 4);
});
test("stops after one failed revision and does not save rejected output", async (t) => {
  const reject = {
    passed: false,
    issues: ["Unsupported content"],
    revisedOutput: fixtures.summary,
  };
  const { app, provider } = setup(t, [
    fixtures.summary,
    reject,
    { ...reject, revisedOutput: null },
  ]);
  const { body } = await upload(app);
  const res = await request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" })
    .expect(422);
  assert.equal(res.body.code, "CRITIC_REJECTED");
  assert.equal(provider.calls, 3);
  const loaded = await request(app)
    .get(`/api/study/session/${body.session.id}`)
    .expect(200);
  assert.equal(loaded.body.session.outputs.length, 0);
  const status = await request(app)
    .get(`/api/study/session/${body.session.id}/status`)
    .expect(200);
  assert.equal(status.body.status, "error");
  assert.equal(status.body.revisionCount, 1);
});
for (const [label, responses, code] of [
  ["empty response", [""], "EMPTY_AI_OUTPUT"],
  ["malformed JSON", ["{oops"], "MALFORMED_AI_JSON"],
  ["wrong schema", [{}], "INVALID_AI_OUTPUT"],
  ["malformed critic", [fixtures.summary, "not-json"], "MALFORMED_AI_JSON"],
  [
    "contradictory critic",
    [
      fixtures.summary,
      { passed: true, issues: ["Not grounded"], revisedOutput: null },
    ],
    "INVALID_CRITIC_OUTPUT",
  ],
  [
    "AI failure",
    [new AppError(502, "Provider failed", "AI_UNAVAILABLE")],
    "AI_UNAVAILABLE",
  ],
])
  test(`handles ${label} without saving`, async (t) => {
    const { app, memory } = setup(t, responses);
    const { body } = await upload(app);
    const res = await request(app)
      .post("/api/study/generate")
      .send({ sessionId: body.session.id, task: "summary" })
      .expect(502);
    assert.equal(res.body.code, code);
    assert.equal(memory.getStudySession(body.session.id).outputs.length, 0);
  });
test("missing API key yields actionable error and uploads still work", async (t) => {
  const { app } = setup(
    t,
    [],
    createGeminiProvider({ apiKey: "", model: "test" }),
  );
  const { body } = await upload(app);
  const res = await request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" })
    .expect(503);
  assert.equal(res.body.code, "MISSING_API_KEY");
});
test("validates file, form, size, text and content type", async (t) => {
  const { app } = setup(t);
  await request(app)
    .post("/api/study/upload")
    .field("name", "Ayesha")
    .field("subject", "AI")
    .expect(400);
  await request(app)
    .post("/api/study/upload")
    .attach("file", Buffer.from("text"), "lecture.txt")
    .expect(400);
  for (const [buffer, filename, expected] of [
    [Buffer.from("script"), "lecture.exe", 400],
    [Buffer.from("  \n"), "lecture.txt", 400],
    [Buffer.from("fake pdf"), "lecture.pdf", 400],
    [Buffer.from("fake docx"), "lecture.docx", 400],
    [Buffer.from([0, 255, 254]), "lecture.txt", 400],
    [Buffer.alloc(10 * 1024 * 1024 + 1, 65), "lecture.txt", 413],
    [Buffer.alloc(60001, 65), "lecture.txt", 400],
  ]) {
    await request(app)
      .post("/api/study/upload")
      .field("name", "Ayesha")
      .field("subject", "AI")
      .attach("file", buffer, filename)
      .expect(expected);
  }
  await request(app)
    .post("/api/study/upload")
    .field("name", "Ayesha")
    .field("subject", "AI")
    .attach("file", Buffer.from("hello"), {
      filename: "lecture.txt",
      contentType: "image/png",
    })
    .expect(400);
});
test("validates API bodies and unknown sessions", async (t) => {
  const { app } = setup(t);
  await request(app)
    .post("/api/study/generate")
    .send({ sessionId: 1, task: "other" })
    .expect(400);
  await request(app)
    .post("/api/study/generate")
    .send({ sessionId: 1, task: "summary" })
    .expect(404);
  await request(app).get("/api/study/session/nope").expect(400);
  await request(app)
    .post("/api/study/generate")
    .set("Content-Type", "application/json")
    .send("{bad")
    .expect(400);
});
test("scores saved MCQs on the server, validates ownership and persists score", async (t) => {
  const { app } = setup(t, [fixtures.mcqs, pass]);
  const { body } = await upload(app);
  const generated = await request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "mcqs" })
    .expect(200);
  const payload = {
    sessionId: body.session.id,
    outputId: generated.body.result.id,
    answers: ["B", ...Array(9).fill("A")],
    score: 10,
  };
  const score = await request(app)
    .post("/api/study/quiz-score")
    .send(payload)
    .expect(201);
  assert.equal(score.body.result.score, 9);
  assert.equal(score.body.result.total, 10);
  await request(app)
    .post("/api/study/quiz-score")
    .send({ ...payload, answers: ["A"] })
    .expect(400);
  const second = await upload(app);
  await request(app)
    .post("/api/study/quiz-score")
    .send({ ...payload, sessionId: second.body.session.id })
    .expect(404);
  const saved = await request(app)
    .get(`/api/study/session/${body.session.id}`)
    .expect(200);
  assert.equal(saved.body.session.quizResults[0].score, 9);
});
test("duplicate generation is rejected while progress is observable", async (t) => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const provider = {
    name: "test",
    model: "test",
    async generateText() {
      if (calls++ === 0) {
        started();
        await ready;
        return JSON.stringify(fixtures.summary);
      }
      return JSON.stringify(pass);
    },
  };
  const { app } = setup(t, [], provider);
  const { body } = await upload(app);
  const pending = request(app)
    .post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" })
    .then((res) => res);
  await entered;
  try {
    const status = await request(app)
      .get(`/api/study/session/${body.session.id}/status`)
      .expect(200);
    assert.equal(status.body.stage, "Executor");
    await request(app)
      .post("/api/study/generate")
      .send({ sessionId: body.session.id, task: "mcqs" })
      .expect(409);
  } finally {
    release();
  }
  assert.equal((await pending).status, 200);
});
test("SQLite sessions survive closing and reopening the database", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "study-agent-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "study.sqlite");
  let db = createDatabase(filename);
  const session = createMemory(db).saveStudySession({
    name: "Ayesha",
    subject: "AI",
    filename: "lecture.txt",
    lectureText: "Original lecture",
  });
  db.close();
  db = createDatabase(filename);
  try {
    assert.equal(
      createMemory(db).getStudySession(session.id).lecture_text,
      "Original lecture",
    );
  } finally {
    db.close();
  }
});

test("insufficient lecture response is clear and never saved as a study aid", async (t) => {
  const { app, provider, memory } = setup(t, [{ insufficientInformation: true, message: "Upload more concepts to support ten distinct MCQs." }]);
  const { body } = await upload(app);
  const response = await request(app).post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "mcqs" }).expect(422);
  assert.equal(response.body.code, "INSUFFICIENT_LECTURE");
  assert.match(response.body.error, /ten distinct MCQs/);
  assert.equal(provider.calls, 1);
  assert.equal(memory.getStudySession(body.session.id).outputs.length, 0);
});

test("duplicate written questions are rejected before review", async (t) => {
  const repeated = structuredClone(fixtures.questions);
  repeated.conceptualQuestions[0] = repeated.shortQuestions[0].toUpperCase();
  const { app, provider } = setup(t, [repeated]);
  const { body } = await upload(app);
  const response = await request(app).post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "questions" }).expect(502);
  assert.equal(response.body.code, "INVALID_AI_OUTPUT");
  assert.equal(provider.calls, 1);
});

test("duplicate MCQ options are rejected and not saved", async (t) => {
  const repeated = structuredClone(fixtures.mcqs);
  repeated.questions[0].options.B = repeated.questions[0].options.A;
  const { app, memory } = setup(t, [repeated]);
  const { body } = await upload(app);
  await request(app).post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "mcqs" }).expect(502);
  assert.equal(memory.getStudySession(body.session.id).outputs.length, 0);
});

test("incomplete critic revisions cannot bypass output validation", async (t) => {
  const invalid = { ...fixtures.summary };
  delete invalid.keyPointsToRemember;
  const { app, memory } = setup(t, [fixtures.summary, { passed: false, issues: ["Missing points"], revisedOutput: invalid }]);
  const { body } = await upload(app);
  await request(app).post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" }).expect(502);
  assert.equal(memory.getStudySession(body.session.id).outputs.length, 0);
});

test("lists previous sessions and retrieves their output history", async (t) => {
  const { app } = setup(t, [fixtures.summary, pass]);
  const first = (await upload(app)).body.session;
  await request(app).post("/api/study/generate").send({ sessionId: first.id, task: "summary" }).expect(200);
  const second = (await upload(app)).body.session;
  const list = await request(app).get("/api/study/sessions").expect(200);
  assert.deepEqual(list.body.sessions.map((s) => s.id), [second.id, first.id]);
  assert.equal(list.body.sessions[0].lecture_text, undefined);
  const history = await request(app).get(`/api/study/session/${first.id}/history`).expect(200);
  assert.deepEqual(history.body.outputs[0].output, fixtures.summary);
  await request(app).get("/api/study/session/999/history").expect(404);
});

test("missing lecture text stops before any paid AI request", async (t) => {
  const { app, db, provider } = setup(t);
  const { body } = await upload(app);
  db.prepare("UPDATE study_sessions SET lecture_text = '' WHERE id = ?").run(body.session.id);
  const response = await request(app).post("/api/study/generate")
    .send({ sessionId: body.session.id, task: "summary" }).expect(422);
  assert.equal(response.body.code, "MISSING_LECTURE");
  assert.equal(provider.calls, 0);
});

test("database failure is readable and server health remains available", async (t) => {
  const { app, db } = setup(t);
  db.exec("DROP TABLE quiz_results");
  const response = await upload(app);
  assert.equal(response.status, 500);
  assert.equal(response.body.code, "DATABASE_ERROR");
  await request(app).get("/api/health").expect(200);
});

test("generated output and quiz score survive a database restart", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "study-persistence-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "study.sqlite");
  let db = createDatabase(filename);
  let memory = createMemory(db);
  const session = memory.saveStudySession({ name: "Ayesha", subject: "AI", filename: "lecture.txt", lectureText: "Lecture text" });
  const output = memory.saveGeneratedOutput(session.id, "mcqs", fixtures.mcqs, { critic: pass });
  memory.saveQuizResult(session.id, output.id, Array(10).fill("A"));
  db.close();
  db = createDatabase(filename);
  try {
    memory = createMemory(db);
    const saved = memory.getStudySession(session.id);
    assert.deepEqual(saved.outputs[0].output, fixtures.mcqs);
    assert.equal(saved.quizResults[0].score, 10);
  } finally { db.close(); }
});
