import { test } from "node:test";
import assert from "node:assert/strict";
import type { WalletClient } from "viem";
import { executeHedge } from "./execute.js";
import type { HedgeQuotes } from "./hedge.js";

// The full executor sends real transactions (needs funds + a deployed KeelSwap), so
// it's validated on-chain separately. Here we cover the input guard without the network.
test("executeHedge throws when a leg has no transactionRequest", async () => {
  const quotes = {
    deposit: { transactionRequest: undefined, action: {}, tool: "x" },
    open: { transactionRequest: { to: "0x" }, action: {}, tool: "y" },
  } as unknown as HedgeQuotes;
  const wallet = {
    account: { address: "0x0000000000000000000000000000000000000001" },
    chain: undefined,
    sendTransaction: async () => "0xdead" as `0x${string}`,
  } as unknown as WalletClient;

  await assert.rejects(() => executeHedge(quotes, { wallet }), /no transactionRequest/);
});
