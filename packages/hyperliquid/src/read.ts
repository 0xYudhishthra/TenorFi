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
