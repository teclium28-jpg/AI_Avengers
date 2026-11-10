import assert from "node:assert/strict";
import test from "node:test";
import app from "../src/index.ts";

test("health returns JSON and does not claim database readiness", async () => {
  const response = await app.request("/api/v1/health");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { status: "ok", stage: "scaffold" });
});

test("production API does not expose database diagnostics", async () => {
  assert.equal((await app.request("/__checks/database", { method: "POST" })).status, 404);
});
