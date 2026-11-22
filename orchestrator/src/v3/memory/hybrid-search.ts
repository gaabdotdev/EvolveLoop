/**
 * V1-MEM-01 — Hybrid local search: FTS5 + sqlite-vec + RRF + light reranker.
 *
 * Production hosts without the extension keep FTS-only fallback via UnavailableVectorSearch.
 * When `sqlite-vec` loads, the vector channel participates in RRF.
 */

import * as sqliteVec from "sqlite-vec";
import type { MemoryRecord, MemorySearchHit } from "./types.js";

export const SQLITE_VEC_GAP =
  "GAP:sqlite-vec_extension_unavailable — vector channel omitted; RRF over FTS(+secondary)";

/** Default embedding dimensionality for the local hashing embedder + vec0 table. */
export const DEFAULT_MEMORY_VEC_DIMS = 32;

/** Last load failure message (set by tryLoadSqliteVec). Null when load succeeded. */
let lastSqliteVecLoadError: string | null = null;

export function getSqliteVecLoadError(): string | null {
  return lastSqliteVecLoadError;
}

export interface VectorSearchPort {
  readonly available: boolean;
  readonly gap?: string;
  /** Return memory_id → distance (lower better) for a query embedding / text. */
  search(query: string, limit: number): Array<{ memory_id: string; distance: number }>;
  /** Optional: upsert an embedding for a memory row. */
  upsert?(memory_id: string, embedding: Float32Array | number[], project_id?: string): void;
  /** Optional: remove embedding. */
  remove?(memory_id: string): void;
}

/** Stub when sqlite-vec is not loaded. */
export class UnavailableVectorSearch implements VectorSearchPort {
  readonly available = false;
  readonly gap: string;
  constructor(gap: string = SQLITE_VEC_GAP) {
    this.gap = gap;
  }
  search(): Array<{ memory_id: string; distance: number }> {
    return [];
  }
}

/** Minimal better-sqlite3 surface used by the vec port. */
export interface SqliteVecDb {
  loadExtension(file: string, entrypoint?: string): void;
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
}

export interface RrfChannelHit {
  memory_id: string;
  /** Rank position starting at 1 (best). */
  rank: number;
}

export interface HybridSearchHit {
  memory_id: string;
  rrf_score: number;
  rerank_score: number;
  channels: string[];
  record?: MemoryRecord;
}

export interface HybridSearchOptions {
  /** RRF constant k (default 60). */
  k?: number;
  limit?: number;
  /** Query text for light lexical reranker. */
  query: string;
  fts_hits: MemorySearchHit[];
  vector?: VectorSearchPort;
  /** Optional second lexical channel (e.g. title-only ranks). */
  secondary_hits?: MemorySearchHit[];
}

/**
 * Deterministic local text → float32 embedding (feature hashing).
 * Enough for tests and a lexical-semantic bridge without an external model.
 */
export function hashEmbedText(text: string, dims = DEFAULT_MEMORY_VEC_DIMS): Float32Array {
  const out = new Float32Array(dims);
  const tokens = text.toLowerCase().match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? [];
  for (const t of tokens) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const idx = h % dims;
    const sign = (h & 1) === 0 ? 1 : -1;
    out[idx]! += sign;
  }
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += out[i]! * out[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) out[i]! /= norm;
  return out;
}

function embeddingToJson(embedding: Float32Array | number[]): string {
  return JSON.stringify(Array.from(embedding));
}

/**
 * sqlite-vec backed VectorSearchPort (vec0 virtual table + KNN MATCH).
 */
export class SqliteVecSearch implements VectorSearchPort {
  readonly available = true;
  readonly dims: number;
  private readonly projectId: string | undefined;
  private readonly embedQuery: (text: string) => Float32Array;

  constructor(
    private readonly db: SqliteVecDb,
    opts?: {
      dims?: number;
      project_id?: string;
      embed?: (text: string) => Float32Array;
    },
  ) {
    this.dims = opts?.dims ?? DEFAULT_MEMORY_VEC_DIMS;
    this.projectId = opts?.project_id;
    this.embedQuery = opts?.embed ?? ((t) => hashEmbedText(t, this.dims));
    this.ensureSchema();
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
        embedding float[${this.dims}],
        +memory_id text,
        +project_id text
      );
    `);
  }

  upsert(memory_id: string, embedding: Float32Array | number[], project_id?: string): void {
    const pid = project_id ?? this.projectId ?? "";
    this.db.prepare(`DELETE FROM memory_vec WHERE memory_id = ?`).run(memory_id);
    this.db
      .prepare(`INSERT INTO memory_vec(embedding, memory_id, project_id) VALUES (?, ?, ?)`)
      .run(embeddingToJson(embedding), memory_id, pid);
  }

  remove(memory_id: string): void {
    this.db.prepare(`DELETE FROM memory_vec WHERE memory_id = ?`).run(memory_id);
  }

  search(query: string, limit: number): Array<{ memory_id: string; distance: number }> {
    const k = Math.min(Math.max(limit, 1), 100);
    const q = embeddingToJson(this.embedQuery(query));
    const rows = this.db
      .prepare(
        `
        SELECT memory_id, project_id, distance
        FROM memory_vec
        WHERE embedding MATCH ?
          AND k = ?
        ORDER BY distance
        `,
      )
      .all(q, k) as Array<{ memory_id: string; project_id: string; distance: number }>;

    const filtered = this.projectId
      ? rows.filter((r) => r.project_id === this.projectId)
      : rows;

    return filtered.map((r) => ({
      memory_id: String(r.memory_id),
      distance: Number(r.distance),
    }));
  }
}

/**
 * Reciprocal Rank Fusion: score = Σ 1/(k + rank_i)
 */
export function reciprocalRankFusion(
  channels: Array<{ name: string; hits: RrfChannelHit[] }>,
  k = 60,
): Array<{ memory_id: string; rrf_score: number; channels: string[] }> {
  const scores = new Map<string, { score: number; channels: Set<string> }>();
  for (const ch of channels) {
    for (const hit of ch.hits) {
      const add = 1 / (k + hit.rank);
      const cur = scores.get(hit.memory_id) ?? { score: 0, channels: new Set() };
      cur.score += add;
      cur.channels.add(ch.name);
      scores.set(hit.memory_id, cur);
    }
  }
  return [...scores.entries()]
    .map(([memory_id, v]) => ({
      memory_id,
      rrf_score: v.score,
      channels: [...v.channels],
    }))
    .sort((a, b) => b.rrf_score - a.rrf_score);
}

/** Light reranker: boost title/body token overlap after RRF. */
export function lightRerank(
  query: string,
  fused: Array<{ memory_id: string; rrf_score: number; channels: string[] }>,
  records: Map<string, MemoryRecord>,
): HybridSearchHit[] {
  const qTokens = new Set(
    (query.toLowerCase().match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? []).slice(0, 48),
  );
  return fused
    .map((f) => {
      const rec = records.get(f.memory_id);
      let overlap = 0;
      if (rec && qTokens.size > 0) {
        const text = `${rec.title} ${rec.body}`.toLowerCase();
        for (const t of qTokens) {
          if (text.includes(t)) overlap += 1;
        }
      }
      const rerank_score = f.rrf_score + overlap * 0.01;
      return {
        memory_id: f.memory_id,
        rrf_score: f.rrf_score,
        rerank_score,
        channels: f.channels,
        record: rec,
      };
    })
    .sort((a, b) => b.rerank_score - a.rerank_score);
}

function ftsToRrf(hits: MemorySearchHit[]): RrfChannelHit[] {
  return hits.map((h, i) => ({ memory_id: h.record.memory_id, rank: i + 1 }));
}

/**
 * Hybrid search orchestration. Always includes FTS; vec when available.
 */
export function hybridSearch(opts: HybridSearchOptions): {
  hits: HybridSearchHit[];
  gaps: string[];
  channels_used: string[];
} {
  const k = opts.k ?? 60;
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const gaps: string[] = [];
  const channels: Array<{ name: string; hits: RrfChannelHit[] }> = [];
  const channels_used: string[] = [];

  if (opts.fts_hits.length > 0) {
    channels.push({ name: "fts5", hits: ftsToRrf(opts.fts_hits) });
    channels_used.push("fts5");
  }

  if (opts.secondary_hits && opts.secondary_hits.length > 0) {
    channels.push({ name: "lexical_secondary", hits: ftsToRrf(opts.secondary_hits) });
    channels_used.push("lexical_secondary");
  }

  const vector = opts.vector ?? new UnavailableVectorSearch();
  if (!vector.available) {
    gaps.push(vector.gap ?? SQLITE_VEC_GAP);
  } else {
    const vHits = vector.search(opts.query, limit).map((h, i) => ({
      memory_id: h.memory_id,
      rank: i + 1,
    }));
    if (vHits.length > 0) {
      channels.push({ name: "sqlite_vec", hits: vHits });
      channels_used.push("sqlite_vec");
    }
  }

  const records = new Map<string, MemoryRecord>();
  for (const h of opts.fts_hits) records.set(h.record.memory_id, h.record);
  for (const h of opts.secondary_hits ?? []) records.set(h.record.memory_id, h.record);

  const fused = reciprocalRankFusion(channels, k);
  const hits = lightRerank(opts.query, fused, records).slice(0, limit);
  return { hits, gaps, channels_used };
}

/**
 * Try to load official `sqlite-vec` into a better-sqlite3 Database.
 * Returns UnavailableVectorSearch (with exact error in gap) on failure.
 */
export function tryLoadSqliteVec(
  db: SqliteVecDb,
  opts?: {
    dims?: number;
    project_id?: string;
    embed?: (text: string) => Float32Array;
  },
): VectorSearchPort {
  lastSqliteVecLoadError = null;

  if (process.env.SQLITE_VEC_FORCE_UNAVAILABLE === "1") {
    const msg = "SQLITE_VEC_FORCE_UNAVAILABLE=1";
    lastSqliteVecLoadError = msg;
    return new UnavailableVectorSearch(`${SQLITE_VEC_GAP} (${msg})`);
  }

  try {
    if (process.env.SQLITE_VEC_EXTENSION) {
      db.loadExtension(process.env.SQLITE_VEC_EXTENSION);
    } else {
      sqliteVec.load(db);
    }

    // Prove extension is callable before advertising availability.
    const versionRow = db.prepare(`SELECT vec_version() AS v`).get() as { v?: string } | undefined;
    if (!versionRow?.v) {
      throw new Error("vec_version() returned empty after load");
    }

    return new SqliteVecSearch(db, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastSqliteVecLoadError = msg;
    return new UnavailableVectorSearch(`${SQLITE_VEC_GAP} (${msg})`);
  }
}
