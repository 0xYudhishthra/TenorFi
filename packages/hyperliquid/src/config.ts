import { HttpTransport, type HttpTransportOptions } from "@nktkas/hyperliquid";

export type Network = "mainnet" | "testnet";

/**
 * Active network, read from `HL_NETWORK`. Defaults to **testnet** so development
 * and tests never hit mainnet by accident — mainnet is opt-in (`HL_NETWORK=mainnet`).
 */
export const DEFAULT_NETWORK: Network =
  process.env.HL_NETWORK === "mainnet" ? "mainnet" : "testnet";

/**
 * Create a Hyperliquid HTTP transport for the given network.
 * @param network Defaults to {@link DEFAULT_NETWORK}.
 * @param opts    Extra transport options (timeout, fetchOptions, custom urls).
 */
export function createTransport(
  network: Network = DEFAULT_NETWORK,
  opts: Omit<HttpTransportOptions, "isTestnet"> = {},
): HttpTransport {
  return new HttpTransport({ isTestnet: network === "testnet", ...opts });
}
