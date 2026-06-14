import {
  materialisers,
  resources,
  type ComposeCompileResult,
  type ComposeSdk,
  type SimulationPolicy,
} from "@lifi/composer-sdk";
import { CHAINS, createKeelComposeSdk, usdcFor } from "./client.js";

export interface PerpDepositParams {
  /** Address funding the deposit; also the default sweep recipient. */
  signer: `0x${string}`;
  /** USDC amount in 6-decimal base units to route toward Hyperliquid. */
  amount: bigint;
  /** Source chain the flow runs on. Defaults to Base. */
  fromChain?: number;
  /** Destination chain to land USDC on for the HL deposit. Defaults to Arbitrum (HyperCore's bridge chain). */
  toChain?: number;
  fromToken?: `0x${string}`;
  toToken?: `0x${string}`;
  /** Slippage as a fraction (e.g. 0.005 = 0.5%). */
  slippage?: number;
  /**
   * Where the bridged USDC lands. Defaults to the signer's own address so the
   * user controls it for the Hyperliquid deposit + perp order (placed via the HL API).
   */
  recipient?: `0x${string}`;
  simulationPolicy?: SimulationPolicy;
  sdk?: ComposeSdk;
}

/**
 * Build + compile a Composer flow that brings USDC and bridges it toward
 * Hyperliquid (the perp-collateral leg). A single `lifi.swap` whose `resourceOut`
 * lives on the destination chain crosses chains in one flow; the residual is
 * swept to the recipient (the signer by default), where the Hyperliquid API
 * finishes the HyperCore deposit and places the perp order.
 *
 * Composer never places the perp order (it's non-EVM); that stays on the HL API.
 */
export async function buildPerpDepositFlow(params: PerpDepositParams): Promise<ComposeCompileResult> {
  const sdk = params.sdk ?? createKeelComposeSdk();
  const fromChain = params.fromChain ?? CHAINS.base;
  const toChain = params.toChain ?? CHAINS.arbitrum;
  const fromToken = (params.fromToken ?? usdcFor(fromChain)) as `0x${string}`;
  const toToken = (params.toToken ?? usdcFor(toChain)) as `0x${string}`;
  const recipient = params.recipient ?? params.signer;

  const builder = sdk.flow(fromChain, {
    name: "keel-perp-deposit",
    inputs: { amountIn: resources.erc20(fromToken, fromChain) },
  });

  builder.lifi.swap("bridge", {
    bind: { amountIn: builder.inputs.amountIn },
    config: { resourceOut: resources.erc20(toToken, toChain), slippage: params.slippage },
  });

  return builder.compile({
    inputs: { amountIn: materialisers.directDeposit({ amount: params.amount }) },
    signer: params.signer,
    sweepTo: recipient,
    simulationPolicy: params.simulationPolicy,
  });
}
