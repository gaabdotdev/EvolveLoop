/**
 * V1-TOK-15 — Microtask batching + semantic patch cache (SQLite).
 *
 * Groups microtasks that share a module path; caches patches by normalized
 * error signature using the same node:sqlite / WAL patterns as state-db.
 */

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

type DatabaseSyncInstance = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};
type DatabaseSyncCtor = new (path: string) => DatabaseSyncInstance;

const nodeRequire = createRequire(import.meta.url);
function loadDatabaseSync(): DatabaseSyncCtor {
  const mod = nodeRequire("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };
  return mod.DatabaseSync;
}

const PATCH_CACHE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS patch_cache (
  signature TEXT PRIMARY KEY NOT NULL,
  module_path TEXT NOT NULL,
  patch_text TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patch_cache_module
  ON patch_cache (module_path, updated_at DESC);
`;

export interface Microtask {
  id: string;
  module_path: string;
  error_text: string;
  payload?: Record<string, unknown>;
}

export interface MicrotaskBatch {
  module_path: string;
  tasks: Microtask[];
}

export interface PatchCacheEntry {
  signature: string;
  module_path: string;
  patch_text: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

export interface PatchCacheLookup {
  hit: boolean;
  signature: string;
  entry: PatchCacheEntry | null;
}

/**
 * Normalize error text for stable cache keys:
 * strip absolute paths, line/col noise, whitespace collapse.
 */
export function normalizeErrorSignature(errorText: string, modulePath?: string): string {
  let s = errorText.normalize("NFKC");
  s = s.replace(/\r\n/g, "\n");
  // Absolute unix/windows paths → <path>
  s = s.replace(/(?:[A-Za-z]:)?(?:\\|\/)(?:[^\s:]+(?:\\|\/))+[^\s:]+/g, "<path>");
  // file:line:col → file:<L>:<C>
  s = s.replace(/:(\d+):(\d+)/g, ":<L>:<C>");
  s = s.replace(/\bline\s+\d+\b/gi, "line <N>");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  const base = modulePath ? `${modulePath}::${s}` : s;
  return createHash("sha256").update(base, "utf-8").digest("hex");
}

/** Group microtasks that share the same module_path (stable order by id). */
export function batchMicrotasksByModule(tasks: Microtask[]): MicrotaskBatch[] {
  const map = new Map<string, Microtask[]>();
  for (const t of tasks) {
    const key = t.module_path;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  const batches: MicrotaskBatch[] = [];
  for (const [module_path, group] of map) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    batches.push({ module_path, tasks: group });
  }
  batches.sort((a, b) => a.module_path.localeCompare(b.module_path));
  return batches;
}

export class SemanticPatchCache {
  readonly path: string;
  private readonly db: DatabaseSyncInstance;

  constructor(dbPath: string) {
    this.path = resolve(dbPath);
    mkdirSync(dirname(this.path), { recursive: true });
    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(this.path);
    this.db.exec(PATCH_CACHE_SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  put(modulePath: string, errorText: string, patchText: string): PatchCacheEntry {
    const signature = normalizeErrorSignature(errorText, modulePath);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(`SELECT signature FROM patch_cache WHERE signature = ?`)
      .get(signature) as { signature: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE patch_cache SET patch_text = ?, module_path = ?, updated_at = ?
           WHERE signature = ?`,
        )
        .run(patchText, modulePath, now, signature);
    } else {
      this.db
        .prepare(
          `INSERT INTO patch_cache(signature, module_path, patch_text, hit_count, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`,
        )
        .run(signature, modulePath, patchText, now, now);
    }
    return this.getBySignature(signature)!;
  }

  lookup(modulePath: string, errorText: string): PatchCacheLookup {
    const signature = normalizeErrorSignature(errorText, modulePath);
    const entry = this.getBySignature(signature);
    if (!entry) {
      return { hit: false, signature, entry: null };
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE patch_cache SET hit_count = hit_count + 1, updated_at = ? WHERE signature = ?`,
      )
      .run(now, signature);
    return { hit: true, signature, entry: this.getBySignature(signature) };
  }

  private getBySignature(signature: string): PatchCacheEntry | null {
    const row = this.db
      .prepare(
        `SELECT signature, module_path, patch_text, hit_count, created_at, updated_at
         FROM patch_cache WHERE signature = ?`,
      )
      .get(signature) as PatchCacheEntry | undefined;
    return row ?? null;
  }
}
