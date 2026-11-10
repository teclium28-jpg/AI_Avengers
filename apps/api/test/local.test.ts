import assert from "node:assert/strict";
import test from "node:test";

test("database diagnostic rejects requests without a configured token", async () => {
  const { default: app } = await import("../src/local.ts");
  const response = await app.request("/__checks/database", { method: "POST" }, {});
  assert.equal(response.status, 404);
});

test("database diagnostic rejects a wrong token before connecting", async () => {
  const { default: app } = await import("../src/local.ts");
  const response = await app.request("/__checks/database", {
    method: "POST", headers: { Authorization: "Bearer wrong" },
  }, { DB_PROBE_TOKEN: "local-test-token" });
  assert.equal(response.status, 403);
});

test("authorized diagnostic reports unconfigured database without exposing secrets", async () => {
  const { default: app } = await import("../src/local.ts");
  const response = await app.request("/__checks/database", {
    method: "POST", headers: { Authorization: "Bearer local-test-token" },
  }, { DB_PROBE_TOKEN: "local-test-token" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "database_not_configured" });
});

test("database configuration errors return a generic response", async () => {
  const { default: app } = await import("../src/local.ts");
  const response = await app.request("/__checks/database", {
    method: "POST", headers: { Authorization: "Bearer local-test-token" },
  }, {
    DB_PROBE_TOKEN: "local-test-token",
    DATABASE_URL: "postgresql://role:%ZZ-secret-sentinel@invalid.invalid/postgres",
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "database_transaction_failed" });
});
