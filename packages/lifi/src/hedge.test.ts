import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";
import { buildOpenHedge } from "./hedge.js";
import { CHAINS, USDC } from "./client.js";

// e2e (quote level): builds BOTH hedge legs against the live LI.FI API and asserts
// each returns an executable transaction. Stand-in Keel calldata (USDC.approve on
// Base) until KeelSwap is deployed. No funds spent.
test("buildOpenHedge returns both executable legs (live LI.FI)", async () => {
  const keelCallData = encodeFunctionData({
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

  const { deposit, open } = await buildOpenHedge({
    fromAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    fromChain: CHAINS.arbitrum,
    perpCollateral: "10000000", // 10 USDC perp margin
    keelCollateral: "10000000", // 10 USDC Keel collateral
    keelChain: CHAINS.base,
    keelTarget: USDC.base as `0x${string}`,
    keelCallData,
  });

  assert.equal(Number(deposit.action.toChainId), CHAINS.hyperliquid);
  assert.ok(deposit.transactionRequest, "deposit leg executable");
  assert.equal(Number(open.action.toChainId), CHAINS.base);
  assert.ok(open.transactionRequest, "open leg executable");
  console.log(`  deposit=${deposit.tool} -> HyperCore | open=${open.tool} -> Base`);
});
