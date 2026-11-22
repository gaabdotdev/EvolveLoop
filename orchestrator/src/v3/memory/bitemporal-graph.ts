/**
 * V3-MEM-05 — Bi-Temporal Graph.
 *
 * Two orthogonal time axes (Snodgrass-style):
 *   valid_from / valid_to  — when the fact was true in the domain (valid time)
 *   tx_time / tx_until     — when the system recorded / retracted it (transaction time)
 *
 * Point-in-time reconstruction answers: "what was true at valid time T,
 * according to knowledge as-of transaction time A?"
 *
 *   valid_from <= T < valid_to   (null valid_to = +∞)
 *   tx_time    <= A < tx_until   (null tx_until = still current)
 *
 * Persistence: better-sqlite3 (same stack as HybridGraphStore); `:memory:` for tests.
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export const BITEMPORAL_SCHEMA_VERSION = "1";

export const BITEMPORAL_FACT_STATUSES = ["ASSERTED", "INVALIDATED", "SUPERSEDED"] as const;
export type BitemporalFactStatus = (typeof BITEMPORAL_FACT_STATUSES)[number];

export const BITEMPORAL_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bitemporal_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bitemporal_facts (
  fact_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  tx_time TEXT NOT NULL,
  tx_until TEXT,
  status TEXT NOT NULL,
  superseded_by TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bitemporal_project
  ON bitemporal_facts (project_id);

CREATE INDEX IF NOT EXISTS idx_bitemporal_triple
  ON bitemporal_facts (project_id, subject, predicate, object);

CREATE INDEX IF NOT EXISTS idx_bitemporal_valid
  ON bitemporal_facts (project_id, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_bitemporal_tx
  ON bitemporal_facts (project_id, tx_time, tx_until);
`;

export class BitemporalGraphError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BitemporalGraphError";
  }
}

/** One bi-temporal assertion (graph edge / fact version). */
export interface BitemporalFact {
  fact_id: string;
  project_id: string;
  subject: string;
  predicate: string;
  object: string;
  /** Domain/application time: fact starts being true (inclusive). ISO-8601. */
  valid_from: string;
  /** Domain/application time: fact stops being true (exclusive). Null = open. */
  valid_to: string | null;
  /** System/transaction time when this version was recorded. ISO-8601. */
  tx_time: string;
  /** System/transaction time when this version was retracted. Null = still current. */
  tx_until: string | null;
  status: BitemporalFactStatus;
  superseded_by: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AssertFactInput {
  subject: string;
  predicate: string;
  object: string;
  valid_from: string;
  /** Exclusive end of valid time; omit/null = open-ended. */
  valid_to?: string | null;
  /** Transaction time of this assertion (when the system learned it). */
  tx_time: string;
  payload?: Record<string, unknown>;
  /** Optional stable id (tests); otherwise UUID. */
  fact_id?: string;
}

export interface SupersedeInput {
  /** Fact to close in transaction time. */
  fact_id: string;
  /** Transaction time of the supersession. */
  tx_time: string;
  /** Replacement assertion (may change object / valid interval / payload). */
  replacement: Omit<AssertFactInput, "tx_time"> & { tx_time?: string };
}

export interface PointInTimeQuery {
  /** Valid-time instant T — "what was true on date T?". */
  valid_at: string;
  /**
   * Transaction as-of A — knowledge available at A.
   * Defaults to clock() so "now" sees all committed assertions.
   */
  as_of?: string;
  subject?: string;
  predicate?: string;
  object?: string;
}

export interface BitemporalGraphOptions {
  /** Injectable clock for created_at / default as_of (ISO-8601). */
  now?: () => string;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function requireNonEmpty(label: string, value: string): string {
  const v = value.trim();
  if (!v) {
    throw new BitemporalGraphError("VALUE_REQUIRED", `${label} must be non-empty`);
  }
  return v;
}

/** Lexicographic compare works for zero-padded ISO-8601 timestamps. */
function cmpIso(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function assertIsoOrder(label: string, earlier: string, later: string): void {
  if (cmpIso(earlier, later) > 0) {
    throw new BitemporalGraphError(
      "TEMPORAL_ORDER",
      `${label}: ${earlier} must be <= ${later}`,
    );
  }
}

/**
 * Valid-time half-open interval: valid_from <= T < valid_to (null valid_to = +∞).
 */
export function isValidAt(fact: Pick<BitemporalFact, "valid_from" | "valid_to">, T: string): boolean {
  if (cmpIso(fact.valid_from, T) > 0) return false;
  if (fact.valid_to != null && cmpIso(T, fact.valid_to) >= 0) return false;
  return true;
}

/**
 * Transaction-time half-open interval: tx_time <= A < tx_until (null tx_until = +∞).
 */
export function isKnownAsOf(
  fact: Pick<BitemporalFact, "tx_time" | "tx_until">,
  asOf: string,
): boolean {
  if (cmpIso(fact.tx_time, asOf) > 0) return false;
  if (fact.tx_until != null && cmpIso(asOf, fact.tx_until) >= 0) return false;
  return true;
}

export function defaultBitemporalDbPath(projectId: string, baseDir?: string): string {
  const root = baseDir ?? join(process.cwd(), ".evolveloop", "memory");
  return join(root, projectId, "bitemporal.sqlite3");
}

function rowToFact(row: Record<string, unknown>): BitemporalFact {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    fact_id: String(row.fact_id),
    project_id: String(row.project_id),
    subject: String(row.subject),
    predicate: String(row.predicate),
    object: String(row.object),
    valid_from: String(row.valid_from),
    valid_to: row.valid_to == null ? null : String(row.valid_to),
    tx_time: String(row.tx_time),
    tx_until: row.tx_until == null ? null : String(row.tx_until),
    status: String(row.status) as BitemporalFactStatus,
    superseded_by: row.superseded_by == null ? null : String(row.superseded_by),
    payload,
    created_at: String(row.created_at),
  };
}

export class BitemporalGraph {
  private readonly db: Database.Database;
  private readonly now: () => string;
  readonly project_id: string;

  constructor(dbPath: string, projectId: string, options?: BitemporalGraphOptions) {
    this.project_id = requireNonEmpty("project_id", projectId);
    this.now = options?.now ?? defaultNow;

    const path = dbPath === ":memory:" ? ":memory:" : resolve(dbPath);
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    this.db.exec(BITEMPORAL_SCHEMA_SQL);
    this.db
      .prepare(
        `INSERT INTO bitemporal_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(BITEMPORAL_SCHEMA_VERSION);
    this.db
      .prepare(
        `INSERT INTO bitemporal_meta (key, value) VALUES ('project_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(this.project_id);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Assert a fact with independent valid time and transaction time.
   * Does not auto-close overlapping prior versions — use supersede for that.
   */
  assertFact(input: AssertFactInput): BitemporalFact {
    const subject = requireNonEmpty("subject", input.subject);
    const predicate = requireNonEmpty("predicate", input.predicate);
    const object = requireNonEmpty("object", input.object);
    const valid_from = requireNonEmpty("valid_from", input.valid_from);
    const tx_time = requireNonEmpty("tx_time", input.tx_time);
    const valid_to =
      input.valid_to == null || input.valid_to === ""
        ? null
        : requireNonEmpty("valid_to", input.valid_to);

    if (valid_to != null) {
      assertIsoOrder("valid_from/valid_to", valid_from, valid_to);
      if (cmpIso(valid_from, valid_to) === 0) {
        throw new BitemporalGraphError(
          "VALID_INTERVAL_EMPTY",
          `valid_from == valid_to (${valid_from}) yields an empty interval`,
        );
      }
    }

    const fact_id = input.fact_id?.trim() || randomUUID();
    const created_at = this.now();
    const payload = input.payload ?? {};
    const payload_json = JSON.stringify(payload);

    try {
      this.db
        .prepare(
          `INSERT INTO bitemporal_facts (
            fact_id, project_id, subject, predicate, object,
            valid_from, valid_to, tx_time, tx_until, status,
            superseded_by, payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ASSERTED', NULL, ?, ?)`,
        )
        .run(
          fact_id,
          this.project_id,
          subject,
          predicate,
          object,
          valid_from,
          valid_to,
          tx_time,
          payload_json,
          created_at,
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("PRIMARY")) {
        throw new BitemporalGraphError("FACT_ID_EXISTS", `fact_id already exists: ${fact_id}`);
      }
      throw err;
    }

    return this.getFact(fact_id)!;
  }

  /**
   * Invalidate (retract) a fact in transaction time only.
   * Valid-time interval is preserved — historical "what was true at T" still
   * reconstructs the fact when as_of < tx_until of the invalidation.
   */
  invalidate(fact_id: string, tx_time: string): BitemporalFact {
    const id = requireNonEmpty("fact_id", fact_id);
    const tx = requireNonEmpty("tx_time", tx_time);
    const fact = this.getFact(id);
    if (!fact) {
      throw new BitemporalGraphError("FACT_NOT_FOUND", `fact not found: ${id}`);
    }
    if (fact.status !== "ASSERTED" || fact.tx_until != null) {
      throw new BitemporalGraphError(
        "FACT_NOT_CURRENT",
        `fact ${id} is not currently asserted (status=${fact.status})`,
      );
    }
    assertIsoOrder("tx_time/tx_until", fact.tx_time, tx);
    if (cmpIso(fact.tx_time, tx) === 0) {
      throw new BitemporalGraphError(
        "TX_INTERVAL_EMPTY",
        `invalidate tx_time must be > assertion tx_time (${fact.tx_time})`,
      );
    }

    this.db
      .prepare(
        `UPDATE bitemporal_facts
         SET tx_until = ?, status = 'INVALIDATED'
         WHERE fact_id = ? AND project_id = ?`,
      )
      .run(tx, id, this.project_id);

    return this.getFact(id)!;
  }

  /**
   * Supersede: close prior fact in transaction time and assert a replacement.
   * Replacement tx_time defaults to the supersession tx_time.
   */
  supersede(input: SupersedeInput): { prior: BitemporalFact; next: BitemporalFact } {
    const priorId = requireNonEmpty("fact_id", input.fact_id);
    const tx = requireNonEmpty("tx_time", input.tx_time);
    const prior = this.getFact(priorId);
    if (!prior) {
      throw new BitemporalGraphError("FACT_NOT_FOUND", `fact not found: ${priorId}`);
    }
    if (prior.status !== "ASSERTED" || prior.tx_until != null) {
      throw new BitemporalGraphError(
        "FACT_NOT_CURRENT",
        `fact ${priorId} is not currently asserted (status=${prior.status})`,
      );
    }
    assertIsoOrder("tx_time/tx_until", prior.tx_time, tx);
    if (cmpIso(prior.tx_time, tx) === 0) {
      throw new BitemporalGraphError(
        "TX_INTERVAL_EMPTY",
        `supersede tx_time must be > assertion tx_time (${prior.tx_time})`,
      );
    }

    const replacementTx = input.replacement.tx_time?.trim() || tx;
    assertIsoOrder("prior.tx_time/replacement.tx_time", prior.tx_time, replacementTx);

    const txn = this.db.transaction(() => {
      const next = this.assertFact({
        ...input.replacement,
        tx_time: replacementTx,
      });
      this.db
        .prepare(
          `UPDATE bitemporal_facts
           SET tx_until = ?, status = 'SUPERSEDED', superseded_by = ?
           WHERE fact_id = ? AND project_id = ?`,
        )
        .run(tx, next.fact_id, priorId, this.project_id);
      return next;
    });

    const next = txn();
    return { prior: this.getFact(priorId)!, next };
  }

  /**
   * Reconstruct facts true at valid time T under transaction as-of A.
   * Stable order: subject, predicate, object, fact_id ASC.
   */
  queryPointInTime(T: string, options?: Omit<PointInTimeQuery, "valid_at">): BitemporalFact[];
  queryPointInTime(query: PointInTimeQuery): BitemporalFact[];
  queryPointInTime(
    TOrQuery: string | PointInTimeQuery,
    options?: Omit<PointInTimeQuery, "valid_at">,
  ): BitemporalFact[] {
    const q: PointInTimeQuery =
      typeof TOrQuery === "string"
        ? { valid_at: TOrQuery, ...options }
        : TOrQuery;

    const T = requireNonEmpty("valid_at", q.valid_at);
    const asOf = q.as_of != null && q.as_of !== "" ? requireNonEmpty("as_of", q.as_of) : this.now();

    const clauses = [`project_id = ?`, `valid_from <= ?`, `(valid_to IS NULL OR valid_to > ?)`];
    const params: unknown[] = [this.project_id, T, T];

    // Transaction as-of filter
    clauses.push(`tx_time <= ?`);
    params.push(asOf);
    clauses.push(`(tx_until IS NULL OR tx_until > ?)`);
    params.push(asOf);

    if (q.subject != null && q.subject !== "") {
      clauses.push(`subject = ?`);
      params.push(q.subject);
    }
    if (q.predicate != null && q.predicate !== "") {
      clauses.push(`predicate = ?`);
      params.push(q.predicate);
    }
    if (q.object != null && q.object !== "") {
      clauses.push(`object = ?`);
      params.push(q.object);
    }

    const sql = `
      SELECT * FROM bitemporal_facts
      WHERE ${clauses.join(" AND ")}
      ORDER BY subject ASC, predicate ASC, object ASC, fact_id ASC
    `;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToFact);
  }

  getFact(fact_id: string): BitemporalFact | null {
    const row = this.db
      .prepare(`SELECT * FROM bitemporal_facts WHERE fact_id = ? AND project_id = ?`)
      .get(fact_id, this.project_id) as Record<string, unknown> | undefined;
    return row ? rowToFact(row) : null;
  }

  /** All versions for a triple (including invalidated/superseded), tx_time ASC. */
  listVersions(subject: string, predicate: string, object?: string): BitemporalFact[] {
    const s = requireNonEmpty("subject", subject);
    const p = requireNonEmpty("predicate", predicate);
    if (object == null || object === "") {
      const rows = this.db
        .prepare(
          `SELECT * FROM bitemporal_facts
           WHERE project_id = ? AND subject = ? AND predicate = ?
           ORDER BY tx_time ASC, fact_id ASC`,
        )
        .all(this.project_id, s, p) as Record<string, unknown>[];
      return rows.map(rowToFact);
    }
    const o = requireNonEmpty("object", object);
    const rows = this.db
      .prepare(
        `SELECT * FROM bitemporal_facts
         WHERE project_id = ? AND subject = ? AND predicate = ? AND object = ?
         ORDER BY tx_time ASC, fact_id ASC`,
      )
      .all(this.project_id, s, p, o) as Record<string, unknown>[];
    return rows.map(rowToFact);
  }

  schemaVersion(): string {
    const row = this.db
      .prepare(`SELECT value FROM bitemporal_meta WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    return row?.value ?? BITEMPORAL_SCHEMA_VERSION;
  }
}
