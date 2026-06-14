// @keel/lifi — LI.FI Composer orchestrator for Keel.
//
// Cross-chain onboarding for the hedge: bring USDC from any chain and (a) deposit
// collateral into Hyperliquid (HyperCore) and (b) call KeelSwap.open on the
// destination chain. Standalone library consumed later by the MCP layer.
//
// Phase 2:
//   2.1 client       — @lifi/sdk config + chain constants          [done]
//   2.2 deposit      — buildHyperCoreDeposit(amount, fromChain)      [done]
//   2.3 open call    — buildOpenCall({ chain, target, calldata, ... })  [done]
//   2.4 orchestrator — openHedge(...) sequences both legs

export * from "./client.js";
export * from "./deposit.js";
export * from "./open.js";
