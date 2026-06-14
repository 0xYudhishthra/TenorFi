// e2e: POST /hedge (create) + GET /positions + GET /positions/:id against a
// throwaway :memory: db. Hedge is stubbed so this test is about persistence and
// the state machine, not LI.FI (covered live in hedge.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "@keel/hyperliquid";
import { ok } from "../core/domain/result.js";
import type { HedgeService } from "../core/services/hedge.js";
import { createFundingService } from "../core/services/funding.js";
import { createPositionService } from "../core/services/position.js";
import { createPositionRepo } from "../core/repos/positions.js";
import { createDb } from "../core/repos/db.js";
import { createApp } from "./app.js";

const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";

// Deterministic stub — returns a canned quote, never touches the network.
const stubHedge: HedgeService = {
  async quoteHedge() {
    return ok({
      deposit: { tool: "stub", transactionRequest: { to: FROM } } as never,
      open: null,
      notes: ["stub"],
    });
  },
};

function app() {
  return createApp({
    network: "mainnet",
    funding: createFundingService({ transport: createTransport("mainnet") }),
    hedge: stubHedge,
    positions: createPositionService(createPositionRepo(createDb(":memory:"))),
  });
}

function createBody() {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromAddress: FROM,
      fromChain: 8453,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
      market: "BTC",
    }),
  };
}

test("POST /hedge creates a position at QUOTED, listed and fetchable", async () => {
  const a = app();

  const create = await a.request("/hedge", createBody());
  assert.equal(create.status, 201);
  const created = (await create.json()) as { positionId: string; status: string };
  assert.equal(created.status, "QUOTED");
  assert.ok(created.positionId);

  // Appears in the list.
  const list = await a.request("/positions");
  assert.equal(list.status, 200);
  const { positions } = (await list.json()) as {
    positions: Array<{ id: string; status: string; market: string }>;
  };
  assert.equal(positions.length, 1);
  assert.equal(positions[0].id, created.positionId);
  assert.equal(positions[0].market, "BTC");

  // Detail carries the full quote + the created→QUOTED timeline.
  const detail = await a.request(`/positions/${created.positionId}`);
  assert.equal(detail.status, 200);
  const body = (await detail.json()) as {
    position: { status: string; quote: unknown };
    events: Array<{ type: string; toStatus: string }>;
  };
  assert.equal(body.position.status, "QUOTED");
  assert.ok(body.position.quote);
  const transitions = body.events.map((e) => e.toStatus);
  assert.deepEqual(transitions, ["DRAFT", "QUOTED"]);
});

test("GET /positions/:id returns 404 for an unknown id", async () => {
  const res = await app().request("/positions/does-not-exist");
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "POSITION_NOT_FOUND");
});
