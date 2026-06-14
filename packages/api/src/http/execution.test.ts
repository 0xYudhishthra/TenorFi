// Full-live e2e for the execution queue: a rebalance enqueues a top-up intent,
// the node polls it via GET /execution/pending, and reports a txHash via
// POST /execution/:intentId/result, which lands on the position timeline.

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
  return ((await res.json()) as { positionId: string }).positionId;
}

test("rebalance enqueues an intent the node can poll and resolve", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  // Trigger a rebalance → enqueues a top-up intent.
  const reb = await app.request(`/positions/${id}/rebalance`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ thresholdUsd: 1_000_000, targetUsd: 1_000_000 }),
  });
  const rebBody = (await reb.json()) as { intentId: string | null };
  assert.ok(rebBody.intentId, "rebalance returned an intentId");

  // The node polls pending intents.
  const pending = await app.request("/execution/pending");
  assert.equal(pending.status, 200);
  const { intents } = (await pending.json()) as {
    intents: Array<{ id: string; kind: string; status: string; positionId: string }>;
  };
  assert.equal(intents.length, 1);
  assert.equal(intents[0].id, rebBody.intentId);
  assert.equal(intents[0].kind, "topUpMargin");
  assert.equal(intents[0].status, "pending");

  // The node reports a signed tx.
  const result = await app.request(`/execution/${rebBody.intentId}/result`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ txHash: "0xfeedface" }),
  });
  assert.equal(result.status, 200);
  const resolved = (await result.json()) as { intent: { status: string; txHash: string } };
  assert.equal(resolved.intent.status, "done");
  assert.equal(resolved.intent.txHash, "0xfeedface");

  // The queue is now empty and the outcome is on the position timeline.
  const pending2 = await app.request("/execution/pending");
  const after = (await pending2.json()) as { intents: unknown[] };
  assert.equal(after.intents.length, 0);

  const detail = (await (await app.request(`/positions/${id}`)).json()) as {
    events: Array<{ type: string; txHash: string | null }>;
  };
  const done = detail.events.find((e) => e.type === "execution-done");
  assert.ok(done, "execution-done event on the timeline");
  assert.equal(done?.txHash, "0xfeedface");
});

test("POST /execution/:intentId/result 404s for an unknown intent", async () => {
  const res = await makeTestApp().request("/execution/nope/result", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ txHash: "0xabcd" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "INTENT_NOT_FOUND");
});
