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

CREATE TABLE IF NOT EXISTS token_ledger (
  entry_id TEXT PRIMARY KEY NOT NULL,
  work_id TEXT NOT NULL,
  task_id TEXT,
  goal_contract_id TEXT,
  provider_id TEXT,
  adapter_id TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,
  cost_provenance TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_work
  ON token_ledger (work_id, created_at DESC);

CREATE TABLE IF NOT EXISTS circuit_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  work_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  goal_contract_id TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  workspace_path TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circuit_runs_work
  ON circuit_runs (work_id, created_at DESC);
`;

export const STATE_DB_SCHEMA_VERSION = "2";
