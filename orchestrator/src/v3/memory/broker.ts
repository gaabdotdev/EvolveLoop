/**
 * Single MemoryBroker (V0-MEM-01..04) — FTS5/BM25 + project_id isolation + temporal + edges.
 * Uses better-sqlite3 because Node's built-in node:sqlite is compiled without ENABLE_FTS5.
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  MEMORY_COLD_V2_COLUMNS,
  MEMORY_DB_SCHEMA_SQL,
  MEMORY_DB_SCHEMA_VERSION,
} from "./schema.js";
import {
  ColdStorage,
  type ColdMigrateResult,
} from "./cold-storage.js";
import { assertPromotionGate, MemoryPromotionError } from "./promotion-gate.js";
import {
  hashEmbedText,
  hybridSearch,
  tryLoadSqliteVec,
  type HybridSearchHit,
  type VectorSearchPort,
} from "./hybrid-search.js";
import {
  engineerContext,
  type ContextEngineeringInput,
  type EngineeredContext,
} from "./context-engineering.js";
import {
  detectContradiction,
  dispositionForContradiction,
  type ContradictionDisposition,
} from "./contradiction.js";
import {
  assertTaintAllowed,
  evaluateTaintGate,
  taint,
  type TaintGateResult,
} from "../security/taint.js";
import {
  quarantineDerivedFromTaint,
  type QuarantineStore,
} from "../security/quarantine.js";
import type { CapabilityAction } from "../security/types.js";
import type {
  EdgeNodeKind,
  LinkEdgeInput,
  MemoryEdge,
  MemoryRecord,
  MemorySearchFilters,
  MemorySearchHit,
  MemoryStatus,
  MemoryType,
  ProposeMemoryInput,
  PromotionGateDecision,
} from "./types.js";

export class MemoryBrokerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MemoryBrokerError";
  }
}

export function defaultMemoryDbPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".evolveloop", "memory.db");
}

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(row: Record<string, unknown>): MemoryRecord {
  return {
    memory_id: String(row.memory_id),
    project_id: String(row.project_id),
    memory_type: row.memory_type as MemoryType,
    status: row.status as MemoryStatus,
    contract_version: Number(row.contract_version),
    title: String(row.title),
    body: String(row.body),
    source: String(row.source),
    created_at: String(row.created_at),
    tainted: Boolean(row.tainted),
    valid_from: row.valid_from == null ? null : String(row.valid_from),
    valid_to: row.valid_to == null ? null : String(row.valid_to),
    superseded_by: row.superseded_by == null ? null : String(row.superseded_by),
    payload:
      typeof row.payload_json === "string"
        ? (JSON.parse(row.payload_json) as Record<string, unknown>)
        : {},
    cas_hash: row.cas_hash == null || row.cas_hash === "" ? null : String(row.cas_hash),
    summary: row.summary == null || row.summary === "" ? null : String(row.summary),
    cold_migrated_at:
      row.cold_migrated_at == null || row.cold_migrated_at === ""
        ? null
        : String(row.cold_migrated_at),
  };
}

/** Tokenize free text into a safe FTS5 AND query. */
export function buildFtsQuery(text: string): string {
  const tokens = text.toLowerCase().match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? [];
  const parts: string[] = [];
  for (const t of tokens.slice(0, 32)) {
    const safe = t.replace(/"/g, "");
    if (safe) parts.push(`"${safe}"`);
  }
  return parts.join(" AND ");
}

const CHAIN: EdgeNodeKind[] = ["Goal", "Task", "File", "Evidence"];

function assertChainEdge(from: EdgeNodeKind, to: EdgeNodeKind): void {
  const fi = CHAIN.indexOf(from);
  const ti = CHAIN.indexOf(to);
  if (fi < 0 || ti < 0 || ti !== fi + 1) {
    throw new MemoryBrokerError(
      "EDGE_CHAIN_INVALID",
      `edges must follow Goal→Task→File→Evidence; got ${from}→${to}`,
    );
  }
}

/**
 * Rigid project-scoped MemoryBroker. Cross-project reads/writes throw.
 */
export class MemoryBroker {
  readonly path: string;
  readonly project_id: string;
  private readonly db: Database.Database;
  private readonly vectorPort: VectorSearchPort;
  /** Optional V2-SEC-01 quarantine ledger — blocks ACTIVE promotion while quarantined. */
  private readonly quarantine: QuarantineStore | undefined;

  constructor(
    dbPath: string,
    project_id: string,
    opts?: { vector?: VectorSearchPort; quarantine?: QuarantineStore },
  ) {
    if (!project_id || !project_id.trim()) {
      throw new MemoryBrokerError("PROJECT_ID_REQUIRED", "MemoryBroker requires project_id");
    }
    this.project_id = project_id.trim();
    if (dbPath === ":memory:") {
      this.path = ":memory:";
      this.db = new Database(":memory:");
    } else {
      this.path = resolve(dbPath);
      mkdirSync(dirname(this.path), { recursive: true });
      this.db = new Database(this.path);
    }
    this.db.exec(MEMORY_DB_SCHEMA_SQL);
    this.migrateColdPointerV2();
    this.db
      .prepare(
        `INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(MEMORY_DB_SCHEMA_VERSION);
    this.vectorPort =
      opts?.vector ??
      tryLoadSqliteVec(this.db, { project_id: this.project_id });
    this.quarantine = opts?.quarantine;
  }

  /** Idempotent ALTER for DBs created before schema v2 (V3-MEM-01 cold pointers). */
  private migrateColdPointerV2(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(memory_entries)`)
      .all() as Array<{ name: string }>;
    const have = new Set(cols.map((c) => c.name));
    for (const col of MEMORY_COLD_V2_COLUMNS) {
      if (have.has(col.name)) continue;
      this.db.exec(`ALTER TABLE memory_entries ADD COLUMN ${col.name} ${col.sqlType}`);
    }
  }

  close(): void {
    this.db.close();
  }

  journalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string };
    return String(row?.journal_mode ?? "unknown").toLowerCase();
  }

  private assertProject(project_id: string): void {
    if (project_id !== this.project_id) {
      throw new MemoryBrokerError(
        "PROJECT_ISOLATION",
        `refusing cross-project access: broker=${this.project_id} requested=${project_id}`,
      );
    }
  }

  /** Agents / writers may only create PROPOSED rows. */
  propose(input: ProposeMemoryInput): MemoryRecord {
    const created_at = nowIso();
    const memory_id = `mem-${randomUUID()}`;
    const record: MemoryRecord = {
      memory_id,
      project_id: this.project_id,
      memory_type: input.memory_type,
      status: "PROPOSED",
      contract_version: input.contract_version ?? 1,
      title: input.title,
      body: input.body,
      source: input.source,
      created_at,
      tainted: Boolean(input.tainted),
      valid_from: input.valid_from ?? created_at,
      valid_to: input.valid_to ?? null,
      superseded_by: null,
      payload: input.payload ?? {},
      cas_hash: null,
      summary: null,
      cold_migrated_at: null,
    };

    this.db
      .prepare(
        `INSERT INTO memory_entries(
          memory_id, project_id, memory_type, status, contract_version,
          title, body, source, created_at, tainted,
          valid_from, valid_to, superseded_by, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.memory_id,
        record.project_id,
        record.memory_type,
        record.status,
        record.contract_version,
        record.title,
        record.body,
        record.source,
        record.created_at,
        record.tainted ? 1 : 0,
        record.valid_from,
        record.valid_to,
        record.superseded_by,
        JSON.stringify(record.payload),
      );

    // V2-SEC-01 — tainted proposals enter quarantine until independent review.
    if (this.quarantine && record.tainted) {
      quarantineDerivedFromTaint(this.quarantine, {
        item_id: record.memory_id,
        item_kind: "memory",
        source_agent_id: record.source || "unknown_agent",
        tracked: taint(record.memory_id, "memory_tainted", record.memory_id),
        reason: "memory_proposed_tainted",
      });
    }

    this.indexMemoryEmbedding(record);
    return record;
  }

  /** Index (or refresh) the sqlite-vec embedding for a memory when the extension is loaded. */
  indexMemoryEmbedding(record: MemoryRecord, embedding?: Float32Array | number[]): void {
    if (!this.vectorPort.available || typeof this.vectorPort.upsert !== "function") return;
    const emb =
      embedding ?? hashEmbedText(`${record.title}\n${record.body}`);
    this.vectorPort.upsert(record.memory_id, emb, record.project_id);
  }

  /**
   * META-MEM-002 / AUD-MEM-02 — rebuild derived indexes from canonical `memory_entries`.
   * FTS5 content-sync table is rebuilt via FTS5 `rebuild`; sqlite-vec is cleared and
   * re-upserted from title+body (never treated as source of truth).
   */
  rebuildDerivedIndexes(): {
    fts_rebuilt: true;
    vec_reindexed: number;
    vec_available: boolean;
    canonical_rows: number;
  } {
    // FTS5 external-content rebuild from memory_entries (canonical).
    this.db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`);

    const rows = this.db
      .prepare(
        `SELECT memory_id, project_id, title, body FROM memory_entries WHERE project_id = ?`,
      )
      .all(this.project_id) as Array<{
      memory_id: string;
      project_id: string;
      title: string;
      body: string;
    }>;

    let vec_reindexed = 0;
    if (this.vectorPort.available && typeof this.vectorPort.upsert === "function") {
      // Drop derived vec rows for this project, then re-index from canonical text.
      try {
        this.db
          .prepare(`DELETE FROM memory_vec WHERE project_id = ?`)
          .run(this.project_id);
      } catch {
        // Table may not exist yet when vec port is Unavailable — ignore.
      }
      for (const row of rows) {
        this.vectorPort.upsert(
          row.memory_id,
          hashEmbedText(`${row.title}\n${row.body}`),
          row.project_id,
        );
        vec_reindexed += 1;
      }
    }

    return {
      fts_rebuilt: true,
      vec_reindexed,
      vec_available: this.vectorPort.available,
      canonical_rows: rows.length,
    };
  }

  get(memory_id: string): MemoryRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM memory_entries WHERE memory_id = ? AND project_id = ?`)
      .get(memory_id, this.project_id) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : undefined;
  }

  /**
   * V3-MEM-01 — migrate raw body/payload to content-addressed cold storage.
   * Active SQLite retains cas_hash + summary/metadata only (body emptied, payload cleared).
   */
  async migrateToCold(
    memory_id: string,
    cold: ColdStorage,
    opts?: { summary?: string },
  ): Promise<{ record: MemoryRecord; migration: ColdMigrateResult }> {
    const current = this.get(memory_id);
    if (!current) {
      throw new MemoryBrokerError("NOT_FOUND", `memory_id=${memory_id} not in project ${this.project_id}`);
    }
    if (current.cas_hash) {
      throw new MemoryBrokerError(
        "ALREADY_COLD",
        `memory_id=${memory_id} already cold (cas_hash=${current.cas_hash})`,
      );
    }

    const migration = await cold.migrateToCold({
      memory_id: current.memory_id,
      title: current.title,
      body: current.body,
      payload: current.payload,
      source: current.source,
      memory_type: current.memory_type,
      created_at: current.created_at,
      summary: opts?.summary ?? current.summary,
      cas_hash: current.cas_hash,
    });

    const ts = nowIso();
    // body ← summary (FTS still indexes a short preview); raw payload wiped.
    this.db
      .prepare(
        `UPDATE memory_entries
         SET body = ?, payload_json = '{}', cas_hash = ?, summary = ?, cold_migrated_at = ?
         WHERE memory_id = ? AND project_id = ?`,
      )
      .run(
        migration.summary,
        migration.cas_hash,
        migration.summary,
        ts,
        memory_id,
        this.project_id,
      );

    const record = this.get(memory_id);
    if (!record) {
      throw new MemoryBrokerError("MIGRATE_LOST", "row vanished after migrateToCold");
    }
    return { record, migration };
  }

  /** Fetch and verify the cold blob for a migrated memory row. */
  async getColdPayload(memory_id: string, cold: ColdStorage): Promise<Buffer> {
    const current = this.get(memory_id);
    if (!current) {
      throw new MemoryBrokerError("NOT_FOUND", `memory_id=${memory_id} not in project ${this.project_id}`);
    }
    if (!current.cas_hash) {
      throw new MemoryBrokerError("NOT_COLD", `memory_id=${memory_id} has no cas_hash`);
    }
    return cold.get(current.cas_hash);
  }

  /**
   * Promote PROPOSED → ACTIVE. Requires PromotionGateDecision.
   * Optionally supersedes a prior ACTIVE row (sets valid_to + superseded_by).
   */
  promote(memory_id: string, gate: PromotionGateDecision): MemoryRecord {
    assertPromotionGate(gate, {
      quarantine: this.quarantine,
      item_id: memory_id,
      target_status: "ACTIVE",
    });
    const current = this.get(memory_id);
    if (!current) {
      throw new MemoryBrokerError("NOT_FOUND", `memory_id=${memory_id} not in project ${this.project_id}`);
    }
    if (current.status !== "PROPOSED") {
      throw new MemoryPromotionError(
        "NOT_PROPOSED",
        `only PROPOSED memories can be promoted (status=${current.status})`,
      );
    }

    const ts = nowIso();
    const txn = this.db.transaction(() => {
      if (gate.supersede_memory_id) {
        const prior = this.get(gate.supersede_memory_id);
        if (!prior) {
          throw new MemoryBrokerError(
            "SUPERSEDE_NOT_FOUND",
            `supersede target missing: ${gate.supersede_memory_id}`,
          );
        }
        this.db
          .prepare(
            `UPDATE memory_entries
             SET status = 'SUPERSEDED', valid_to = ?, superseded_by = ?
             WHERE memory_id = ? AND project_id = ?`,
          )
          .run(ts, memory_id, gate.supersede_memory_id, this.project_id);
      }

      this.db
        .prepare(
          `UPDATE memory_entries
           SET status = 'ACTIVE', valid_from = COALESCE(valid_from, ?)
           WHERE memory_id = ? AND project_id = ?`,
        )
        .run(ts, memory_id, this.project_id);
    });
    txn();

    const promoted = this.get(memory_id);
    if (!promoted) throw new MemoryBrokerError("PROMOTE_LOST", "row vanished after promote");
    return promoted;
  }

  /** Lexical FTS5/BM25 search with metadata filters — always scoped to broker project_id. */
  search(
    query: string,
    filters: Omit<MemorySearchFilters, "project_id"> & { project_id?: string } = {},
  ): MemorySearchHit[] {
    const project_id = filters.project_id ?? this.project_id;
    this.assertProject(project_id);

    const fts = buildFtsQuery(query);
    if (!fts) return [];

    const clauses = [`e.project_id = ?`, `memory_fts MATCH ?`];
    const params: unknown[] = [project_id, fts];

    if (filters.memory_type) {
      clauses.push(`e.memory_type = ?`);
      params.push(filters.memory_type);
    }
    if (filters.status) {
      clauses.push(`e.status = ?`);
      params.push(filters.status);
    }
    if (filters.contract_version != null) {
      clauses.push(`e.contract_version = ?`);
      params.push(filters.contract_version);
    }
    if (!filters.include_tainted) {
      clauses.push(`e.tainted = 0`);
    }
    if (!filters.include_expired) {
      clauses.push(`e.valid_to IS NULL`);
    }

    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    params.push(limit);

    const sql = `
      SELECT e.*, bm25(memory_fts) AS bm25_score
      FROM memory_fts
      JOIN memory_entries e ON e.rowid = memory_fts.rowid
      WHERE ${clauses.join(" AND ")}
      ORDER BY bm25_score ASC
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      record: toRecord(row),
      bm25: Number(row.bm25_score),
    }));
  }

  /** List by metadata filters without FTS (still project-isolated). */
  list(filters: Omit<MemorySearchFilters, "project_id"> & { project_id?: string } = {}): MemoryRecord[] {
    const project_id = filters.project_id ?? this.project_id;
    this.assertProject(project_id);

    const clauses = [`project_id = ?`];
    const params: unknown[] = [project_id];
    if (filters.memory_type) {
      clauses.push(`memory_type = ?`);
      params.push(filters.memory_type);
    }
    if (filters.status) {
      clauses.push(`status = ?`);
      params.push(filters.status);
    }
    if (filters.contract_version != null) {
      clauses.push(`contract_version = ?`);
      params.push(filters.contract_version);
    }
    if (!filters.include_tainted) {
      clauses.push(`tainted = 0`);
    }
    if (!filters.include_expired) {
      clauses.push(`valid_to IS NULL`);
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM memory_entries WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  }

  linkEdge(input: LinkEdgeInput): MemoryEdge {
    assertChainEdge(input.from_kind, input.to_kind);
    const edge: MemoryEdge = {
      edge_id: `edge-${randomUUID()}`,
      project_id: this.project_id,
      from_kind: input.from_kind,
      from_id: input.from_id,
      to_kind: input.to_kind,
      to_id: input.to_id,
      relation: input.relation ?? `${input.from_kind}_to_${input.to_kind}`.toLowerCase(),
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO memory_edges(
          edge_id, project_id, from_kind, from_id, to_kind, to_id, relation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        edge.edge_id,
        edge.project_id,
        edge.from_kind,
        edge.from_id,
        edge.to_kind,
        edge.to_id,
        edge.relation,
        edge.created_at,
      );
    return edge;
  }

  listEdges(project_id?: string): MemoryEdge[] {
    const pid = project_id ?? this.project_id;
    this.assertProject(pid);
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_edges WHERE project_id = ? ORDER BY created_at ASC`,
      )
      .all(pid) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      edge_id: String(r.edge_id),
      project_id: String(r.project_id),
      from_kind: r.from_kind as EdgeNodeKind,
      from_id: String(r.from_id),
      to_kind: r.to_kind as EdgeNodeKind,
      to_id: String(r.to_id),
      relation: String(r.relation),
      created_at: String(r.created_at),
    }));
  }

  /** Convenience: Goal → Task → File → Evidence chain in one call. */
  linkGoalTaskFileEvidence(ids: {
    goal_id: string;
    task_id: string;
    file_id: string;
    evidence_id: string;
  }): MemoryEdge[] {
    return [
      this.linkEdge({ from_kind: "Goal", from_id: ids.goal_id, to_kind: "Task", to_id: ids.task_id }),
      this.linkEdge({ from_kind: "Task", from_id: ids.task_id, to_kind: "File", to_id: ids.file_id }),
      this.linkEdge({
        from_kind: "File",
        from_id: ids.file_id,
        to_kind: "Evidence",
        to_id: ids.evidence_id,
      }),
    ];
  }

  /** V1-MEM-01 — hybrid FTS5 + optional vec + RRF + light reranker. */
  hybridSearch(
    query: string,
    filters: Omit<MemorySearchFilters, "project_id"> & { project_id?: string } = {},
  ): { hits: HybridSearchHit[]; gaps: string[]; channels_used: string[] } {
    const fts_hits = this.search(query, filters);
    // Secondary channel: same FTS results re-ranked by title-only bm25 proxy (order preserved).
    const secondary_hits = [...fts_hits].sort((a, b) => {
      const at = a.record.title.toLowerCase();
      const bt = b.record.title.toLowerCase();
      const q = query.toLowerCase();
      return Number(bt.includes(q)) - Number(at.includes(q));
    });
    const result = hybridSearch({
      query,
      fts_hits,
      secondary_hits,
      vector: this.vectorPort,
      limit: filters.limit,
    });
    // Enrich vec-only hits with full records for the light reranker consumers.
    for (const hit of result.hits) {
      if (!hit.record) {
        hit.record = this.get(hit.memory_id);
      }
    }
    return result;
  }

  vectorSearchAvailable(): boolean {
    return this.vectorPort.available;
  }

  /** Expose the live vector port (tests / diagnostics). */
  getVectorPort(): VectorSearchPort {
    return this.vectorPort;
  }

  /** V1-MEM-02 — pack memories into token_budget prioritizing contract requirements. */
  engineerTaskContext(
    input: Omit<ContextEngineeringInput, "candidates"> & {
      candidates?: ContextEngineeringInput["candidates"];
      search_query?: string;
    },
  ): EngineeredContext {
    const candidates =
      input.candidates ??
      (input.search_query
        ? this.search(input.search_query, { status: "ACTIVE", limit: 50 })
        : this.list({ status: "ACTIVE", limit: 50 }));
    return engineerContext({
      token_budget: input.token_budget,
      contract_requirements: input.contract_requirements,
      candidates,
      chars_per_token: input.chars_per_token,
    });
  }

  /**
   * V1-SEC-04 — MemoryBroker refuses privileged actions driven by tainted memories.
   */
  gatePrivilegedAction(
    action: CapabilityAction,
    memory_ids: string[],
  ): TaintGateResult {
    const inputs = memory_ids.map((id) => {
      const rec = this.get(id);
      if (!rec) return null;
      return rec.tainted
        ? taint(rec.memory_id, "memory_tainted", rec.memory_id)
        : { tainted: false as const, value: rec.memory_id };
    });
    return evaluateTaintGate(action, inputs);
  }

  assertPrivilegedActionAllowed(action: CapabilityAction, memory_ids: string[]): TaintGateResult {
    const gate = this.gatePrivilegedAction(action, memory_ids);
    if (gate.blocked) {
      assertTaintAllowed(action, memory_ids.map((id) => {
        const rec = this.get(id);
        return rec?.tainted ? taint(id, "memory_tainted") : { tainted: false };
      }));
    }
    return gate;
  }

  /**
   * V1-MEM-03 — approve a conflicting decision: promote new, mark old SUPERSEDED or STALE.
   */
  approveConflictingDecision(
    new_memory_id: string,
    old_memory_id: string,
    gate: PromotionGateDecision,
    opts?: { prefer_stale?: boolean },
  ): {
    promoted: MemoryRecord;
    previous: MemoryRecord;
    disposition: ContradictionDisposition;
    signal: ReturnType<typeof detectContradiction>;
  } {
    assertPromotionGate(gate, {
      quarantine: this.quarantine,
      item_id: new_memory_id,
      target_status: "ACTIVE",
    });
    const incoming = this.get(new_memory_id);
    const existing = this.get(old_memory_id);
    if (!incoming || !existing) {
      throw new MemoryBrokerError(
        "NOT_FOUND",
        `approveConflictingDecision missing new=${new_memory_id} old=${old_memory_id}`,
      );
    }

    const signal = detectContradiction(existing, incoming);
    if (!signal.conflicts) {
      throw new MemoryBrokerError(
        "NO_CONTRADICTION",
        `memories do not conflict: ${signal.reason}`,
      );
    }
    const disposition = dispositionForContradiction(signal, opts);
    if (!disposition) {
      throw new MemoryBrokerError("NO_DISPOSITION", "contradiction disposition unresolved");
    }

    const ts = nowIso();
    const txn = this.db.transaction(() => {
      if (incoming.status === "PROPOSED") {
        this.db
          .prepare(
            `UPDATE memory_entries
             SET status = 'ACTIVE', valid_from = COALESCE(valid_from, ?)
             WHERE memory_id = ? AND project_id = ?`,
          )
          .run(ts, new_memory_id, this.project_id);
      }

      if (disposition === "SUPERSEDED") {
        this.db
          .prepare(
            `UPDATE memory_entries
             SET status = 'SUPERSEDED', valid_to = ?, superseded_by = ?
             WHERE memory_id = ? AND project_id = ?`,
          )
          .run(ts, new_memory_id, old_memory_id, this.project_id);
      } else {
        this.db
          .prepare(
            `UPDATE memory_entries
             SET status = 'STALE', valid_to = COALESCE(valid_to, ?), superseded_by = ?
             WHERE memory_id = ? AND project_id = ?`,
          )
          .run(ts, new_memory_id, old_memory_id, this.project_id);
      }
    });
    txn();

    const promoted = this.get(new_memory_id);
    const previous = this.get(old_memory_id);
    if (!promoted || !previous) {
      throw new MemoryBrokerError("CONFLICT_LOST", "rows vanished after contradiction approve");
    }
    return { promoted, previous, disposition, signal };
  }
}
