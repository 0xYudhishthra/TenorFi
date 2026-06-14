import { test } from "node:test";
import assert from "node:assert/strict";
import type { WalletClient } from "viem";
import { executeHedge } from "./execute.js";
import type { HedgeFlows } from "./hedge.js";

// The full executor sends real transactions (needs funds + the live Keel
// deployment), so it's validated on-chain separately. Here we cover the guard:
// a leg that didn't compile successfully must abort before any tx is sent.
test("executeHedge throws when a leg did not compile successfully", async () => {
  const flows = {
    keel: { status: "partial", error: { kind: "revert", message: "boom" } },
    perp: { status: "success", transactionRequest: { to: "0x", data: "0x", value: "0" } },
  } as unknown as HedgeFlows;

  const wallet = {
    account: { address: "0x0000000000000000000000000000000000000001" },
    chain: undefined,
    sendTransaction: async () => "0xdead" as `0x${string}`,
  } as unknown as WalletClient;

  await assert.rejects(() => executeHedge(flows, { wallet }), /compile not successful/);
});
