// @keel/hyperliquid — Hyperliquid API client for Keel.
//
// Read funding/positions, place perp orders, and top up margin on Hyperliquid.
// Scope (feat/lifi-composer): standalone client; wired to the Keel contracts later.
//
// Modules are filled in across Phase 1:
//   1.1 config       — network base URLs + switch          [done]
//   1.2 read client  — getFunding, getPositions, getAccountState  [done]
//   1.3 exchange     — placePerpOrder, updateLeverage, topUpMargin (agent wallet)  [done]
//   1.4 helper       — openPerpLong(market, usd, leverage)

export * from "./config.js";
export * from "./read.js";
export * from "./exchange.js";
