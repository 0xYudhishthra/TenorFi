// funding service — cached reads of Hyperliquid funding + period-rate helpers.
// Read-only and public, so this layer is safe to run from anywhere (no geoblock).

import {
  getFunding,
  getFundingHistory,
  createTransport,
  type FundingInfo,
  type FundingHistoryEntry,
} from "@keel/hyperliquid";
import { ok, err, type Result } from "../domain/result.js";

/** Transport type derived from @keel/hyperliquid — avoids a direct SDK dep. */
type HlTransport = ReturnType<typeof createTransport>;
import { keelError, type KeelError } from "../domain/errors.js";

/** Hyperliquid funds hourly → 24 * 365 periods per year. */
export const HL_PERIODS_PER_YEAR = 24 * 365;

/** Convert an annualized rate to Hyperliquid's per-period (hourly) rate. */
export function annualizedToPerPeriod(
  annualized: number,
  periodsPerYear = HL_PERIODS_PER_YEAR,
): number {
  return annualized / periodsPerYear;
}

/** Convert a per-period (hourly) rate to its annualized equivalent. */
export function perPeriodToAnnualized(
  perPeriod: number,
  periodsPerYear = HL_PERIODS_PER_YEAR,
): number {
  return perPeriod * periodsPerYear;
}

export interface FundingSnapshot extends FundingInfo {
  /** Current funding rate annualized, for display. */
  annualized: number;
  /** When this snapshot was read (epoch millis). */
  fetchedAt: number;
}

export interface FundingService {
  getFunding(market: string): Promise<Result<FundingSnapshot, KeelError>>;
  getFundingHistory(
    market: string,
    startTime: number,
    endTime?: number,
  ): Promise<Result<FundingHistoryEntry[], KeelError>>;
}

export interface FundingServiceOptions {
  transport: HlTransport;
  /** Cache TTL for current-funding reads, in millis. Default 10s. */
  cacheTtlMs?: number;
}

/**
 * Build the funding service. Current-funding reads are cached per market for a
 * short TTL so bursts (UI + workers) don't hammer Hyperliquid; history is not
 * cached (callers pass explicit time windows).
 */
export function createFundingService(
  opts: FundingServiceOptions,
): FundingService {
  const { transport, cacheTtlMs = 10_000 } = opts;
  const cache = new Map<string, FundingSnapshot>();

  return {
    async getFunding(market) {
      const cached = cache.get(market);
      if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
        return ok(cached);
      }
      try {
        const info = await getFunding(market, transport);
        const snapshot: FundingSnapshot = {
          ...info,
          annualized: perPeriodToAnnualized(info.funding),
          fetchedAt: Date.now(),
        };
        cache.set(market, snapshot);
        return ok(snapshot);
      } catch (cause) {
        return err(
          keelError(
            "EXCHANGE_FAILED",
            `failed to read funding for ${market}`,
            { market },
            cause,
          ),
        );
      }
    },

    async getFundingHistory(market, startTime, endTime) {
      try {
        const rows = await getFundingHistory(
          market,
          startTime,
          endTime,
          transport,
        );
        return ok(rows);
      } catch (cause) {
        return err(
          keelError(
            "EXCHANGE_FAILED",
            `failed to read funding history for ${market}`,
            { market, startTime, endTime },
            cause,
          ),
        );
      }
    },
  };
}
