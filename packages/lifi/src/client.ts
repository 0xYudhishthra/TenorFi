import { createComposeSdk, materialisers, resources, type ComposeSdk } from "@lifi/composer-sdk";

/** Integrator string sent to LI.FI for attribution. Override via LIFI_INTEGRATOR. */
export const LIFI_INTEGRATOR = process.env.LIFI_INTEGRATOR ?? "keel";

/** Compose API base URL. Override via COMPOSER_BASE_URL. */
export const COMPOSER_BASE_URL = process.env.COMPOSER_BASE_URL ?? "https://composer.li.quest";

/**
 * Create a LI.FI Compose SDK client. The API key (Composer is in technical preview)
 * is read from LIFI_API_KEY and sent as the `x-lifi-api-key` header on every request.
 * Pass `apiKey` explicitly to override.
 */
export function createKeelComposeSdk(apiKey: string | undefined = process.env.LIFI_API_KEY): ComposeSdk {
  return createComposeSdk({ baseUrl: COMPOSER_BASE_URL, apiKey });
}

/**
 * Resolve a signer's deterministic Compose execution proxy (the per-user CREATE3
 * account that becomes the on-chain `msg.sender` and, for Keel, the Aqua `maker`).
 *
 * The proxy address isn't derivable off-chain from the SDK, but every compile
 * result returns it as `userProxy`. We compile a small, structurally valid probe
 * flow (deposit a token unit, split it, sweep back to the signer) under
 * `allow-revert` so we always get a result — success or partial — and read
 * `userProxy` from it. The split amount must be large enough that neither half
 * rounds to zero (zero outputs are rejected at compile time).
 */
export async function resolveUserProxy(params: {
  signer: `0x${string}`;
  chainId: number;
  token: `0x${string}`;
  sdk?: ComposeSdk;
}): Promise<`0x${string}`> {
  const sdk = params.sdk ?? createKeelComposeSdk();
  const builder = sdk.flow(params.chainId, {
    name: "keel-proxy-probe",
    inputs: { probe: resources.erc20(params.token, params.chainId) },
  });
  // A declared input must be consumed by a node; split consumes it and the
  // (unbound) halves are swept back to the signer.
  builder.core.split("probe-split", { bind: { source: builder.inputs.probe }, config: { bps: 5000 } });
  const result = await builder.compile({
    inputs: { probe: materialisers.directDeposit({ amount: 1_000_000n }) },
    signer: params.signer,
    sweepTo: builder.context.sender,
    simulationPolicy: "allow-revert",
  });
  if (!result.userProxy) throw new Error("compile result did not include userProxy");
  return result.userProxy as `0x${string}`;
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

/** USDC address for a known chain id. Throws for unknown chains — pass it explicitly. */
export function usdcFor(chainId: number): string {
  switch (chainId) {
    case CHAINS.base:
      return USDC.base;
    case CHAINS.arbitrum:
      return USDC.arbitrum;
    case CHAINS.optimism:
      return USDC.optimism;
    case CHAINS.hyperliquid:
      return USDC.hyperliquid;
    default:
      throw new Error(`no known USDC for chain ${chainId}; pass the token explicitly`);
  }
}
