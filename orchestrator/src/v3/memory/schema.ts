/** Memory SQLite schema — FTS5 requires better-sqlite3 (node:sqlite ships without ENABLE_FTS5). */

/** v2: V3-MEM-01 cas_hash / summary / cold_migrated_at pointers on active rows. */
export const MEMORY_DB_SCHEMA_VERSION = "2";

/** Columns added in schema v2 (idempotent ALTER for DBs created at v1). */
export const MEMORY_COLD_V2_COLUMNS: ReadonlyArray<{ name: string; sqlType: string }> = [
  { name: "cas_hash", sqlType: "TEXT" },
  { name: "summary", sqlType: "TEXT" },
  { name: "cold_migrated_at", sqlType: "TEXT" },
];

export const MEMORY_DB_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  status TEXT NOT NULL,
  contract_version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tainted INTEGER NOT NULL DEFAULT 0,
  valid_from TEXT,
  valid_to TEXT,
  superseded_by TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  cas_hash TEXT,
  summary TEXT,
  cold_migrated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_project_status
  ON memory_entries (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_filters
  ON memory_entries (project_id, memory_type, status, contract_version);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  title,
  body,
  content='memory_entries',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
  INSERT INTO memory_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS memory_edges (
  edge_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_project
  ON memory_edges (project_id, from_kind, to_kind);

CREATE INDEX IF NOT EXISTS idx_memory_edges_from
  ON memory_edges (project_id, from_id);

CREATE INDEX IF NOT EXISTS idx_memory_edges_to
  ON memory_edges (project_id, to_id);
`;
