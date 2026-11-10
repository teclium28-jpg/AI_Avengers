import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const varsPath = fileURLToPath(new URL("../apps/api/.dev.vars", import.meta.url));
if (existsSync(varsPath)) process.loadEnvFile(varsPath);

if (!process.env.DB_PROBE_TOKEN) {
  console.error("Set DB_PROBE_TOKEN in apps/api/.dev.vars, then restart npm run dev:api.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch("http://127.0.0.1:8787/__checks/database", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DB_PROBE_TOKEN}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      // Do not print arbitrary HTTP bodies; intermediaries may expose internals.
      throw new Error(`Database check returned HTTP ${response.status}. See docs/local-api.md.`);
    }
    const result = await response.json();
    if (result.status !== "committed" || result.value !== 1 || result.readOnly !== true) {
      throw new Error("Database check did not confirm a completed read-only transaction.");
    }
    console.log("PASS: Worker completed a read-only PostgreSQL transaction (BEGIN / marker check / COMMIT).");
  } catch (error) {
    // Report controlled status text only, never driver error objects or local bindings.
    console.error(error instanceof Error && error.message.startsWith("Database check")
      ? error.message : "Database check failed. Confirm the local API and connection settings.");
    process.exitCode = 1;
  }
}
