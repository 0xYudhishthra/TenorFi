// Shared test composition root: a real app wired to live HL/LI.FI services and a
// throwaway :memory: db. One place to update when AppDeps grows, so per-batch
// tests don't each need editing. Not a test file (no *.test.ts match).

import { createTransport } from "@keel/hyperliquid";
import { CHAINS } from "@keel/lifi";
import { createFundingService } from "../core/services/funding.js";
import { createHedgeService } from "../core/services/hedge.js";
import { createPositionService } from "../core/services/position.js";
import { createSettleService } from "../core/services/settle.js";
import { createRebalanceService } from "../core/services/rebalance.js";
import { createExecutionService } from "../core/services/execution.js";
import { createPositionRepo } from "../core/repos/positions.js";
import { createExecutionRepo } from "../core/repos/execution.js";
import { createDb } from "../core/repos/db.js";
import { createApp } from "./app.js";

/** Build a fresh app (new :memory: db) backed by real services. No stubs. */
export function makeTestApp() {
  const transport = createTransport("mainnet");
  const db = createDb(":memory:");
  const funding = createFundingService({ transport });
  const positions = createPositionService(createPositionRepo(db));
  return createApp({
    network: "mainnet",
    funding,
    // No keelTarget → open leg skipped (KeelSwap not deployed).
    hedge: createHedgeService({ keelChain: CHAINS.base }),
    positions,
    settle: createSettleService(funding),
    rebalance: createRebalanceService({ transport }),
    execution: createExecutionService(createExecutionRepo(db), positions),
  });
}
