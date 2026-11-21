/** Minimal V0 schema for .evolveloop/state.db (SQLite WAL). */

export const STATE_DB_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_contracts (
  goal_contract_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  objective TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  validated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  work_id TEXT,
  mso_confirmed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (goal_contract_id, version)
);

CREATE INDEX IF NOT EXISTS idx_goal_contracts_latest
  ON goal_contracts (goal_contract_id, version DESC);

CREATE TABLE IF NOT EXISTS trivial_ops (
  op_key TEXT PRIMARY KEY NOT NULL,
  response_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const STATE_DB_SCHEMA_VERSION = "1";
