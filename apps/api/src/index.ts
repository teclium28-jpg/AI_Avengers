import { Hono } from "hono";

export function createApp() {
  const app = new Hono();
  app.get("/api/v1/health", (c) => c.json({ status: "ok", stage: "scaffold" }));
  return app;
}

export default createApp();
