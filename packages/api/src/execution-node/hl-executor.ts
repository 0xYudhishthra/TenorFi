// HL executor — signs + submits perp actions with the node's own agent wallet
// (HL_AGENT_PRIVATE_KEY). HL L1 actions have no EVM tx hash, so we return an
// order-id/status reference. Live signing is geoblocked from US — run this on the
// non-US node.

import { openPerpLong, topUpMargin } from "@keel/hyperliquid";
import type { Executor, PendingIntent } from "./node.js";

/** HL has no EVM tx hash — derive a stable reference from the response. */
function refOf(resp: unknown): string {
  const r = resp as
    | { status?: string; response?: { data?: { statuses?: Array<Record<string, { oid?: number }>> } } }
    | undefined;
  const s = r?.response?.data?.statuses?.[0];
  const oid = s?.resting?.oid ?? s?.filled?.oid;
  if (oid != null) return `hl:oid:${oid}`;
  if (r?.status) return `hl:${r.status}`;
  return "hl:ok";
}

export function createHlExecutor(): Executor {
  return async (intent: PendingIntent): Promise<{ txHash?: string; error?: string }> => {
    try {
      const params = (intent.params ?? {}) as {
        amountUsd?: number;
        usdNotional?: number;
        leverage?: number;
      };
      switch (intent.kind) {
        case "openPerp": {
          const r = await openPerpLong({
            market: intent.market,
            usdNotional: params.usdNotional ?? 0,
            leverage: params.leverage ?? 1,
          });
          return { txHash: refOf(r) };
        }
        case "topUpMargin": {
          const r = await topUpMargin({ market: intent.market, usdc: params.amountUsd ?? 0 });
          return { txHash: refOf(r) };
        }
        default:
          return { error: `unknown intent kind: ${intent.kind}` };
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
}
