// ExecutionRepo — the perp-execution intent queue. The API enqueues intents; the
// non-US execution node polls pending ones, signs, and reports back.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./db.js";
import { executionIntents } from "./schema.js";

export type IntentStatus = "pending" | "submitted" | "done" | "failed";

export interface ExecutionIntent {
  id: string;
  positionId: string;
  /** e.g. "openPerp" | "topUpMargin". */
  kind: string;
  market: string;
  params: unknown | null;
  status: IntentStatus;
  txHash: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueInput {
  positionId: string;
  kind: string;
  market: string;
  params?: unknown;
}

export interface ExecutionRepo {
  enqueue(input: EnqueueInput): ExecutionIntent;
  get(id: string): ExecutionIntent | null;
  pending(): ExecutionIntent[];
  setResult(
    id: string,
    result: { status: IntentStatus; txHash?: string; error?: string },
  ): void;
}

type Row = typeof executionIntents.$inferSelect;

function toIntent(r: Row): ExecutionIntent {
  return {
    id: r.id,
    positionId: r.positionId,
    kind: r.kind,
    market: r.market,
    params: r.params ? JSON.parse(r.params) : null,
    status: r.status as IntentStatus,
    txHash: r.txHash ?? null,
    error: r.error ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createExecutionRepo(db: Db): ExecutionRepo {
  return {
    enqueue(input) {
      const now = Date.now();
      const row: Row = {
        id: randomUUID(),
        positionId: input.positionId,
        kind: input.kind,
        market: input.market,
        params: input.params === undefined ? null : JSON.stringify(input.params),
        status: "pending",
        txHash: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(executionIntents).values(row).run();
      return toIntent(row);
    },

    get(id) {
      const r = db
        .select()
        .from(executionIntents)
        .where(eq(executionIntents.id, id))
        .get();
      return r ? toIntent(r) : null;
    },

    pending() {
      const rows = db
        .select()
        .from(executionIntents)
        .where(eq(executionIntents.status, "pending"))
        .all();
      return rows.map(toIntent);
    },

    setResult(id, result) {
      db.update(executionIntents)
        .set({
          status: result.status,
          txHash: result.txHash ?? null,
          error: result.error ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(executionIntents.id, id))
        .run();
    },
  };
}
