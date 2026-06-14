// e2e: /health through the real app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "./test-app.js";

const app = makeTestApp();

test("GET /health reports ok + network", async () => {
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; service: string; network: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, "keel-api");
  assert.equal(body.network, "mainnet");
});
