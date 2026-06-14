// rebalance-monitor — for each OPEN position, checks HL margin and enqueues a
// top-up intent when it drops below threshold (Flow 2). Skips positions that
// already have a pending top-up so it doesn't queue duplicates.

import { intervalWorker, type Worker } from "./loop.js";
import type { PositionService } from "../core/services/position.js";
import type { RebalanceService } from "../core/services/rebalance.js";
import type { ExecutionService } from "../core/services/execution.js";

export function createRebalanceMonitor(deps: {
  positions: PositionService;
  rebalance: RebalanceService;
  execution: ExecutionService;
  thresholdUsd: number;
  targetUsd: number;
  intervalMs?: number;
}): Worker {
  const { positions, rebalance, execution, thresholdUsd, targetUsd, intervalMs = 60_000 } = deps;
  return intervalWorker("rebalance-monitor", async () => {
    const pending = execution.pending();
    for (const pos of positions.list()) {
      if (pos.status !== "OPEN") continue;
      const hasPending = pending.some(
        (i) => i.positionId === pos.id && i.kind === "topUpMargin",
      );
      if (hasPending) continue;

      const assessment = await rebalance.assess({
        address: pos.hedger,
        market: pos.market,
        thresholdUsd,
        targetUsd,
      });
      if (assessment.ok && assessment.value.intent) {
        execution.enqueue({
          positionId: pos.id,
          kind: assessment.value.intent.kind,
          market: assessment.value.intent.market,
          params: { amountUsd: assessment.value.intent.amountUsd },
        });
      }
    }
  }, intervalMs);
}
