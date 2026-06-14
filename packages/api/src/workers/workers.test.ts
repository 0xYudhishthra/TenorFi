// Worker ticks against real services: live HL reads, real LI.FI bridge status,
// real SQLite. Positions are created via the service (workers operate on services,
// not HTTP), so no LI.FI quote latency — these run fast.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "@keel/hyperliquid";
import { getBridgeStatus } from "@keel/lifi";
import { createDb } from "../core/repos/db.js";
import { createPositionRepo } from "../core/repos/positions.js";
import { createExecutionRepo } from "../core/repos/execution.js";
import { createFundingService } from "../core/services/funding.js";
import { createPositionService, type PositionService } from "../core/services/position.js";
import { createRebalanceService } from "../core/services/rebalance.js";
import { createExecutionService } from "../core/services/execution.js";
import type { PositionStatus } from "../core/domain/position.js";
import {
  createFundingPoller,
  createBridgeWatcher,
  createRebalanceMonitor,
  createSettlementScheduler,
} from "./index.js";

const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";
// The real, completed Base→HyperCore deposit (status DONE on LI.FI).
const DONE_TX = "0x80fddfa985cf81ec3f4f988e8df057bd365b03ab092cefab09ba72c960fe21e7";

function services() {
  const db = createDb(":memory:");
  const transport = createTransport("mainnet");
  const positions = createPositionService(createPositionRepo(db));
  return {
    positions,
    funding: createFundingService({ transport }),
    rebalance: createRebalanceService({ transport }),
    execution: createExecutionService(createExecutionRepo(db), positions),
  };
}

function openPosition(positions: PositionService, quote: unknown = null): string {
  const r = positions.openHedge({
    market: "BTC",
    hedger: FROM,
    fromChain: 8453,
    perpCollateralUsd: "5",
    keelCollateralUsd: "5",
    quote,
  });
  assert.ok(r.ok);
  return r.value.id;
}

function walkTo(positions: PositionService, id: string, path: PositionStatus[]) {
  for (const s of path) {
    const r = positions.transition(id, s);
    assert.ok(r.ok, `transition to ${s}`);
  }
}

test("funding-poller warms the cache from live HL", async () => {
  const { funding } = services();
  await createFundingPoller({ funding, markets: ["BTC"] }).tick();
  const r = await funding.getFunding("BTC");
  assert.ok(r.ok);
  assert.ok(r.value.markPx > 0);
});

test("bridge-watcher advances a landed deposit to DEPOSIT_DONE", async () => {
  const { positions } = services();
  const id = openPosition(positions, {
    deposit: { tool: "relaydepository", action: { fromChainId: 8453, toChainId: 1337 } },
  });
  positions.transition(id, "DEPOSIT_PENDING", { type: "confirm-tx", txHash: DONE_TX });

  await createBridgeWatcher({ positions, status: getBridgeStatus }).tick();

  const pos = positions.get(id);
  assert.ok(pos.ok);
  assert.equal(pos.value.status, "DEPOSIT_DONE");
});

test("rebalance-monitor enqueues a top-up for an under-margined OPEN position", async () => {
  const { positions, rebalance, execution } = services();
  const id = openPosition(positions);
  walkTo(positions, id, ["DEPOSIT_PENDING", "DEPOSIT_DONE", "PERP_PENDING", "OPEN"]);

  const monitor = createRebalanceMonitor({
    positions,
    rebalance,
    execution,
    thresholdUsd: 1_000_000,
    targetUsd: 1_000_000,
  });
  await monitor.tick();

  const pending = execution.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].positionId, id);
  assert.equal(pending[0].kind, "topUpMargin");

  // Idempotent: a pending intent already exists, so no duplicate is queued.
  await monitor.tick();
  assert.equal(execution.pending().length, 1);
});

test("settlement-scheduler flags a due settlement on an OPEN position", async () => {
  const { positions } = services();
  const id = openPosition(positions);
  walkTo(positions, id, ["DEPOSIT_PENDING", "DEPOSIT_DONE", "PERP_PENDING", "OPEN"]);

  await createSettlementScheduler({ positions, periodMs: 0 }).tick();

  assert.ok(positions.events(id).some((e) => e.type === "settlement-due"));
});
