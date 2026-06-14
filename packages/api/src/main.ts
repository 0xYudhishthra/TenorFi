// @keel/api entrypoint — boots config, builds services, serves HTTP.
// MCP skin and background workers get wired in here as later phases land.

import { serve } from "@hono/node-server";
import { createTransport } from "@keel/hyperliquid";
import { CHAINS } from "@keel/lifi";
import { loadConfig } from "./config.js";
import { createDb } from "./core/repos/db.js";
import { createPositionRepo } from "./core/repos/positions.js";
import { createFundingService } from "./core/services/funding.js";
import { createHedgeService } from "./core/services/hedge.js";
import { createPositionService } from "./core/services/position.js";
import { createApp } from "./http/app.js";

const config = loadConfig();

const transport = createTransport(config.HL_NETWORK);
const funding = createFundingService({ transport });
const hedge = createHedgeService({
  keelChain: CHAINS.base,
  keelTarget: config.KEELSWAP_ADDRESS_BASE as `0x${string}` | undefined,
});
const positions = createPositionService(
  createPositionRepo(createDb(config.DATABASE_PATH)),
);

const app = createApp({ network: config.HL_NETWORK, funding, hedge, positions });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`keel-api listening on :${info.port} (${config.HL_NETWORK})`);
});
