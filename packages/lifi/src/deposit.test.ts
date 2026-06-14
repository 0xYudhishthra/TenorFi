import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHyperCoreDeposit } from "./deposit.js";
import { CHAINS } from "./client.js";

// e2e (quote level): hits the live LI.FI API and asserts a real, executable
// transaction is returned for depositing USDC into HyperCore. No funds spent.
test("buildHyperCoreDeposit returns an executable HyperCore deposit quote (live LI.FI)", async () => {
  const step = await buildHyperCoreDeposit({
    fromChain: CHAINS.arbitrum,
    amount: "10000000", // 10 USDC
    fromAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  });
  assert.equal(Number(step.action.toChainId), CHAINS.hyperliquid);
  assert.ok(step.transactionRequest, "should include an executable transactionRequest");
  assert.ok(step.transactionRequest?.to, "transactionRequest has a target address");
  console.log(`  tool=${step.tool} -> HyperCore, toAmount=${step.estimate.toAmount}`);
});
