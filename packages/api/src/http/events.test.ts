// e2e for the SSE stream: GET /events/:id replays the position timeline and
// pushes a live event when the position transitions.

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

/** Read chunks until `needle` appears or `maxReads` is hit (avoids hanging). */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  acc: { text: string },
  needle: string,
  maxReads = 12,
): Promise<boolean> {
  for (let i = 0; i < maxReads; i++) {
    if (acc.text.includes(needle)) return true;
    const { value, done } = await reader.read();
    if (done) break;
    acc.text += decoder.decode(value, { stream: true });
  }
  return acc.text.includes(needle);
}

test("GET /events/:id replays history then streams a live transition", async () => {
  const app = makeTestApp();
  const id = await createPosition(app);

  const stream = await app.request(`/events/${id}`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);

  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  const acc = { text: "" };

  // Read until the replayed history arrives — by then the live subscription is active.
  assert.ok(await readUntil(reader, decoder, acc, '"toStatus":"QUOTED"'), "replay seen");

  // Now drive a live event; it should arrive on the open stream.
  await app.request(`/positions/${id}/confirm-tx`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ to: "DEPOSIT_PENDING", txHash: "0xabcdef" }),
  });

  assert.ok(
    await readUntil(reader, decoder, acc, '"toStatus":"DEPOSIT_PENDING"'),
    "live transition streamed",
  );
  await reader.cancel();
});

test("GET /events/:id 404s for an unknown position", async () => {
  const res = await makeTestApp().request("/events/nope");
  assert.equal(res.status, 404);
});
