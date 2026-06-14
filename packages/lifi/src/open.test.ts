import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";
import { buildOpenCall } from "./open.js";
import { CHAINS, USDC } from "./client.js";

// e2e (quote level): hits the live LI.FI API and asserts a real, executable
// contract-call transaction to Base. Stand-in target/calldata until KeelSwap is
// deployed: USDC.approve(spender, 1) on Base. No funds spent.
test("buildOpenCall returns an executable contract-call quote to Base (live LI.FI)", async () => {
  const callData = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "approve",
    args: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", 1n],
  });

  const step = await buildOpenCall({
    fromChain: CHAINS.optimism,
    amount: "1000000", // 1 USDC
    fromAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    toChain: CHAINS.base,
    target: USDC.base as `0x${string}`,
    callData,
  });

  assert.equal(Number(step.action.toChainId), CHAINS.base);
  assert.ok(step.transactionRequest, "should include an executable transactionRequest");
  console.log(`  tool=${step.tool} -> Base contract-call, toAmount=${step.estimate.toAmount}`);
});
