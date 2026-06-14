// e2e: drives the funding routes via app.request() against live Hyperliquid.
// HL /info is public, so this runs from anywhere (no geoblock, no keys).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "@keel/hyperliquid";
import { createFundingService } from "../core/services/funding.js";
import { createApp } from "./app.js";

const app = createApp({
  network: "mainnet",
  funding: createFundingService({ transport: createTransport("mainnet") }),
});

test("GET /funding/:market returns a current snapshot", async () => {
  const res = await app.request("/funding/BTC");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.market, "BTC");
  assert.equal(typeof body.funding, "number");
  assert.equal(typeof body.markPx, "number");
  assert.equal(typeof body.annualized, "number");
  assert.ok((body.markPx as number) > 0);
});

test("GET /funding/:market lowercases are normalized", async () => {
  const res = await app.request("/funding/btc");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.market, "BTC");
});

test("GET /funding/:market/history returns rows since startTime", async () => {
  const since = 1735689600000; // 2025-01-01, fixed so the test is deterministic
  const res = await app.request(`/funding/BTC/history?startTime=${since}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { market: string; history: unknown[] };
  assert.equal(body.market, "BTC");
  assert.ok(Array.isArray(body.history));
  assert.ok(body.history.length > 0);
  const row = body.history[0] as Record<string, unknown>;
  assert.equal(typeof row.fundingRate, "number");
  assert.equal(typeof row.time, "number");
});

test("GET /funding/:market/history rejects a missing startTime", async () => {
  const res = await app.request("/funding/BTC/history");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_FAILED");
});
