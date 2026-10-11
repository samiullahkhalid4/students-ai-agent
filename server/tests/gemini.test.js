import { test } from "node:test";
import assert from "node:assert/strict";
import { createGeminiProvider } from "../services/geminiProvider.js";
import { jsonSchema, taskSchemas } from "../prompts/schemas.js";

const options = {
  schema: jsonSchema(taskSchemas.summary),
  systemInstruction: "Use only the lecture.",
};
const makeProvider = () =>
  createGeminiProvider({
    apiKey: "test-key-not-a-secret",
    model: "gemini-3.5-flash-lite",
  });

test("Gemini SDK sends structured schema, model, and server-side key through the adapter", async (t) => {
  let captured;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    captured = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(init.body),
    };
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: '{"overview":"sample"}' }],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const result = await makeProvider().generateText("Lecture data", options);
  assert.equal(result, '{"overview":"sample"}');
  assert.match(captured.url, /models\/gemini-3.5-flash-lite:generateContent/);
  assert.equal(captured.headers.get("x-goog-api-key"), "test-key-not-a-secret");
  assert.equal(
    captured.body.generationConfig.responseMimeType,
    "application/json",
  );
  assert.equal(
    captured.body.generationConfig.responseJsonSchema.properties.overview.type,
    "string",
  );
  assert.equal(
    captured.body.systemInstruction.parts[0].text,
    options.systemInstruction,
  );
});
for (const [status, expectedCode] of [
  [400, "AI_CONFIGURATION"],
  [401, "AI_CONFIGURATION"],
  [403, "AI_CONFIGURATION"],
  [404, "AI_MODEL_UNAVAILABLE"],
  [429, "AI_RATE_LIMIT"],
  [503, "AI_UNAVAILABLE"],
]) {
  test(`Gemini HTTP ${status} maps to a safe error without automatic retries`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response(
        JSON.stringify({
          error: {
            code: status,
            message: "Private provider detail test-key-not-a-secret",
            status: "FAILED",
          },
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    });
    await assert.rejects(
      makeProvider().generateText("Lecture data", options),
      (error) => {
        assert.equal(error.code, expectedCode);
        assert.doesNotMatch(
          error.message,
          /test-key-not-a-secret|Private provider detail/,
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  });
}
test("Gemini incomplete output is rejected before it becomes a study aid", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "{partial" }] },
              finishReason: "MAX_TOKENS",
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(makeProvider().generateText("Lecture data", options), {
    code: "INCOMPLETE_AI_OUTPUT",
  });
});
test("Gemini network failures become useful user-facing errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(makeProvider().generateText("Lecture data", options), {
    code: "AI_UNAVAILABLE",
  });
});
