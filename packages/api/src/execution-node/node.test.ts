// e2e for the execution node: it polls a real in-process API for a pending intent,
// runs the executor, and reports the result, which the API records on the position.
// The executor is faked because live HL signing is geoblocked from US — that's the
// one dependency we can't reach from here (see hl-executor.ts for the real path).

import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS } from "@keel/lifi";
import { makeTestApp } from "../http/test-app.js";
import { createExecutionNode, type Executor } from "./node.js";

const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";
const H = { "content-type": "application/json" };

test("node drains a pending intent and reports the result onto the position", async () => {
  const app = makeTestApp();
  const fetcher = (p: string, i?: RequestInit) => Promise.resolve(app.request(p, i));

  // Create a position, then a rebalance enqueues a top-up intent.
  const created = await app.request("/hedge", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      fromAddress: FROM,
      fromChain: CHAINS.base,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
      market: "BTC",
    }),
  });
  const { positionId } = (await created.json()) as { positionId: string };
  await app.request(`/positions/${positionId}/rebalance`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ thresholdUsd: 1_000_000, targetUsd: 1_000_000 }),
  });

  // The node signs with a faked executor and reports back.
  const executor: Executor = async () => ({ txHash: "hl:oid:42" });
  await createExecutionNode({ fetcher, executor }).tick();

  // Queue is drained.
  const pending = (await (await app.request("/execution/pending")).json()) as {
    intents: unknown[];
  };
  assert.equal(pending.intents.length, 0);

  // Result landed on the position timeline.
  const detail = (await (await app.request(`/positions/${positionId}`)).json()) as {
    events: Array<{ type: string; txHash: string | null }>;
  };
  const done = detail.events.find((e) => e.type === "execution-done");
  assert.ok(done, "execution-done event recorded");
  assert.equal(done?.txHash, "hl:oid:42");
});
