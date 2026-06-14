// Drizzle table definitions for typed queries. The matching DDL lives in db.ts
// (CREATE TABLE IF NOT EXISTS) so a fresh SQLite file — or :memory: in tests —
// is self-initializing without a migration step.

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const positions = sqliteTable("positions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  market: text("market").notNull(),
  hedger: text("hedger").notNull(),
  fromChain: integer("from_chain").notNull(),
  perpCollateralUsd: text("perp_collateral_usd").notNull(),
  keelCollateralUsd: text("keel_collateral_usd").notNull(),
  quote: text("quote"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const executionIntents = sqliteTable("execution_intents", {
  id: text("id").primaryKey(),
  positionId: text("position_id").notNull(),
  kind: text("kind").notNull(),
  market: text("market").notNull(),
  params: text("params"),
  status: text("status").notNull(),
  txHash: text("tx_hash"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const positionEvents = sqliteTable("position_events", {
  id: text("id").primaryKey(),
  positionId: text("position_id").notNull(),
  type: text("type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  txHash: text("tx_hash"),
  signer: text("signer"),
  detail: text("detail"),
  at: integer("at").notNull(),
});
