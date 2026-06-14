// @keel/api entrypoint — boots config, builds services, serves HTTP.
// MCP skin and background workers get wired in here as later phases land.

import { serve } from "@hono/node-server";
import { createTransport } from "@keel/hyperliquid";
import { loadConfig } from "./config.js";
import { createFundingService } from "./core/services/funding.js";
import { createApp } from "./http/app.js";

const config = loadConfig();

const transport = createTransport(config.HL_NETWORK);
const funding = createFundingService({ transport });

const app = createApp({ network: config.HL_NETWORK, funding });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`keel-api listening on :${info.port} (${config.HL_NETWORK})`);
});
