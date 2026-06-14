// settlement-scheduler — for each OPEN position whose hourly period has elapsed,
// settles the current period ON-CHAIN by driving the proven Settle.s.sol script
// (via the onchain settler). It persists the settled period/direction/amount on
// the position timeline, and — on a COVERAGE period (R>F, the reserve paid the
// subscriber) — enqueues a `topUpMargin` ExecutionIntent so the execution node
// tops up the subscriber's Hyperliquid isolated margin with the coverage USDC.
//
// Dry-run safe: when no onchain settler is wired (no keeper key / RPC), it keeps
// the legacy behavior — noting a "settlement-due" event that streams over SSE.

import { intervalWorker, type Worker } from "./loop.js";
import type { PositionService } from "../core/services/position.js";
import type { OnchainSettleService } from "../core/services/onchain-settle.js";
import type { ExecutionService } from "../core/services/execution.js";

export function createSettlementScheduler(deps: {
  positions: PositionService;
  /** How long a settlement period lasts (ms). */
  periodMs: number;
  /** Optional on-chain settler. Absent → legacy "settlement-due" note only. */
  onchain?: OnchainSettleService;
  /** Execution queue — required to enqueue the coverage top-up. */
  execution?: ExecutionService;
  intervalMs?: number;
}): Worker {
  const { positions, periodMs, onchain, execution, intervalMs = 60_000 } = deps;

  return intervalWorker("settlement-scheduler", async () => {
    const now = Date.now();
    for (const pos of positions.list()) {
      if (pos.status !== "OPEN") continue;

      const lastDue = [...positions.events(pos.id)]
        .reverse()
        .find((e) => e.type === "settlement-due" || e.type === "settled");
      const since = lastDue ? lastDue.at : pos.createdAt;
      if (now - since < periodMs) continue;

      // No on-chain settler wired → legacy behavior (flag due, settle off-band).
      if (!onchain) {
        positions.note(pos.id, { type: "settlement-due", detail: { periodMs } });
        continue;
      }

      // Drive the proven Settle.s.sol for the current hourly period.
      const result = await onchain.settle(pos);

      if (!result.ok) {
        positions.note(pos.id, {
          type: "settle-failed",
          detail: { error: result.error, command: result.command },
        });
        continue;
      }

      // Persist the settlement outcome on the timeline (also feeds SSE).
      positions.note(pos.id, {
        type: "settled",
        txHash: result.txHash,
        detail: {
          period: result.period,
          direction: result.direction,
          amountUsdc: result.amountUsdc.toString(),
          realized: result.realized?.toString() ?? null,
          simulated: result.simulated,
          command: result.command,
        },
      });

      // THE NEW EDGE: a coverage period means the reserve paid the subscriber
      // (R>F). Top up the subscriber's HL isolated margin with that coverage.
      // Premium periods (R<F) take the subscriber's USDC — no top-up there.
      if (result.direction === "coverage" && result.amountUsdc > 0n && execution) {
        // USDC base units (1e6) → USD float for the HL action.
        const amountUsd = Number(result.amountUsdc) / 1e6;
        execution.enqueue({
          positionId: pos.id,
          kind: "topUpMargin",
          market: pos.market,
          params: { amountUsd },
        });
      }
    }
  }, intervalMs);
}
