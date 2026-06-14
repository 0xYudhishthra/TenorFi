// SQLite + Drizzle. A file path persists; ":memory:" gives tests a throwaway db.
// Schema is created inline (no drizzle-kit step) so the db self-initializes.

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type Db = BetterSQLite3Database;

const DDL = `
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  market TEXT NOT NULL,
  hedger TEXT NOT NULL,
  from_chain INTEGER NOT NULL,
  perp_collateral_usd TEXT NOT NULL,
  keel_collateral_usd TEXT NOT NULL,
  quote TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS position_events (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  tx_hash TEXT,
  signer TEXT,
  detail TEXT,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_position ON position_events(position_id);

CREATE TABLE IF NOT EXISTS execution_intents (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  market TEXT NOT NULL,
  params TEXT,
  status TEXT NOT NULL,
  tx_hash TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intents_status ON execution_intents(status);
`;

/** Open (or create) the SQLite db, ensure the schema, and return a Drizzle handle. */
export function createDb(path: string): Db {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  return drizzle(sqlite);
}
