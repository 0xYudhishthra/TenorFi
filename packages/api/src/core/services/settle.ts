// settle service — settlement math for a swap period. Discrete per hourly period:
// each period's net = clamp(realized − fixed, ±cap); the settlement is the sum
// over the window times notional. Realized funding comes from live HL history.

import { ok, err, type Result } from "../domain/result.js";
import { keelError, type KeelError } from "../domain/errors.js";
import { annualizedToPerPeriod, type FundingService } from "./funding.js";

/** Default per-period cap (matches the locked KeelSwap decision: 0.04). */
export const DEFAULT_CAP = 0.04;

export interface SettleParams {
  market: string;
  /** Period window, epoch millis. */
  startTime: number;
  endTime: number;
  /** Fixed leg rate, annualized (e.g. 0.10 = 10%). */
  fixedRateAnnualized: number;
  /** Swap notional in USD. */
  notionalUsd: number;
  /** Per-period clamp on net. Defaults to {@link DEFAULT_CAP}. */
  cap?: number;
}

export interface Settlement {
  market: string;
  startTime: number;
  endTime: number;
  /** Number of hourly funding periods in the window. */
  periods: number;
  fixedRatePerPeriod: number;
  /** Σ realized hourly funding over the window (fraction). */
  realizedFraction: number;
  /** Fixed leg over the window (fraction). */
  fixedFraction: number;
  /** Σ clamp(realized − fixed, ±cap) over the window (fraction). */
  netFraction: number;
  cap: number;
  /** net × notional, in USD. Positive → hedger receives. */
  settlementUsd: number;
  /** Prepared settlement tx. target/data stay null until KeelSwap is deployed. */
  tx: { target: string | null; data: string | null; note: string };
}

export interface SettleService {
  prepare(params: SettleParams): Promise<Result<Settlement, KeelError>>;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function createSettleService(
  funding: FundingService,
  opts: { keelTarget?: `0x${string}` } = {},
): SettleService {
  return {
    async prepare(params) {
      const cap = params.cap ?? DEFAULT_CAP;
      const history = await funding.getFundingHistory(
        params.market,
        params.startTime,
        params.endTime,
      );
      if (!history.ok) return err(history.error);

      const rows = history.value;
      if (rows.length === 0) {
        return err(
          keelError("VALIDATION_FAILED", "no funding history in window", {
            market: params.market,
            startTime: params.startTime,
            endTime: params.endTime,
          }),
        );
      }

      const fixedPerPeriod = annualizedToPerPeriod(params.fixedRateAnnualized);
      let realizedFraction = 0;
      let netFraction = 0;
      for (const r of rows) {
        realizedFraction += r.fundingRate;
        netFraction += clamp(r.fundingRate - fixedPerPeriod, -cap, cap);
      }
      const fixedFraction = fixedPerPeriod * rows.length;

      return ok({
        market: params.market,
        startTime: params.startTime,
        endTime: params.endTime,
        periods: rows.length,
        fixedRatePerPeriod: fixedPerPeriod,
        realizedFraction,
        fixedFraction,
        netFraction,
        cap,
        settlementUsd: netFraction * params.notionalUsd,
        tx: {
          target: opts.keelTarget ?? null,
          data: null,
          note: opts.keelTarget
            ? "settlement calldata pending KeelSwap integration"
            : "KEELSWAP_ADDRESS_BASE not configured",
        },
      });
    },
  };
}
