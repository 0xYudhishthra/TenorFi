// e2e: drives POST /hedge/quote via app.request() against live LI.FI.
// Quotes are read-only (no signing, no funds), so this runs from anywhere.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "@keel/hyperliquid";
import { CHAINS } from "@keel/lifi";
import { createFundingService } from "../core/services/funding.js";
import { createHedgeService } from "../core/services/hedge.js";
import { createApp } from "./app.js";

// A funded address only matters for execution; quoting just needs a valid one.
const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";

function app() {
  return createApp({
    network: "mainnet",
    funding: createFundingService({ transport: createTransport("mainnet") }),
    // No keelTarget → open leg is skipped (contract not deployed yet).
    hedge: createHedgeService({ keelChain: CHAINS.base }),
  });
}

test("POST /hedge/quote builds the deposit leg, skips open when unwired", async () => {
  const res = await app().request("/hedge/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromAddress: FROM,
      fromChain: CHAINS.base,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    deposit: { transactionRequest?: unknown; action?: unknown };
    open: unknown;
    notes: string[];
  };
  // Deposit leg is a real, signable LI.FI step.
  assert.ok(body.deposit, "deposit leg present");
  assert.ok(body.deposit.transactionRequest, "deposit has a transactionRequest");
  // Open leg skipped with an explanatory note.
  assert.equal(body.open, null);
  assert.ok(body.notes.some((n) => n.includes("open leg skipped")));
});

test("POST /hedge/quote rejects a bad fromAddress", async () => {
  const res = await app().request("/hedge/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromAddress: "not-an-address",
      fromChain: CHAINS.base,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_FAILED");
});
