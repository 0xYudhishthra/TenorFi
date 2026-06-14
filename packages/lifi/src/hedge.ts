import { type SDKClient } from "@lifi/sdk";
import { createLifiClient } from "./client.js";
import { buildHyperCoreDeposit } from "./deposit.js";
import { buildOpenCall } from "./open.js";

export interface OpenHedgeParams {
  /** Address funding both legs (the hedger). */
  fromAddress: `0x${string}`;
  /** Source chain the user funds from (where their USDC is). */
  fromChain: number;
  /** USDC (6-dec base units) to deposit as HyperLiquid perp margin. */
  perpCollateral: string;
  /** USDC (6-dec base units) to lock as Keel-swap collateral. */
  keelCollateral: string;
  /** Chain where the Keel contract lives (e.g. Base). */
  keelChain: number;
  /** KeelSwap address. */
  keelTarget: `0x${string}`;
  /** ABI-encoded KeelSwap.open(...) calldata. */
  keelCallData: `0x${string}`;
  slippage?: number;
  client?: SDKClient;
}

/** The two executable LI.FI legs that make up the hedge onboarding. */
export interface HedgeQuotes {
  /** Leg 1: deposit perp collateral into HyperCore (perp order placed separately via HL API). */
  deposit: Awaited<ReturnType<typeof buildHyperCoreDeposit>>;
  /** Leg 2: bridge + call KeelSwap.open on the Keel chain. */
  open: Awaited<ReturnType<typeof buildOpenCall>>;
}

/**
 * Build both legs of the hedge onboarding as executable LI.FI quotes:
 *   1. deposit perp collateral into HyperCore,
 *   2. bridge + open the Keel swap (contract-call).
 *
 * Returns both quotes; the consumer (MCP) signs/executes them in order — "one click"
 * UX, but TWO routes on-chain (HyperCore and the Keel chain are different destinations,
 * so they can't be one atomic tx). LI.FI only deposits the perp collateral; the BTC
 * perp order is placed separately via the Hyperliquid API.
 */
export async function buildOpenHedge(params: OpenHedgeParams): Promise<HedgeQuotes> {
  const client = params.client ?? createLifiClient();
  const deposit = await buildHyperCoreDeposit({
    fromChain: params.fromChain,
    amount: params.perpCollateral,
    fromAddress: params.fromAddress,
    slippage: params.slippage,
    client,
  });
  const open = await buildOpenCall({
    fromChain: params.fromChain,
    amount: params.keelCollateral,
    fromAddress: params.fromAddress,
    toChain: params.keelChain,
    target: params.keelTarget,
    callData: params.keelCallData,
    slippage: params.slippage,
    client,
  });
  return { deposit, open };
}
