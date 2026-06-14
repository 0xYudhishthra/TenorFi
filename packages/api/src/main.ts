// @keel/api entrypoint — boots config, builds services, serves HTTP.
// MCP skin and background workers get wired in here as later phases land.

import { serve } from "@hono/node-server";
import { createTransport } from "@keel/hyperliquid";
import { CHAINS } from "@keel/lifi";
import { loadConfig } from "./config.js";
import { createDb } from "./core/repos/db.js";
import { createPositionRepo } from "./core/repos/positions.js";
import { createExecutionRepo } from "./core/repos/execution.js";
import { createFundingService } from "./core/services/funding.js";
import { createHedgeService } from "./core/services/hedge.js";
import { createPositionService } from "./core/services/position.js";
import { createSettleService } from "./core/services/settle.js";
import { createRebalanceService } from "./core/services/rebalance.js";
import { createExecutionService } from "./core/services/execution.js";
import { createApp } from "./http/app.js";

const config = loadConfig();

const transport = createTransport(config.HL_NETWORK);
const keelTarget = config.KEELSWAP_ADDRESS_BASE as `0x${string}` | undefined;
const db = createDb(config.DATABASE_PATH);

const funding = createFundingService({ transport });
const hedge = createHedgeService({ keelChain: CHAINS.base, keelTarget });
const positions = createPositionService(createPositionRepo(db));
const settle = createSettleService(funding, { keelTarget });
const rebalance = createRebalanceService({ transport });
const execution = createExecutionService(createExecutionRepo(db), positions);

const app = createApp({
  network: config.HL_NETWORK,
  funding,
  hedge,
  positions,
  settle,
  rebalance,
  execution,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`keel-api listening on :${info.port} (${config.HL_NETWORK})`);
});
