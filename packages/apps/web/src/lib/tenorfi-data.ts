/* ============================================================================
   TENORFI — mock data + formatting helpers (explorer / create-position)
   Ported from the design bundle's tenorfi-data.js. All data is illustrative;
   addresses & hashes are valid-shaped but fake. Deterministic (SSR-safe).
   NOTE: user-facing label for a position record is "Position" (never "swap").
   ============================================================================ */

export interface Offer {
  id: string;
  fixedRate: number;
  maxCoverage: number;
  tenor: number;
  note: string;
}

export interface Position {
  id: number;
  hedger: string;
  lp: string;
  notional: number;
  fixedRate: number;
  status: "active" | "closed";
  startedAt: string;
  hedgerCollateral: number;
  lpCollateral: number;
  maxCollateral: number;
}

export interface Settlement {
  positionId: number;
  period: number;
  afr: number;
  netPayment: number;
  payer: "Hedger" | "LP";
  receiver: "Hedger" | "LP";
  from: string;
  to: string;
  amount: number;
  txHash: string;
  block: number;
  ageSec: number;
}

export const OFFERS: Offer[] = [
  { id: "OF-01", fixedRate: 10.0, maxCoverage: 20000, tenor: 30, note: "Balanced" },
  { id: "OF-02", fixedRate: 8.5, maxCoverage: 10000, tenor: 30, note: "Conservative" },
  { id: "OF-03", fixedRate: 12.0, maxCoverage: 40000, tenor: 30, note: "Wide cap" },
  { id: "OF-04", fixedRate: 9.2, maxCoverage: 15000, tenor: 7, note: "Short tenor" },
  { id: "OF-05", fixedRate: 11.4, maxCoverage: 50000, tenor: 90, note: "Long tenor" },
];

const A = {
  h1: "0x7a3f9C21b4E8d6F05a1C9e2B7d4F38a0C5e1B6d2",
  h2: "0x2D8e4Ab1F7c39E05B6a1d8C4f20E93b7A5c6D1e4",
  h3: "0x9F1c0B7a52E84d6C3b1A9e0f7D2c485B6a3E1d09",
  lp1: "0x4b2C9d1EaA2bB3cC4dD5eE6fF7a8B9c0D1e2F30",
  lp2: "0x5C3a1F8b07D2e94A6c1B8d05f3E27a9C4b6D1e80",
  lp3: "0x8A2d6C0b9E14f7A35c2B1d80e6F49a7C3b5D2e10",
};

export const POSITIONS: Position[] = [
  { id: 42, hedger: A.h1, lp: A.lp1, notional: 50000, fixedRate: 10.0, status: "active", startedAt: "2026-05-28", hedgerCollateral: 1640, lpCollateral: 1820, maxCollateral: 2000 },
  { id: 41, hedger: A.h2, lp: A.lp1, notional: 25000, fixedRate: 8.5, status: "active", startedAt: "2026-05-30", hedgerCollateral: 720, lpCollateral: 940, maxCollateral: 1000 },
  { id: 40, hedger: A.h3, lp: A.lp2, notional: 120000, fixedRate: 12.0, status: "active", startedAt: "2026-06-01", hedgerCollateral: 980, lpCollateral: 4600, maxCollateral: 4800 },
  { id: 39, hedger: A.h1, lp: A.lp3, notional: 18000, fixedRate: 9.2, status: "active", startedAt: "2026-06-03", hedgerCollateral: 690, lpCollateral: 710, maxCollateral: 720 },
  { id: 38, hedger: A.h2, lp: A.lp2, notional: 75000, fixedRate: 11.4, status: "closed", startedAt: "2026-04-12", hedgerCollateral: 0, lpCollateral: 0, maxCollateral: 3000 },
  { id: 37, hedger: A.h3, lp: A.lp1, notional: 32000, fixedRate: 10.6, status: "closed", startedAt: "2026-04-02", hedgerCollateral: 0, lpCollateral: 0, maxCollateral: 1280 },
  { id: 36, hedger: A.h1, lp: A.lp3, notional: 9000, fixedRate: 7.8, status: "closed", startedAt: "2026-03-21", hedgerCollateral: 0, lpCollateral: 0, maxCollateral: 360 },
  { id: 35, hedger: A.h2, lp: A.lp2, notional: 64000, fixedRate: 13.1, status: "active", startedAt: "2026-06-06", hedgerCollateral: 2400, lpCollateral: 2520, maxCollateral: 2560 },
];

function hsh(seed: number): string {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 64; i++) s += hex[Math.floor((seed * (i + 7) * 31 + i * 13) % 16)];
  return s;
}

export const SETTLEMENTS: Settlement[] = [42, 40, 35, 41, 39, 42, 40, 35, 41, 42].map(
  (sid, idx) => {
    const pos = POSITIONS.find((s) => s.id === sid)!;
    const afr = 6 + Math.abs(Math.sin(idx * 1.7)) * 38;
    const credit = afr > pos.fixedRate;
    const net = Math.round((Math.abs(afr - pos.fixedRate) / 100 / 24) * pos.notional);
    return {
      positionId: sid,
      period: 120 - idx,
      afr: +afr.toFixed(1),
      netPayment: net,
      payer: credit ? "LP" : "Hedger",
      receiver: credit ? "Hedger" : "LP",
      from: credit ? pos.lp : pos.hedger,
      to: credit ? pos.hedger : pos.lp,
      amount: net,
      txHash: hsh(sid + idx + 3),
      block: 28490000 - idx * 11,
      ageSec: 40 + idx * 95,
    };
  }
);

export const FUNDING24H = Array.from({ length: 24 }, (_, i) => {
  const base =
    22 + Math.sin(i * 0.7) * 12 + Math.sin(i * 1.9) * 6 + (i > 17 ? -(i - 17) * 2.5 : 0);
  return { hour: i, afr: +Math.max(3, base).toFixed(1) };
});

export const STATS = {
  activePositions: POSITIONS.filter((s) => s.status === "active").length,
  totalNotional: POSITIONS.reduce((a, s) => a + s.notional, 0),
  settlements: 1284,
  currentAFR: FUNDING24H[FUNDING24H.length - 1].afr,
};

/* ---- formatters ---- */
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function fmtUSD(n: number): string {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return "$" + n.toLocaleString("en-US");
}
export const fmtUSDfull = (n: number) => "$" + n.toLocaleString("en-US");
export const fmtPct = (n: number) => n.toFixed(1) + "%";
export function ago(sec: number): string {
  if (sec < 60) return sec + "s ago";
  if (sec < 3600) return Math.floor(sec / 60) + "m ago";
  return Math.floor(sec / 3600) + "h ago";
}

/* ============================================================================
   FUNDING COST BREAKDOWN — the core value prop.
   For each settlement period we compare:
     - what Hyperliquid funding would have cost the holder UNHEDGED ("HL charged")
     - what the TenorFi swap settled for that period ("TenorFi net")
     - the holder's resulting REAL cost — the fixed rate, constant every period.
   All numbers are derived from the mock FUNDING24H series + the position's
   notional and fixed rate. To wire to live data later, replace the
   `realizedHourlyRates()` source with the keel-api `/funding` endpoint
   (realized hourly funding rate per hour) — the math below stays identical.
   ============================================================================ */

// Annualize an hourly funding rate (as a %) → APR %. hourly × 24 × 365.
export const hourlyToApr = (hourlyPct: number) => hourlyPct * 24 * 365;
// USD charged/credited for one hour at an hourly rate (%) on a notional.
const hourlyUsd = (hourlyPct: number, notional: number) =>
  (hourlyPct / 100) * notional;

// Mock source: realized hourly funding rate (%) per period.
// NOTE: derived from FUNDING24H (annualized AFR) → hourly. Wire this to the
// keel-api `/funding` endpoint (realized hourly rate per hour) to go live.
// `anchorApr` (the position's fixed rate) is used only to spread the sampled
// funding around the fixed line so the demo shows BOTH credit periods
// (realized > fixed) and small-premium periods (realized < fixed). The live
// `/funding` feed already carries real variance, so this spread drops away.
function realizedHourlyRates(count: number, anchorApr: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const afrApr = FUNDING24H[i % FUNDING24H.length].afr; // annualized %
    // Recenter the sampled AFR near the fixed rate, keeping its hour-to-hour
    // shape, so realized funding crosses above and below the fixed line.
    const meanAfr = 24; // approx mean of FUNDING24H
    const spread = 0.55; // dampen amplitude → realistic period-to-period drift
    const recentered = anchorApr + (afrApr - meanAfr) * spread;
    const variableApr = Math.max(0.5, recentered); // funding APR floor
    return variableApr / (24 * 365); // → realized hourly %
  });
}

export interface FundingBreakdownRow {
  period: number; // 1-indexed hour
  hlAprPct: number; // variable HL funding APR for this period
  hlUsd: number; // HL funding cost this period (USD, positive magnitude)
  netAprPct: number; // TenorFi net APR (signed: + = credit to holder)
  netUsd: number; // TenorFi net USD (signed)
  realAprPct: number; // holder's real cost APR (= fixed rate, constant)
  realUsd: number; // holder's real cost USD (= fixed hourly, constant)
}

/**
 * Per-period funding cost comparison for a position.
 * Invariant (signed, in USD): hlUsd_signed + netUsd = realUsd_signed, where
 *   hlUsd_signed = -hlUsd (a cost) and realUsd_signed = -realUsd (a cost).
 * Equivalently: hlUsd + netUsd_as_cost == realUsd. We expose hlUsd as a
 * positive magnitude (rendered as a cost) and netUsd signed.
 */
export function fundingBreakdown(
  position: Position,
  periods = 6
): FundingBreakdownRow[] {
  const fixedHourlyPct = position.fixedRate / (24 * 365); // fixed APR → hourly %
  const fixedUsd = hourlyUsd(fixedHourlyPct, position.notional);
  const rates = realizedHourlyRates(periods, position.fixedRate);

  return rates.map((realizedHourlyPct, i) => {
    const hlUsd = hourlyUsd(realizedHourlyPct, position.notional); // variable cost
    // TenorFi settles realized − fixed. If realized > fixed → credit (+); else premium (−).
    const netUsd = hlUsd - fixedUsd; // signed
    const netAprPct = hourlyToApr(realizedHourlyPct - fixedHourlyPct); // signed
    return {
      period: i + 1,
      hlAprPct: hourlyToApr(realizedHourlyPct),
      hlUsd,
      netAprPct,
      netUsd,
      realAprPct: position.fixedRate, // constant every period
      realUsd: fixedUsd, // constant every period
    };
  });
}

/* ============================================================================
   POSITION FEES — estimated open/close cost (no live fee feed).
   Model: bps-of-notional for the routing/unwind legs + a flat gas estimate.
   Clearly an ESTIMATE; replace with live quotes (LI.FI / Aqua) when wired.
   ============================================================================ */
const OPEN_BRIDGE_BPS = 6; // LI.FI cross-chain routing, bps of notional
const OPEN_SHIP_BPS = 2; // Aqua ship into virtual balance, bps of notional
const CLOSE_UNWIND_BPS = 4; // unwind both legs, bps of notional
const GAS_FLAT_USD = 1.2; // flat gas estimate (Base mainnet), per action

export interface PositionFeeEstimate {
  openBridgeUsd: number;
  openShipUsd: number;
  openGasUsd: number;
  openTotalUsd: number;
  closeUnwindUsd: number;
  closeGasUsd: number;
  closeTotalUsd: number;
}

export function estimatePositionFees(notional: number): PositionFeeEstimate {
  const bps = (b: number) => (notional * b) / 10000;
  const openBridgeUsd = bps(OPEN_BRIDGE_BPS);
  const openShipUsd = bps(OPEN_SHIP_BPS);
  const closeUnwindUsd = bps(CLOSE_UNWIND_BPS);
  return {
    openBridgeUsd,
    openShipUsd,
    openGasUsd: GAS_FLAT_USD,
    openTotalUsd: openBridgeUsd + openShipUsd + GAS_FLAT_USD,
    closeUnwindUsd,
    closeGasUsd: GAS_FLAT_USD,
    closeTotalUsd: closeUnwindUsd + GAS_FLAT_USD,
  };
}

/* ---- fee formatters ---- */
// APR with sign, e.g. "+11.0%" / "−4.0%"
export const fmtAprSigned = (n: number) =>
  (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1) + "%";
// USD with sign and cents, e.g. "+$6.28" / "−$0.57"
export const fmtUsdSigned = (n: number) =>
  (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toFixed(2);
// USD with cents, no forced sign, e.g. "$8.56"
export const fmtUsdCents = (n: number) => "$" + n.toFixed(2);

/* ============================================================================
   LIVE-DATA ADAPTERS — keel-api → the mock-shaped structures above.
   These let the UI feed real numbers through the EXACT SAME math/rendering as
   the mock. Each adapter is pure (no fetch); the components fetch via
   `src/lib/api.ts` and pass results here, falling back to the mock on error.
   ============================================================================ */

import type {
  FundingHistoryEntry as ApiFundingHistoryEntry,
  FundingSnapshot as ApiFundingSnapshot,
  PositionSummary as ApiPositionSummary,
} from "./api";

/**
 * Live funding history (hourly fractions) → the FUNDING24H shape
 * (`{ hour, afr }`, afr = annualized funding rate in %). The API returns oldest-
 * first; we take the most recent `count` rows. Each row's hourly fraction is
 * annualized (× 24 × 365) and converted to a percent.
 */
export function fundingHistoryToAfr24h(
  history: ApiFundingHistoryEntry[],
  count = 24,
): { hour: number; afr: number }[] {
  const recent = history.slice(-count);
  return recent.map((row, i) => ({
    hour: i,
    afr: +(row.fundingRate * 24 * 365 * 100).toFixed(1),
  }));
}

/** Current annualized funding rate (%) from a live snapshot, for the AFR stat. */
export function snapshotToAfrPct(snapshot: ApiFundingSnapshot): number {
  return +(snapshot.annualized * 100).toFixed(1);
}

/**
 * Realized hourly funding rates (%) straight from live history — the live
 * replacement for `realizedHourlyRates`. Returns the most recent `count` hours.
 * Used by `fundingBreakdownLive` so the fee table runs on real funding.
 */
export function realizedHourlyRatesFromHistory(
  history: ApiFundingHistoryEntry[],
  count: number,
): number[] {
  return history.slice(-count).map((row) => row.fundingRate * 100);
}

/**
 * Live variant of `fundingBreakdown`: identical math, but the realized hourly
 * funding rates come from the keel-api `/funding/:market/history` feed instead
 * of the recentered mock series. The fee-table comparison
 * (HL-charged vs TenorFi-net vs your-real-cost) is unchanged.
 */
export function fundingBreakdownLive(
  position: Position,
  history: ApiFundingHistoryEntry[],
  periods = 6,
): FundingBreakdownRow[] {
  const rates = realizedHourlyRatesFromHistory(history, periods);
  if (rates.length === 0) return fundingBreakdown(position, periods);

  const fixedHourlyPct = position.fixedRate / (24 * 365);
  const fixedUsd = hourlyUsd(fixedHourlyPct, position.notional);

  return rates.map((realizedHourlyPct, i) => {
    const hlUsd = hourlyUsd(realizedHourlyPct, position.notional);
    const netUsd = hlUsd - fixedUsd;
    const netAprPct = hourlyToApr(realizedHourlyPct - fixedHourlyPct);
    return {
      period: i + 1,
      hlAprPct: hourlyToApr(realizedHourlyPct),
      hlUsd,
      netAprPct,
      netUsd,
      realAprPct: position.fixedRate,
      realUsd: fixedUsd,
    };
  });
}

/**
 * Map a live keel-api PositionSummary → the mock-shaped `Position` the explorer
 * UI renders. The on-chain position record doesn't carry a fixed rate or
 * notional in fiat terms (those are swap terms layered on later), so we derive
 * display-friendly values from the collateral fields, keeping the existing UI
 * contract intact. Numeric id is hashed from the string id for stable sorting.
 */
export function apiPositionToMock(p: ApiPositionSummary): Position {
  const perp = Number(p.perpCollateralUsd) || 0;
  const keel = Number(p.keelCollateralUsd) || 0;
  // Notional shown ≈ total collateral committed across both legs.
  const notional = Math.round(perp + keel);
  const active = !["CLOSED", "FAILED"].includes(p.status);
  // Stable small positive integer id from the string id for table sort/search.
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  const numId = h % 100000;
  const maxCollateral = Math.max(1, Math.round(keel));
  return {
    id: numId,
    hedger: p.hedger,
    lp: p.hedger, // single-actor model on-chain today; reuse hedger for LP slot.
    notional,
    fixedRate: 0, // no fixed-rate term on the raw position record yet.
    status: active ? "active" : "closed",
    startedAt: new Date(p.createdAt).toISOString().slice(0, 10),
    hedgerCollateral: active ? Math.round(perp) : 0,
    lpCollateral: active ? Math.round(keel) : 0,
    maxCollateral,
  };
}

/** Convenience: map a whole live list → mock-shaped positions. */
export function apiPositionsToMock(list: ApiPositionSummary[]): Position[] {
  return list.map(apiPositionToMock);
}

/* ---- lookups ---- */
export const getPosition = (id: number) => POSITIONS.find((p) => p.id === id);
export const positionsByAddress = (addr: string) =>
  POSITIONS.filter(
    (p) =>
      p.hedger.toLowerCase() === addr.toLowerCase() ||
      p.lp.toLowerCase() === addr.toLowerCase()
  );
export const settlementsByPosition = (id: number) =>
  SETTLEMENTS.filter((s) => s.positionId === id);
