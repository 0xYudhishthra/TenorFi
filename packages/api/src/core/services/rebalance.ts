// rebalance service — reads live Hyperliquid account margin and decides whether
// the HL perp needs a top-up (Flow 2). Read-only and public: it never signs. The
// produced intent is what the execution node later signs and submits.

import { getAccountState } from "@keel/hyperliquid";
import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";
import { createTransport } from "@keel/hyperliquid";

type HlTransport = ReturnType<typeof createTransport>;

export interface RebalanceParams {
  /** HL account to inspect (the hedger's account). */
  address: `0x${string}`;
  /** Perp market the top-up margin applies to. */
  market: string;
  /** Below this account value (USD) a top-up is triggered. */
  thresholdUsd: number;
  /** Top up back to this account value (USD). */
  targetUsd: number;
}

/** What the execution node would sign to top up HL isolated margin. */
export interface ExecutionIntent {
  kind: "topUpMargin";
  market: string;
  amountUsd: number;
}

export interface RebalanceAssessment {
  address: `0x${string}`;
  market: string;
  accountValueUsd: number;
  marginUsedUsd: number;
  thresholdUsd: number;
  targetUsd: number;
  needsTopUp: boolean;
  topUpUsd: number;
  intent: ExecutionIntent | null;
}

export interface RebalanceService {
  assess(params: RebalanceParams): Promise<Result<RebalanceAssessment, KeelError>>;
}

export function createRebalanceService(opts: {
  transport: HlTransport;
}): RebalanceService {
  return {
    async assess(params) {
      let accountValueUsd: number;
      let marginUsedUsd: number;
      try {
        const state = await getAccountState(params.address, opts.transport);
        accountValueUsd = Number(state.marginSummary.accountValue);
        marginUsedUsd = Number(state.marginSummary.totalMarginUsed);
      } catch (cause) {
        return err(
          keelError("EXCHANGE_FAILED", "failed to read HL account state", {
            address: params.address,
          }, cause),
        );
      }

      const needsTopUp = accountValueUsd < params.thresholdUsd;
      const topUpUsd = needsTopUp
        ? Math.max(0, params.targetUsd - accountValueUsd)
        : 0;

      return ok({
        address: params.address,
        market: params.market,
        accountValueUsd,
        marginUsedUsd,
        thresholdUsd: params.thresholdUsd,
        targetUsd: params.targetUsd,
        needsTopUp,
        topUpUsd,
        intent: needsTopUp
          ? { kind: "topUpMargin", market: params.market, amountUsd: topUpUsd }
          : null,
      });
    },
  };
}
