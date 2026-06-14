// @keel/api entrypoint — boots config, builds services, serves HTTP.
// MCP skin and background workers get wired in here as later phases land.

import { serve } from "@hono/node-server";
import { privateKeyToAddress } from "viem/accounts";
import { createTransport } from "@keel/hyperliquid";
import { CHAINS, classic } from "@keel/lifi";
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
import { createOnchainSettleService } from "./core/services/onchain-settle.js";
import { createApp } from "./http/app.js";
import {
  startWorkers,
  createFundingPoller,
  createBridgeWatcher,
  createRebalanceMonitor,
  createSettlementScheduler,
} from "./workers/index.js";

const config = loadConfig();

const transport = createTransport(config.HL_NETWORK);
const keelTarget = config.KEELSWAP_ADDRESS_BASE as `0x${string}` | undefined;
const keeperKey = config.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
// The insurance reserve = the Composer open leg's bound counterparty AND the
// on-chain settler's maker. Defaults to the keeper's own address when not set.
const reserve =
  (config.RESERVE_ADDRESS as `0x${string}` | undefined) ??
  (keeperKey ? privateKeyToAddress(keeperKey) : undefined);
const db = createDb(config.DATABASE_PATH);

const funding = createFundingService({ transport });
// Onboarding legs: Base/Keel ACTIVATE leg via LI.FI Composer (hedger approves
// Aqua, no ship), HL leg via LI.FI classic. The LP-ship flow is not part of /hedge.
const hedge = createHedgeService({
  keelChain: CHAINS.base,
});
const positions = createPositionService(createPositionRepo(db));
const settle = createSettleService(funding, { keelTarget });
const rebalance = createRebalanceService({ transport });
const execution = createExecutionService(createExecutionRepo(db), positions);

// On-chain settler: drives the proven Ship/Settle forge scripts. Dry-run by
// default — only broadcasts when KEEPER_PRIVATE_KEY + BASE_RPC_URL are present
// AND SETTLE_BROADCAST=true. Reuses the `reserve` resolved above as the maker.
const onchain = createOnchainSettleService({
  rpcUrl: config.BASE_RPC_URL,
  keeperKey, // signs SHIP (maker = reserve)
  subscriberKey: config.SUBSCRIBER_PRIVATE_KEY as `0x${string}` | undefined, // signs SETTLE (bound taker)
  reserve,
  broadcast: config.SETTLE_BROADCAST,
});
console.log(
  onchain.enabled()
    ? "[onchain] settlement BROADCAST enabled (keeper + RPC + SETTLE_BROADCAST=true)"
    : "[onchain] settlement DRY-RUN (no broadcast — commands logged, simulated:true)",
);

const app = createApp({
  network: config.HL_NETWORK,
  funding,
  hedge,
  positions,
  settle,
  rebalance,
  execution,
  onchain,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`keel-api listening on :${info.port} (${config.HL_NETWORK})`);
});

// Background workers: the automatic brain. Signing stays on the execution node.
startWorkers([
  createFundingPoller({ funding, markets: ["BTC"] }),
  createBridgeWatcher({ positions, status: classic.getBridgeStatus }),
  createRebalanceMonitor({
    positions,
    rebalance,
    execution,
    thresholdUsd: 0, // 0 → never auto-triggers until tuned per deployment
    targetUsd: 0,
  }),
  createSettlementScheduler({
    positions,
    periodMs: 60 * 60 * 1000, // hourly — matches periodSeconds=3600
    onchain,
    execution,
  }),
]);
