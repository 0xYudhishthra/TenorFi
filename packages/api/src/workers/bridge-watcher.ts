// bridge-watcher — polls LI.FI for in-flight deposits. When the bridge to
// HyperCore completes, advances the position DEPOSIT_PENDING → DEPOSIT_DONE.

import { intervalWorker, type Worker } from "./loop.js";
import type { classic } from "@keel/lifi";
import type { PositionService } from "../core/services/position.js";

type StatusFn = (
  params: classic.BridgeStatusParams,
) => Promise<{ status: classic.BridgeStatus; substatus?: string }>;

interface DepositLeg {
  tool?: string;
  action?: { fromChainId: number; toChainId: number };
}

export function createBridgeWatcher(deps: {
  positions: PositionService;
  status: StatusFn;
  intervalMs?: number;
}): Worker {
  const { positions, status, intervalMs = 10_000 } = deps;
  return intervalWorker("bridge-watcher", async () => {
    for (const pos of positions.list()) {
      if (pos.status !== "DEPOSIT_PENDING") continue;

      const txEvent = [...positions.events(pos.id)].reverse().find((e) => e.txHash);
      const deposit = (pos.quote as { deposit?: DepositLeg } | null)?.deposit;
      if (!txEvent?.txHash || !deposit?.action) continue;

      const res = await status({
        txHash: txEvent.txHash as `0x${string}`,
        fromChain: deposit.action.fromChainId,
        toChain: deposit.action.toChainId,
        bridge: deposit.tool,
      });
      if (res.status === "DONE") {
        positions.transition(pos.id, "DEPOSIT_DONE", {
          type: "bridge-done",
          txHash: txEvent.txHash,
        });
      }
    }
  }, intervalMs);
}
