import type { ComposeCompileResult, ComposeSdk, SimulationPolicy } from "@lifi/composer-sdk";
import { createKeelComposeSdk } from "./client.js";
import { buildPerpDepositFlow } from "./deposit.js";
import { buildKeelOpenFlow } from "./open.js";

export interface OpenHedgeParams {
  /** The hedger's signer (EOA). Funds both legs; its proxy is the Keel maker. */
  signer: `0x${string}`;
  /** Source chain the hedger funds the perp leg from. Defaults handled by the perp flow (Base). */
  fromChain?: number;
  /** USDC (6-dec base units) routed toward Hyperliquid as perp margin. */
  perpCollateral: bigint;
  /** USDC (6-dec base units) locked as Keel-swap collateral on Base. */
  keelCollateral: bigint;
  /** The bound counterparty for the Keel leg (the insurance reserve). */
  counterparty: `0x${string}`;
  /** Locked fixed funding rate (FFR), per-period in WAD. Signed. */
  fixedRate: bigint;
  /** Per-period clamp (e.g. 4e16 = 4%). */
  cap: bigint;
  /** Notional in USDC 6-dec base units. */
  notional: bigint;
  makerPaysAbove?: boolean;
  /** Override the resolved Keel maker/proxy. */
  maker?: `0x${string}`;
  perpToChain?: number;
  perpRecipient?: `0x${string}`;
  slippage?: number;
  simulationPolicy?: SimulationPolicy;
  sdk?: ComposeSdk;
}

/**
 * The two compiled Composer flows that make up hedge onboarding. They have
 * conflicting sweep semantics (Keel collateral must stay on the proxy; perp
 * margin must be swept to the user), so they are two flows — two signed
 * transactions submitted together. The perp order itself is placed separately
 * via the Hyperliquid API (Composer can't reach non-EVM HyperCore).
 */
export interface HedgeFlows {
  /** Leg 1: open the Keel swap on Base (ship into Aqua via the proxy). */
  keel: ComposeCompileResult;
  /** Leg 2: bridge perp margin toward Hyperliquid, swept to the user. */
  perp: ComposeCompileResult;
}

/**
 * Build + compile both hedge legs as Composer flows. The consumer (MCP / API)
 * signs and submits both `transactionRequest`s, then fires the perp order via
 * the Hyperliquid API. "One click" for the user; two on-chain Composer txs.
 */
export async function buildOpenHedge(params: OpenHedgeParams): Promise<HedgeFlows> {
  const sdk = params.sdk ?? createKeelComposeSdk();

  const keel = await buildKeelOpenFlow({
    signer: params.signer,
    collateral: params.keelCollateral,
    counterparty: params.counterparty,
    fixedRate: params.fixedRate,
    cap: params.cap,
    notional: params.notional,
    makerPaysAbove: params.makerPaysAbove,
    maker: params.maker,
    simulationPolicy: params.simulationPolicy,
    sdk,
  });

  const perp = await buildPerpDepositFlow({
    signer: params.signer,
    amount: params.perpCollateral,
    fromChain: params.fromChain,
    toChain: params.perpToChain,
    recipient: params.perpRecipient,
    slippage: params.slippage,
    simulationPolicy: params.simulationPolicy,
    sdk,
  });

  return { keel, perp };
}
