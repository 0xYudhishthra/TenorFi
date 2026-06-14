// @keel/api entrypoint — boots config, then the HTTP server.
// MCP skin and background workers get wired in here as later phases land.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";

const config = loadConfig();

const app = new Hono();

app.get("/health", (c) =>
  c.json({ ok: true, service: "keel-api", network: config.HL_NETWORK })
);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`keel-api listening on :${info.port} (${config.HL_NETWORK})`);
});
