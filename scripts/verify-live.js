// Opt-in verification: uses the configured Gemini account and consumes API quota.
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { config } from "../server/config.js";
import { createDatabase } from "../server/db/database.js";
import { createAIProvider } from "../server/services/aiProvider.js";
import { createApp } from "../server/app.js";

if (!config.apiKey.trim()) {
  console.error("Live verification needs GEMINI_API_KEY in server/.env. No AI requests were made.");
  process.exitCode = 1;
} else {
  const db = createDatabase(":memory:");
  const app = createApp({ db, provider: createAIProvider(config) });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api/study`;
    async function request(route, options) {
      const response = await fetch(`${base}${route}`, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    }
    const form = new FormData();
    form.set("name", "Classroom demo");
    form.set("subject", "Agentic AI");
    form.set("file", new Blob([readFileSync(new URL("../samples/lecture.pdf", import.meta.url))], { type: "application/pdf" }), "lecture.pdf");
    const { session } = await request("/upload", { method: "POST", body: form });
    console.log("PASS: real PDF upload and SQLite session storage");
    for (const task of ["summary", "questions", "mcqs", "revision"]) {
      const { result, state } = await request("/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, task }),
      });
      assert.equal(state.status, "complete");
      assert.equal(result.metadata.critic.passed, true);
      assert.ok(state.revisionCount <= 1);
      console.log(`PASS: ${task}; critic passed; revisions=${state.revisionCount}`);
    }
    const saved = await request(`/session/${session.id}`);
    assert.equal(saved.session.outputs.length, 4);
    console.log("PASS: all four verified study aids saved in isolated SQLite memory");
  } catch (error) {
    console.error(`Live verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}
