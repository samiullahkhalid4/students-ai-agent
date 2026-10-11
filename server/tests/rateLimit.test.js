import { test } from "node:test";
import assert from "node:assert/strict";
import { createWriteLimiter } from "../services/rateLimit.js";

test("write limit preserves reads, returns retry delay, and resets after its window", () => {
  let time = 0;
  const limit = createWriteLimiter({ limit: 2, windowMs: 60000, now: () => time });
  let passed = 0;
  const headers = {};
  let status, body;
  const res = { set: (key, value) => { headers[key] = value; }, status: (value) => { status = value; return res; }, json: (value) => { body = value; } };
  const next = () => passed++;
  for (let i = 0; i < 3; i++) limit({ method: "POST" }, res, next);
  assert.equal(passed, 2);
  assert.equal(status, 429);
  assert.equal(body.code, "RATE_LIMITED");
  assert.equal(headers["Retry-After"], "60");
  limit({ method: "GET" }, res, next);
  assert.equal(passed, 3);
  time = 60000;
  limit({ method: "POST" }, res, next);
  assert.equal(passed, 4);
});
