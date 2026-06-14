// @keel/lifi/classic — the original LI.FI SDK integration (@lifi/sdk v4).
//
// Kept alongside the Composer build because this is the PROVEN path: the
// `relaydepository` route deposits USDC straight into a user's HyperCore /
// Hyperliquid perp account in one signed tx (validated on-chain). Composer can't
// reach non-EVM HyperCore, so this is what the app uses for the real deposit.
// Exposed under the `classic` namespace from the package root.

export * from "./client.js";
export * from "./deposit.js";
export * from "./open.js";
export * from "./hedge.js";
export * from "./execute.js";
export * from "./status.js";
