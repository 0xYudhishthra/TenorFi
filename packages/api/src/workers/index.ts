// Background workers — the "automatic brain": they decide WHEN something must
// happen (refresh funding, advance a landed bridge, flag a due settlement, queue
// a top-up). The execution node is the only piece that signs.

import type { Worker } from "./loop.js";

export * from "./loop.js";
export * from "./funding-poller.js";
export * from "./bridge-watcher.js";
export * from "./rebalance-monitor.js";
export * from "./settlement-scheduler.js";

/** Start every worker; returns a stop-all handle. */
export function startWorkers(workers: Worker[]): () => void {
  for (const w of workers) w.start();
  return () => {
    for (const w of workers) w.stop();
  };
}
