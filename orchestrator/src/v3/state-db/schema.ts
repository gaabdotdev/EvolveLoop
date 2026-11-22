/** V0 schema for .evolveloop/state.db (SQLite WAL, synchronous=FULL, busy_timeout=5000). */

export const STATE_DB_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
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
  subsystem TEXT,
  provider_id TEXT,
  adapter_id TEXT,
  model TEXT,
  model_requested TEXT,
  model_served TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  tokens_system INTEGER,
  tokens_context INTEGER,
  tokens_tools INTEGER,
  tokens_output INTEGER,
  tokens_cache_hit INTEGER,
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

CREATE TABLE IF NOT EXISTS workspace_leases (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  holder_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  acquired_at TEXT NOT NULL,
  renewed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mso_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  state TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  goal_contract_id TEXT,
  work_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mso_sessions_workspace
  ON mso_sessions (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mso_transitions (
  transition_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  event TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mso_transitions_session
  ON mso_transitions (session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS outbox (
  outbox_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  work_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  dispatched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox (status, created_at ASC);

CREATE TABLE IF NOT EXISTS task_graph_nodes (
  work_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (work_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_graph_work
  ON task_graph_nodes (work_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS inbox_messages (
  message_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  kind TEXT NOT NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbox_workspace
  ON inbox_messages (workspace_id, created_at ASC);

CREATE TABLE IF NOT EXISTS work_ledger_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  work_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (work_id, version)
);

CREATE INDEX IF NOT EXISTS idx_work_ledger_work
  ON work_ledger_entries (work_id, version ASC);

CREATE TABLE IF NOT EXISTS goal_documents (
  goal_document_id TEXT NOT NULL,
  goal_contract_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  validated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (goal_document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_goal_documents_contract
  ON goal_documents (goal_contract_id, version DESC);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY NOT NULL,
  stream_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  task_id TEXT,
  work_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (stream_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_stream
  ON events (stream_id, seq ASC);

CREATE TABLE IF NOT EXISTS task_substates (
  work_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  machine TEXT NOT NULL,
  state TEXT NOT NULL,
  checkpoint_id TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (work_id, task_id, machine)
);

CREATE INDEX IF NOT EXISTS idx_task_substates_work
  ON task_substates (work_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS evidence_records (
  evidence_id TEXT PRIMARY KEY NOT NULL,
  work_id TEXT NOT NULL,
  task_id TEXT,
  goal_contract_id TEXT,
  goal_contract_version INTEGER,
  status TEXT NOT NULL,
  kind TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_work
  ON evidence_records (work_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS attempts (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  work_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  executor_id TEXT,
  adapter_id TEXT,
  process_session_id TEXT,
  run_id TEXT,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_work
  ON attempts (work_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_idempotency
  ON attempts (work_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
`;

/**
 * Schema v8 — V5-M02 Attempt binding: executor_id + adapter_id (additive).
 * Fresh DBs get columns via CREATE; older v7 DBs via ALTER (see store migrateAttemptsV8).
 */
export const STATE_DB_SCHEMA_VERSION = "8";

/** Columns added in schema v8 (V5-M02). Applied via ALTER when upgrading v7 DBs. */
export const ATTEMPTS_V8_COLUMNS: ReadonlyArray<{ name: string; sqlType: string }> = [
  { name: "executor_id", sqlType: "TEXT" },
  { name: "adapter_id", sqlType: "TEXT" },
];

/** Columns added in schema v5 (V0-TOK-01). Applied via ALTER when upgrading older DBs. */
export const TOKEN_LEDGER_V5_COLUMNS: ReadonlyArray<{ name: string; sqlType: string }> = [
  { name: "subsystem", sqlType: "TEXT" },
  { name: "model_requested", sqlType: "TEXT" },
  { name: "model_served", sqlType: "TEXT" },
  { name: "tokens_system", sqlType: "INTEGER" },
  { name: "tokens_context", sqlType: "INTEGER" },
  { name: "tokens_tools", sqlType: "INTEGER" },
  { name: "tokens_output", sqlType: "INTEGER" },
  { name: "tokens_cache_hit", sqlType: "INTEGER" },
];

/** SQLite PRAGMA synchronous numeric: 0=OFF 1=NORMAL 2=FULL 3=EXTRA */
export const SQLITE_SYNC_FULL = 2;
export const SQLITE_BUSY_TIMEOUT_MS = 5000;
