import { getContractCallsQuote, type SDKClient } from "@lifi/sdk";
import { createLifiClient, usdcFor } from "./client.js";

export interface OpenCallParams {
  /** Source chain id the user funds from. */
  fromChain: number;
  /** USDC amount in 6-decimal base units bridged to fund the call. */
  amount: string;
  /** Address funding the call. */
  fromAddress: `0x${string}`;
  /** Destination chain id where the target contract lives (e.g. Base for KeelSwap). */
  toChain: number;
  /** Target contract to call after the bridge (e.g. the KeelSwap address). */
  target: `0x${string}`;
  /** ABI-encoded calldata for the target (e.g. KeelSwap.open(...)). */
  callData: `0x${string}`;
  /** USDC address on the destination chain (the token the call consumes). */
  toToken?: string;
  /** USDC address on the source chain. */
  fromToken?: string;
  /** Gas limit for the destination contract call. */
  gasLimit?: string;
  slippage?: number;
  client?: SDKClient;
}

/**
 * Build a LI.FI contract-call quote: bridge USDC from `fromChain` to `toChain` and
 * execute `callData` against `target` in one route (the Keel-swap leg, e.g. calling
 * KeelSwap.open). Parametrized by target + calldata so it isn't tied to the final
 * contract design. Returns a LiFiStep with an executable `transactionRequest`.
 */
export async function buildOpenCall(
  params: OpenCallParams,
): ReturnType<typeof getContractCallsQuote> {
  const client = params.client ?? createLifiClient();
  const toToken = params.toToken ?? usdcFor(params.toChain);
  return getContractCallsQuote(client, {
    fromChain: params.fromChain,
    fromToken: params.fromToken ?? usdcFor(params.fromChain),
    fromAddress: params.fromAddress,
    toChain: params.toChain,
    toToken,
    fromAmount: params.amount,
    contractCalls: [
      {
        fromAmount: params.amount,
        fromTokenAddress: toToken,
        toContractAddress: params.target,
        toContractCallData: params.callData,
        toContractGasLimit: params.gasLimit ?? "300000",
      },
    ],
    slippage: params.slippage,
  });
}
