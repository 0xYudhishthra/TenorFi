// PositionRepo — persistence behind an interface so the core never imports
// Drizzle directly. Swap SQLite for Postgres by reimplementing this file.

import { randomUUID } from "node:crypto";
import { eq, desc, asc } from "drizzle-orm";
import type { Db } from "./db.js";
import { positions, positionEvents } from "./schema.js";
import type {
  HedgePosition,
  PositionEvent,
  PositionStatus,
} from "../domain/position.js";

export interface CreatePositionInput {
  status: PositionStatus;
  market: string;
  hedger: `0x${string}`;
  fromChain: number;
  perpCollateralUsd: string;
  keelCollateralUsd: string;
  quote?: unknown;
}

export interface AppendEventInput {
  positionId: string;
  type: string;
  fromStatus?: PositionStatus | null;
  toStatus?: PositionStatus | null;
  txHash?: string | null;
  signer?: string | null;
  detail?: unknown;
}

export interface PositionRepo {
  create(input: CreatePositionInput): HedgePosition;
  get(id: string): HedgePosition | null;
  list(): HedgePosition[];
  updateStatus(id: string, status: PositionStatus, at: number): void;
  appendEvent(input: AppendEventInput): PositionEvent;
  events(positionId: string): PositionEvent[];
}

type PositionRow = typeof positions.$inferSelect;
type EventRow = typeof positionEvents.$inferSelect;

function rowToPosition(r: PositionRow): HedgePosition {
  return {
    id: r.id,
    status: r.status as PositionStatus,
    market: r.market,
    hedger: r.hedger as `0x${string}`,
    fromChain: r.fromChain,
    perpCollateralUsd: r.perpCollateralUsd,
    keelCollateralUsd: r.keelCollateralUsd,
    quote: r.quote ? JSON.parse(r.quote) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function rowToEvent(r: EventRow): PositionEvent {
  return {
    id: r.id,
    positionId: r.positionId,
    type: r.type,
    fromStatus: (r.fromStatus as PositionStatus | null) ?? null,
    toStatus: (r.toStatus as PositionStatus | null) ?? null,
    txHash: r.txHash ?? null,
    signer: r.signer ?? null,
    detail: r.detail ? JSON.parse(r.detail) : null,
    at: r.at,
  };
}

export function createPositionRepo(db: Db): PositionRepo {
  return {
    create(input) {
      const now = Date.now();
      const row: PositionRow = {
        id: randomUUID(),
        status: input.status,
        market: input.market,
        hedger: input.hedger,
        fromChain: input.fromChain,
        perpCollateralUsd: input.perpCollateralUsd,
        keelCollateralUsd: input.keelCollateralUsd,
        quote: input.quote === undefined ? null : JSON.stringify(input.quote),
        createdAt: now,
        updatedAt: now,
      };
      db.insert(positions).values(row).run();
      return rowToPosition(row);
    },

    get(id) {
      const r = db.select().from(positions).where(eq(positions.id, id)).get();
      return r ? rowToPosition(r) : null;
    },

    list() {
      const rows = db.select().from(positions).orderBy(desc(positions.createdAt)).all();
      return rows.map(rowToPosition);
    },

    updateStatus(id, status, at) {
      db.update(positions).set({ status, updatedAt: at }).where(eq(positions.id, id)).run();
    },

    appendEvent(input) {
      const row: EventRow = {
        id: randomUUID(),
        positionId: input.positionId,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        txHash: input.txHash ?? null,
        signer: input.signer ?? null,
        detail: input.detail === undefined ? null : JSON.stringify(input.detail),
        at: Date.now(),
      };
      db.insert(positionEvents).values(row).run();
      return rowToEvent(row);
    },

    events(positionId) {
      const rows = db
        .select()
        .from(positionEvents)
        .where(eq(positionEvents.positionId, positionId))
        .orderBy(asc(positionEvents.at))
        .all();
      return rows.map(rowToEvent);
    },
  };
}
