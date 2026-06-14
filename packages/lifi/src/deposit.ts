import { getQuote, type SDKClient } from "@lifi/sdk";
import { CHAINS, createLifiClient, USDC } from "./client.js";

export interface HyperCoreDepositParams {
  /** Source chain id to bring USDC from (e.g. CHAINS.arbitrum). */
  fromChain: number;
  /** USDC amount in 6-decimal base units (e.g. "5000000" = 5 USDC). */
  amount: string;
  /** Address funding the deposit and receiving collateral on HyperCore. */
  fromAddress: `0x${string}`;
  /** USDC address on the source chain. Defaults from known chains. */
  fromToken?: string;
  /** Slippage as a fraction (e.g. 0.005 = 0.5%). */
  slippage?: number;
  client?: SDKClient;
}

/** USDC address for a known source chain. */
function usdcFor(chainId: number): string {
  switch (chainId) {
    case CHAINS.base:
      return USDC.base;
    case CHAINS.arbitrum:
      return USDC.arbitrum;
    case CHAINS.optimism:
      return USDC.optimism;
    default:
      throw new Error(`no default USDC for chain ${chainId}; pass fromToken`);
  }
}

/**
 * Build a LI.FI quote that brings USDC from `fromChain` and deposits it into
 * Hyperliquid (HyperCore) — the perp-collateral leg of the hedge. Returns a
 * LiFiStep whose `transactionRequest` is the signable, executable transaction.
 * LI.FI only deposits collateral; the perp order is placed separately via the HL API.
 */
export async function buildHyperCoreDeposit(
  params: HyperCoreDepositParams,
): ReturnType<typeof getQuote> {
  const client = params.client ?? createLifiClient();
  return getQuote(client, {
    fromChain: params.fromChain,
    fromToken: params.fromToken ?? usdcFor(params.fromChain),
    fromAddress: params.fromAddress,
    fromAmount: params.amount,
    toChain: CHAINS.hyperliquid,
    toToken: USDC.hyperliquid,
    slippage: params.slippage,
  });
}
