// funding-poller — refreshes the funding cache for tracked markets so HTTP/MCP
// reads are warm and downstream conditions (settlement, rebalance) see fresh data.

import { intervalWorker, type Worker } from "./loop.js";
import type { FundingService } from "../core/services/funding.js";

export function createFundingPoller(deps: {
  funding: FundingService;
  markets: string[];
  intervalMs?: number;
}): Worker {
  const { funding, markets, intervalMs = 30_000 } = deps;
  return intervalWorker("funding-poller", async () => {
    await Promise.all(markets.map((m) => funding.getFunding(m)));
  }, intervalMs);
}
