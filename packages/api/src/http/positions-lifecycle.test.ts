// Full-live e2e for the lifecycle actions: confirm-tx (state machine), settle
// (real HL funding history), rebalance (real HL margin). Each creates a real
// position via POST /hedge first. No stubs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS } from "@keel/lifi";
import { makeTestApp } from "./test-app.js";

const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";
const JSON_HEADERS = { "content-type": "application/json" };

async function createPosition(app: ReturnType<typeof makeTestApp>): Promise<string> {
  const res = await app.request("/hedge", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      fromAddress: FROM,
      fromChain: CHAINS.base,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
      market: "BTC",
    }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { positionId: string }).positionId;
}

test("confirm-tx advances state and records the txHash", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  const res = await app.request(`/positions/${id}/confirm-tx`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ to: "DEPOSIT_PENDING", txHash: "0xdeadbeef", signer: FROM }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { position: { status: string } };
  assert.equal(body.position.status, "DEPOSIT_PENDING");

  const detail = (await (await app.request(`/positions/${id}`)).json()) as {
    events: Array<{ type: string; txHash: string | null }>;
  };
  const ev = detail.events.find((e) => e.type === "confirm-tx");
  assert.ok(ev, "confirm-tx event recorded");
  assert.equal(ev?.txHash, "0xdeadbeef");
});

test("confirm-tx rejects an illegal transition", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  const res = await app.request(`/positions/${id}/confirm-tx`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ to: "CLOSED", txHash: "0xab" }), // QUOTED → CLOSED is illegal
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "INVALID_TRANSITION");
});

test("settle computes net from real funding history", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  const res = await app.request(`/positions/${id}/settle`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      startTime: 1735689600000, // 2025-01-01
      endTime: 1736294400000, // 2025-01-08
      fixedRateAnnualized: 0.1,
      notionalUsd: 1000,
    }),
  });
  assert.equal(res.status, 200);
  const s = (await res.json()) as {
    periods: number;
    realizedFraction: number;
    netFraction: number;
    settlementUsd: number;
    cap: number;
  };
  assert.ok(s.periods > 0, "has funding periods");
  assert.equal(typeof s.realizedFraction, "number");
  assert.equal(typeof s.netFraction, "number");
  assert.equal(typeof s.settlementUsd, "number");
  assert.equal(s.cap, 0.04);
});

test("rebalance assesses real HL margin and builds a top-up intent", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  const res = await app.request(`/positions/${id}/rebalance`, {
    method: "POST",
    headers: JSON_HEADERS,
    // Threshold far above any real balance → a top-up is always needed.
    body: JSON.stringify({ thresholdUsd: 1_000_000, targetUsd: 1_000_000 }),
  });
  assert.equal(res.status, 200);
  const r = (await res.json()) as {
    accountValueUsd: number;
    needsTopUp: boolean;
    topUpUsd: number;
    intent: { kind: string; market: string } | null;
  };
  assert.equal(typeof r.accountValueUsd, "number");
  assert.equal(r.needsTopUp, true);
  assert.ok(r.topUpUsd > 0);
  assert.equal(r.intent?.kind, "topUpMargin");
  assert.equal(r.intent?.market, "BTC");
});
