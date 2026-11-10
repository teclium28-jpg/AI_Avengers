import { Hono } from "hono";
import { createApp } from "./index.ts";
import { checkDatabaseTransaction } from "./database-probe.ts";

interface LocalBindings {
  DATABASE_URL?: string;
  DB_PROBE_TOKEN?: string;
}

// This entrypoint is separate from the production Worker.
const app = new Hono<{ Bindings: LocalBindings }>();
app.route("/", createApp());

app.post("/__checks/database", async (c) => {
  if (!c.env.DB_PROBE_TOKEN) return c.notFound();
  if (c.req.header("Authorization") !== `Bearer ${c.env.DB_PROBE_TOKEN}`) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!c.env.DATABASE_URL) return c.json({ error: "database_not_configured" }, 503);
  try {
    return c.json(await checkDatabaseTransaction(c.env.DATABASE_URL));
  } catch {
    // Never return/log driver errors: they can include credentials or connection data.
    return c.json({ error: "database_transaction_failed" }, 503);
  }
});

export default app;
