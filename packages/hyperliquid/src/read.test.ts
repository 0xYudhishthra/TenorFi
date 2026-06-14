import { test } from "node:test";
import assert from "node:assert/strict";
import { getAccountState, getFunding, getPositions } from "./read.js";

// Integration smoke tests: hit Hyperliquid testnet over the network (read-only, no keys).
// Default network is testnet (HL_NETWORK unset), so these never touch mainnet.

test("getFunding(BTC) returns a valid funding snapshot from testnet", async () => {
  const f = await getFunding("BTC");
  assert.equal(f.market, "BTC");
  assert.equal(typeof f.funding, "number");
  assert.ok(!Number.isNaN(f.funding), "funding should not be NaN");
  assert.ok(f.markPx > 0, "markPx should be positive");
  console.log(`  BTC funding=${f.funding} markPx=${f.markPx} OI=${f.openInterest}`);
});

test("getFunding throws for an unknown market", async () => {
  await assert.rejects(
    () => getFunding("NOT_A_REAL_MARKET_XYZ"),
    /market not found/,
  );
});

test("getAccountState returns margin summary + positions array", async () => {
  // Arbitrary valid address; an account with no activity still returns a valid state.
  const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
  const state = await getAccountState(addr);
  assert.ok(state.marginSummary, "marginSummary present");
  assert.equal(typeof state.marginSummary.accountValue, "string");
  assert.ok(Array.isArray(state.assetPositions), "assetPositions is an array");

  const positions = await getPositions(addr);
  assert.ok(Array.isArray(positions), "getPositions returns an array");
});
