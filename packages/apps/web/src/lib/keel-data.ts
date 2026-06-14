/* ============================================================================
   KEEL — mock data + formatting helpers (explorer / create-position)
   Ported from the design bundle's keel-data.js. All data is illustrative;
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
