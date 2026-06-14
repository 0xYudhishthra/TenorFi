// @keel/lifi — LI.FI Composer orchestrator for Keel.
//
// Onboarding for the hedge, built entirely on LI.FI Composer (@lifi/composer-sdk):
//   - Keel leg:  a Composer flow on Base ships the funding-settlement order into
//                Aqua via the user's execution proxy (core.rawCall), collateral
//                stays live on the proxy as the Aqua virtual balance.
//   - Perp leg:  a Composer flow bridges USDC toward Hyperliquid (lifi.swap),
//                swept to the user; the perp order is placed via the HL API.
//
// Two compiled flows = two signed transactions submitted together (they have
// conflicting sweep semantics). Composer never touches the non-EVM perp order.

// Composer build (the new SDK) — exported at the root.
export * from "./client.js";
export * from "./keel.js";
export * from "./open.js";
export * from "./deposit.js";
export * from "./hedge.js";
export * from "./execute.js";

// Classic build (@lifi/sdk v4) — the proven HyperCore-deposit path. Namespaced
// to avoid colliding with the Composer exports (both have CHAINS/USDC/buildOpenHedge/…).
//   import { classic } from "@keel/lifi";
//   classic.buildHyperCoreDeposit({ ... })
export * as classic from "./classic/index.js";
