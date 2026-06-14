// Unit tests for the HedgePosition state machine — pure, no I/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  isTerminal,
  nextStates,
  POSITION_STATUSES,
} from "./position.js";

test("happy path is fully connected DRAFT → … → CLOSED", () => {
  const path = [
    "DRAFT",
    "QUOTED",
    "DEPOSIT_PENDING",
    "DEPOSIT_DONE",
    "PERP_PENDING",
    "OPEN",
    "CLOSING",
    "CLOSED",
  ] as const;
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(
      canTransition(path[i], path[i + 1]),
      `${path[i]} → ${path[i + 1]} should be legal`,
    );
  }
});

test("any non-terminal state can fail", () => {
  for (const s of POSITION_STATUSES) {
    if (isTerminal(s)) continue;
    assert.ok(canTransition(s, "FAILED"), `${s} → FAILED should be legal`);
  }
});

test("OPEN loops through SETTLING and REBALANCING back to OPEN", () => {
  assert.ok(canTransition("OPEN", "SETTLING"));
  assert.ok(canTransition("OPEN", "REBALANCING"));
  assert.ok(canTransition("SETTLING", "OPEN"));
  assert.ok(canTransition("REBALANCING", "OPEN"));
});

test("illegal jumps are rejected", () => {
  assert.equal(canTransition("DRAFT", "OPEN"), false);
  assert.equal(canTransition("QUOTED", "CLOSED"), false);
  assert.equal(canTransition("DEPOSIT_PENDING", "PERP_PENDING"), false);
});

test("terminal states have no exits", () => {
  assert.ok(isTerminal("CLOSED"));
  assert.ok(isTerminal("FAILED"));
  assert.equal(nextStates("CLOSED").length, 0);
  assert.equal(canTransition("CLOSED", "OPEN"), false);
  assert.equal(canTransition("FAILED", "DRAFT"), false);
});
