import { InfoClient, type HttpTransport } from "@nktkas/hyperliquid";
import { createTransport } from "./config.js";

/** Current perp funding + price snapshot for a market, with rates parsed to numbers. */
export interface FundingInfo {
  market: string;
  /** Current funding rate for the period (hourly on Hyperliquid), as a fraction. */
  funding: number;
  markPx: number;
  oraclePx: number;
  /** Mark-vs-oracle premium; `null` when the venue reports none. */
  premium: number | null;
  openInterest: number;
}

/**
 * Read the current funding + prices for a perp market (e.g. "BTC").
 * This is the number Chainlink CRE will publish on-chain as the funding index.
 */
export async function getFunding(
  market: string,
  transport: HttpTransport = createTransport(),
): Promise<FundingInfo> {
  const info = new InfoClient({ transport });
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const i = meta.universe.findIndex((u) => u.name === market);
  if (i < 0) throw new Error(`market not found on Hyperliquid: ${market}`);
  const c = ctxs[i];
  return {
    market,
    funding: Number(c.funding),
    markPx: Number(c.markPx),
    oraclePx: Number(c.oraclePx),
    premium: c.premium === null ? null : Number(c.premium),
    openInterest: Number(c.openInterest),
  };
}

/** One historical funding observation for a market (Hyperliquid funds hourly). */
export interface FundingHistoryEntry {
  market: string;
  /** Funding rate for that hour, as a fraction. */
  fundingRate: number;
  premium: number;
  /** Unix epoch millis of the observation. */
  time: number;
}

/**
 * Historical funding rates for a perp market since `startTime` (epoch millis).
 * Feeds the settlement math: realized funding accrued over a swap period.
 */
export async function getFundingHistory(
  market: string,
  startTime: number,
  endTime?: number,
  transport: HttpTransport = createTransport(),
): Promise<FundingHistoryEntry[]> {
  const info = new InfoClient({ transport });
  const rows = await info.fundingHistory({
    coin: market,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
  });
  return rows.map((r) => ({
    market: r.coin,
    fundingRate: Number(r.fundingRate),
    premium: Number(r.premium),
    time: r.time,
  }));
}

/** Full clearinghouse state for an account: margin summary, positions, withdrawable. */
export async function getAccountState(
  address: `0x${string}`,
  transport: HttpTransport = createTransport(),
) {
  const info = new InfoClient({ transport });
  return info.clearinghouseState({ user: address });
}

/** Open perp positions for an account. */
export async function getPositions(
  address: `0x${string}`,
  transport: HttpTransport = createTransport(),
) {
  const state = await getAccountState(address, transport);
  return state.assetPositions;
}
