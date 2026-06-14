// settlement-scheduler — flags OPEN positions whose settlement period has elapsed
// by noting a "settlement-due" event (which streams over SSE). The actual net is
// computed by the settle service / KeelSwap when the terms are wired.

import { intervalWorker, type Worker } from "./loop.js";
import type { PositionService } from "../core/services/position.js";

export function createSettlementScheduler(deps: {
  positions: PositionService;
  /** How long a settlement period lasts (ms). */
  periodMs: number;
  intervalMs?: number;
}): Worker {
  const { positions, periodMs, intervalMs = 60_000 } = deps;
  return intervalWorker("settlement-scheduler", async () => {
    const now = Date.now();
    for (const pos of positions.list()) {
      if (pos.status !== "OPEN") continue;
      const lastDue = [...positions.events(pos.id)]
        .reverse()
        .find((e) => e.type === "settlement-due");
      const since = lastDue ? lastDue.at : pos.createdAt;
      if (now - since >= periodMs) {
        positions.note(pos.id, { type: "settlement-due", detail: { periodMs } });
      }
    }
  }, intervalMs);
}
