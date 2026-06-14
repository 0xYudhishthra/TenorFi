// Full-live e2e: POST /hedge runs a REAL LI.FI quote and persists the position
// into a real SQLite db, then GET /positions + GET /positions/:id read it back.
// No stubs — the whole chain (HTTP → LI.FI → SQLite) is exercised end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "@keel/hyperliquid";
import { CHAINS } from "@keel/lifi";
import { createFundingService } from "../core/services/funding.js";
import { createHedgeService } from "../core/services/hedge.js";
import { createPositionService } from "../core/services/position.js";
import { createPositionRepo } from "../core/repos/positions.js";
import { createDb } from "../core/repos/db.js";
import { createApp } from "./app.js";

const FROM = "0x235713C4CA6A8cd2adc0333F64d1b453BfCdBbfd";

function app() {
  return createApp({
    network: "mainnet",
    funding: createFundingService({ transport: createTransport("mainnet") }),
    // Real LI.FI client; no keelTarget → open leg skipped (contract not deployed).
    hedge: createHedgeService({ keelChain: CHAINS.base }),
    positions: createPositionService(createPositionRepo(createDb(":memory:"))),
  });
}

function createBody() {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromAddress: FROM,
      fromChain: CHAINS.base,
      perpCollateralUsd: "5",
      keelCollateralUsd: "5",
      market: "BTC",
    }),
  };
}

test("POST /hedge persists a position from a real LI.FI quote", async () => {
  const a = app();

  const create = await a.request("/hedge", createBody());
  assert.equal(create.status, 201);
  const created = (await create.json()) as {
    positionId: string;
    status: string;
    quote: { deposit: { transactionRequest?: unknown }; open: unknown };
  };
  assert.equal(created.status, "QUOTED");
  assert.ok(created.positionId);
  // The persisted quote is a real, signable LI.FI step.
  assert.ok(created.quote.deposit.transactionRequest, "deposit has a transactionRequest");
  assert.equal(created.quote.open, null);

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
    position: { status: string; quote: { deposit: unknown } };
    events: Array<{ type: string; toStatus: string }>;
  };
  assert.equal(body.position.status, "QUOTED");
  assert.ok(body.position.quote.deposit, "detail carries the deposit leg");
  assert.deepEqual(body.events.map((e) => e.toStatus), ["DRAFT", "QUOTED"]);
});

test("GET /positions/:id returns 404 for an unknown id", async () => {
  const res = await app().request("/positions/does-not-exist");
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "POSITION_NOT_FOUND");
});
