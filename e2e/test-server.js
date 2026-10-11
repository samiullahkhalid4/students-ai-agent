// Test-only server. Fixture data is never available through the real server entrypoint.
import { createApp } from "../server/app.js";
import { createDatabase } from "../server/db/database.js";
import { fixtures, pass } from "../server/tests/fixtures.js";

const db = createDatabase(":memory:");
const provider = {
  name: "test-fixture",
  model: "deterministic-test-only",
  async generateText(prompt, { schema }) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (schema.properties?.passed) return JSON.stringify(pass);
    if (schema.anyOf) schema = schema.anyOf[0];
    const task = schema.properties.overview
      ? "summary"
      : schema.properties.shortQuestions
        ? "questions"
        : schema.properties.topics
          ? "revision"
          : "mcqs";
    return JSON.stringify(fixtures[task]);
  },
};
createApp({ db, provider }).listen(4173, "127.0.0.1");
