// order-params — derive the on-chain funding-order parameters for a position
// from the position record + deployments.json + config. NO hardcoded position
// values: notional comes from the position's locked Keel collateral; fixedRate
// and cap come from the per-order terms (the quote, when present) or fall back to
// the live contract defaults (which Settle.s.sol / Ship.s.sol use as env defaults).

import { parseUnits } from "viem";
import { createRequire } from "node:module";
import type { HedgePosition } from "../core/domain/position.js";

const require = createRequire(import.meta.url);
/** Live Base mainnet addresses — the single source of truth the scripts also use. */
const deployments = require("../../../contracts/deployments.json") as {
  TenorSwapVMRouter: `0x${string}`;
  TenorFundingProgram: `0x${string}`;
  Aqua: `0x${string}`;
  FundingIndex: `0x${string}`;
  PositionToken: `0x${string}`;
  USDC: `0x${string}`;
  chainId: number;
  periodSeconds: number;
};

export const DEPLOYMENTS = deployments;

const USDC_DECIMALS = 6;

/**
 * Contract-default per-order terms (match Settle.s.sol / Ship.s.sol vm.envOr
 * fallbacks). 7.3% APR as a per-hour WAD rate; 4% per-period clamp.
 */
export const DEFAULT_FIXED_RATE = 8_333_333_333_333n; // 1e18, per hour
export const DEFAULT_CAP = 40_000_000_000_000_000n; // 4e16 = 4%

/** Per-order terms a position's quote may carry (all optional → defaults). */
interface QuoteTerms {
  notionalUsdc?: string | number;
  fixedRate?: string | number;
  cap?: string | number;
}

function asBigInt(v: string | number | undefined): bigint | undefined {
  if (v === undefined) return undefined;
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : v);
  } catch {
    return undefined;
  }
}

export interface OrderParams {
  /** Swap notional in USDC base units (1e6). */
  notional: bigint;
  /** Fixed leg rate, per-hour WAD (1e18). */
  fixedRate: bigint;
  /** Per-period clamp, WAD (1e18). */
  cap: bigint;
  /** One period's worst-case payout = cap×notional/1e18, USDC base units. */
  collateralFloor: bigint;
}

/**
 * Build the order params for a position. `notional` defaults to the position's
 * locked Keel collateral (keelCollateralUsd → 1e6); `fixedRate`/`cap` come from
 * the quote terms if present, else the contract defaults.
 */
export function deriveOrderParams(pos: HedgePosition): OrderParams {
  const terms = (pos.quote ?? {}) as QuoteTerms;

  let notional: bigint;
  const quoteNotional = asBigInt(terms.notionalUsdc);
  if (quoteNotional !== undefined) {
    notional = quoteNotional;
  } else {
    // keelCollateralUsd is a decimal USD string (e.g. "5") → USDC base units.
    notional = parseUnits(pos.keelCollateralUsd, USDC_DECIMALS);
  }

  const fixedRate = asBigInt(terms.fixedRate) ?? DEFAULT_FIXED_RATE;
  const cap = asBigInt(terms.cap) ?? DEFAULT_CAP;
  const collateralFloor = (cap * notional) / 10n ** 18n;

  return { notional, fixedRate, cap, collateralFloor };
}
