// e2e: /health through the real app.

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

const app = createApp({
  network: "mainnet",
  funding: createFundingService({ transport: createTransport("mainnet") }),
  hedge: createHedgeService({ keelChain: CHAINS.base }),
  positions: createPositionService(createPositionRepo(createDb(":memory:"))),
});

test("GET /health reports ok + network", async () => {
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; service: string; network: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, "keel-api");
  assert.equal(body.network, "mainnet");
});
