import { createClient, type SDKClient } from "@lifi/sdk";

/** Integrator string sent to LI.FI for attribution. Override via LIFI_INTEGRATOR. */
export const LIFI_INTEGRATOR = process.env.LIFI_INTEGRATOR ?? "keel";

/**
 * Create a LI.FI SDK client. Quote calls (getQuote / getContractCallsQuote) are
 * read-only and don't need a wallet provider — only execution does (later phase).
 */
export function createLifiClient(integrator: string = LIFI_INTEGRATOR): SDKClient {
  return createClient({ integrator });
}

/** Chain ids we use (verified against the live li.quest /chains endpoint). */
export const CHAINS = {
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  /** Hyperliquid / HyperCore — the perp-collateral deposit destination. */
  hyperliquid: 1337,
  hyperEVM: 999,
} as const;

/**
 * USDC token addresses per chain (verified live). HyperCore's USDC is the
 * canonical Arbitrum USDC — HyperCore is funded via the Arbitrum bridge.
 */
export const USDC = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  hyperliquid: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
} as const;
