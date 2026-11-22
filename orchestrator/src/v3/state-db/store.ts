/**
 * SQLite WAL store for V0 durable state (.evolveloop/state.db).
 * Single transactional persistence: MSO, contracts, TaskGraph, Inbox, Work Ledger, Token Ledger.
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { GoalContract } from "../goal-contract/types.js";
import type { GoalDocument } from "../goal-document/types.js";
import {
  validateGoalContractStructural,
  validateGoalDocumentStructural,
} from "../goal-document/validate.js";
import { canTransitionMso, isMsoState, type MsoState } from "../mso/states.js";
import { MsoError } from "../mso/errors.js";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  SQLITE_SYNC_FULL,
  STATE_DB_SCHEMA_SQL,
  STATE_DB_SCHEMA_VERSION,
  TOKEN_LEDGER_V5_COLUMNS,
} from "./schema.js";
import type {
  CircuitRunRow,
  InboxMessageRow,
  MsoSession,
  MsoTransitionRow,
  OutboxRow,
  OutboxStatus,
  PersistedGoalContract,
  PersistedGoalDocument,
  TaskGraphNodeRow,
  TaskSubstateRow,
  TokenLedgerEntry,
  TokenLedgerInsert,
  TrivialOpRow,
  WorkLedgerDbEntry,
  WorkspaceLease,
  EventRow,
  EvidenceRecordRow,
  EvidenceStatus,
} from "./types.js";
import { extractShellHolderPid, isPidAlive } from "./process-alive.js";

/** Avoid static `import "node:sqlite"` — Vite/Vitest cannot resolve the stripped `sqlite` id. */
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

export class StateDbError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StateDbError";
  }
}

export function defaultStateDbPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".evolveloop", "state.db");
}

export class StateDb {
  readonly path: string;
  private readonly db: DatabaseSyncInstance;

  constructor(dbPath: string) {
    // Fail-honest: never treat ":memory:" as SQLite RAM — resolve(":memory:") would
    // create a durable file literally named ":memory:" and pretend ephemeral storage.
    if (!dbPath?.trim() || dbPath.trim() === ":memory:") {
      throw new StateDbError(
        "DISK_REQUIRED",
        "StateDb requires a filesystem path (SQLite WAL on disk); :memory: is refused",
      );
    }
    this.path = resolve(dbPath);
    mkdirSync(dirname(this.path), { recursive: true });
    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(this.path);
    this.db.exec(STATE_DB_SCHEMA_SQL);
    this.migrateTokenLedgerV5();
    this.db
      .prepare(
        `INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(STATE_DB_SCHEMA_VERSION);
  }

  /** Idempotent ALTER for DBs created before schema v5 (V0-TOK-01). */
  private migrateTokenLedgerV5(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(token_ledger)`)
      .all() as Array<{ name: string }>;
    const have = new Set(cols.map((c) => c.name));
    for (const col of TOKEN_LEDGER_V5_COLUMNS) {
      if (have.has(col.name)) continue;
      this.db.exec(`ALTER TABLE token_ledger ADD COLUMN ${col.name} ${col.sqlType}`);
    }
  }

  close(): void {
    this.db.close();
  }

  journalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
    return String(row?.journal_mode ?? "unknown").toLowerCase();
  }

  /** Numeric SQLite synchronous (2 = FULL). */
  synchronous(): number {
    const row = this.db.prepare("PRAGMA synchronous").get() as { synchronous?: number } | undefined;
    return Number(row?.synchronous ?? -1);
  }

  busyTimeoutMs(): number {
    const row = this.db.prepare("PRAGMA busy_timeout").get() as { timeout?: number } | undefined;
    return Number(row?.timeout ?? -1);
  }

  /**
   * PRAGMA integrity_check — returns first row message ("ok" when healthy).
   * AUD-ORCH-01: exposed so audits do not rely on ad-hoc SQL probes alone.
   */
  integrityCheck(): string {
    const row = this.db.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: string }
      | undefined;
    return String(row?.integrity_check ?? "unknown").toLowerCase();
  }

  assertWalPragmas(): void {
    if (this.journalMode() !== "wal") {
      throw new StateDbError("PRAGMA", `journal_mode=${this.journalMode()} expected wal`);
    }
    if (this.synchronous() !== SQLITE_SYNC_FULL) {
      throw new StateDbError("PRAGMA", `synchronous=${this.synchronous()} expected ${SQLITE_SYNC_FULL} (FULL)`);
    }
    if (this.busyTimeoutMs() !== SQLITE_BUSY_TIMEOUT_MS) {
      throw new StateDbError(
        "PRAGMA",
        `busy_timeout=${this.busyTimeoutMs()} expected ${SQLITE_BUSY_TIMEOUT_MS}`,
      );
    }
    const integrity = this.integrityCheck();
    if (integrity !== "ok") {
      throw new StateDbError("PRAGMA", `integrity_check=${integrity} expected ok`);
    }
  }

  /** Run fn inside BEGIN IMMEDIATE … COMMIT; rolls back on throw. */
  withTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore rollback errors */
      }
      throw err;
    }
  }

  listTables(): string[] {
    const rows = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  saveGoalContract(
    contract: GoalContract,
    opts?: { validated?: boolean; mso_confirmed?: boolean; skip_structural?: boolean },
  ): PersistedGoalContract {
    if (contract.kind !== "GoalContract") {
      throw new StateDbError("INVALID", "payload is not a GoalContract");
    }
    if (!contract.goal_contract_id?.trim()) {
      throw new StateDbError("INVALID", "goal_contract_id required");
    }
    if (!contract.objective?.trim()) {
      throw new StateDbError("INVALID", "objective required");
    }
    if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) {
      throw new StateDbError("INVALID", "criteria required");
    }
    if (!opts?.skip_structural) {
      const structural = validateGoalContractStructural(contract);
      if (!structural.ok) {
        throw new StateDbError(
          "STRUCTURAL_INVALID",
          `Goal Contract structural validation failed: ${structural.reasons.join(", ")}`,
        );
      }
    }

    const validated = opts?.validated !== false ? 1 : 0;
    const mso = opts?.mso_confirmed ? 1 : 0;
    const payload_json = JSON.stringify(contract);
    this.db
      .prepare(
        `INSERT INTO goal_contracts(
           goal_contract_id, version, objective, payload_json, validated,
           created_at, updated_at, work_id, mso_confirmed
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(goal_contract_id, version) DO UPDATE SET
           objective = excluded.objective,
           payload_json = excluded.payload_json,
           validated = excluded.validated,
           updated_at = excluded.updated_at,
           work_id = excluded.work_id,
           mso_confirmed = excluded.mso_confirmed`,
      )
      .run(
        contract.goal_contract_id,
        contract.version,
        contract.objective,
        payload_json,
        validated,
        contract.created_at,
        contract.updated_at,
        contract.work_id ?? null,
        mso,
      );

    return this.loadLatestGoalContract(contract.goal_contract_id)!;
  }

  loadLatestGoalContract(goalContractId: string): PersistedGoalContract | undefined {
    const row = this.db
      .prepare(
        `SELECT goal_contract_id, version, objective, payload_json, validated,
                created_at, updated_at, work_id, mso_confirmed
         FROM goal_contracts
         WHERE goal_contract_id = ?
         ORDER BY version DESC
         LIMIT 1`,
      )
      .get(goalContractId) as
      | {
          goal_contract_id: string;
          version: number;
          objective: string;
          payload_json: string;
          validated: number;
          created_at: string;
          updated_at: string;
          work_id: string | null;
          mso_confirmed: number;
        }
      | undefined;

    if (!row) return undefined;
    return {
      goal_contract_id: row.goal_contract_id,
      version: row.version,
      objective: row.objective,
      payload: JSON.parse(row.payload_json) as unknown,
      validated: row.validated === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      work_id: row.work_id ?? undefined,
      mso_confirmed: row.mso_confirmed === 1,
    };
  }

  /** Raw SELECT helper for tests / CLI proof without importing node:sqlite in callers. */
  queryOne<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  saveGoalDocument(
    doc: GoalDocument,
    opts?: { validated?: boolean; skip_structural?: boolean },
  ): PersistedGoalDocument {
    if (!opts?.skip_structural) {
      const structural = validateGoalDocumentStructural(doc);
      if (!structural.ok) {
        throw new StateDbError(
          "STRUCTURAL_INVALID",
          `Goal Document structural validation failed: ${structural.reasons.join(", ")}`,
        );
      }
    }
    const validated = opts?.validated !== false ? 1 : 0;
    const payload_json = JSON.stringify(doc);
    this.db
      .prepare(
        `INSERT INTO goal_documents(
           goal_document_id, goal_contract_id, version, title, objective, payload_json,
           validated, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(goal_document_id, version) DO UPDATE SET
           goal_contract_id = excluded.goal_contract_id,
           title = excluded.title,
           objective = excluded.objective,
           payload_json = excluded.payload_json,
           validated = excluded.validated,
           updated_at = excluded.updated_at`,
      )
      .run(
        doc.goal_document_id,
        doc.goal_contract_id,
        doc.version,
        doc.title,
        doc.objective,
        payload_json,
        validated,
        doc.created_at,
        doc.updated_at,
      );
    return this.loadLatestGoalDocument(doc.goal_document_id)!;
  }

  loadLatestGoalDocument(goalDocumentId: string): PersistedGoalDocument | undefined {
    const row = this.db
      .prepare(
        `SELECT goal_document_id, goal_contract_id, version, title, objective, payload_json,
                validated, created_at, updated_at
         FROM goal_documents
         WHERE goal_document_id = ?
         ORDER BY version DESC
         LIMIT 1`,
      )
      .get(goalDocumentId) as
      | {
          goal_document_id: string;
          goal_contract_id: string;
          version: number;
          title: string;
          objective: string;
          payload_json: string;
          validated: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      goal_document_id: row.goal_document_id,
      goal_contract_id: row.goal_contract_id,
      version: row.version,
      title: row.title,
      objective: row.objective,
      payload: JSON.parse(row.payload_json) as unknown,
      validated: row.validated === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  loadLatestGoalDocumentForContract(goalContractId: string): PersistedGoalDocument | undefined {
    const row = this.db
      .prepare(
        `SELECT goal_document_id, goal_contract_id, version, title, objective, payload_json,
                validated, created_at, updated_at
         FROM goal_documents
         WHERE goal_contract_id = ?
         ORDER BY version DESC, updated_at DESC
         LIMIT 1`,
      )
      .get(goalContractId) as
      | {
          goal_document_id: string;
          goal_contract_id: string;
          version: number;
          title: string;
          objective: string;
          payload_json: string;
          validated: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      goal_document_id: row.goal_document_id,
      goal_contract_id: row.goal_contract_id,
      version: row.version,
      title: row.title,
      objective: row.objective,
      payload: JSON.parse(row.payload_json) as unknown,
      validated: row.validated === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  listValidatedGoalContracts(): PersistedGoalContract[] {
    const rows = this.db
      .prepare(
        `SELECT g.goal_contract_id, g.version, g.objective, g.payload_json, g.validated,
                g.created_at, g.updated_at, g.work_id, g.mso_confirmed
         FROM goal_contracts g
         INNER JOIN (
           SELECT goal_contract_id, MAX(version) AS version
           FROM goal_contracts
           GROUP BY goal_contract_id
         ) latest
           ON g.goal_contract_id = latest.goal_contract_id AND g.version = latest.version
         WHERE g.validated = 1
         ORDER BY g.updated_at DESC`,
      )
      .all() as Array<{
      goal_contract_id: string;
      version: number;
      objective: string;
      payload_json: string;
      validated: number;
      created_at: string;
      updated_at: string;
      work_id: string | null;
      mso_confirmed: number;
    }>;

    return rows.map((row) => ({
      goal_contract_id: row.goal_contract_id,
      version: row.version,
      objective: row.objective,
      payload: JSON.parse(row.payload_json) as unknown,
      validated: true,
      created_at: row.created_at,
      updated_at: row.updated_at,
      work_id: row.work_id ?? undefined,
      mso_confirmed: row.mso_confirmed === 1,
    }));
  }

  confirmMso(goalContractId: string): PersistedGoalContract {
    const current = this.loadLatestGoalContract(goalContractId);
    if (!current) {
      throw new StateDbError("NOT_FOUND", `goal contract '${goalContractId}' not found`);
    }
    if (!current.validated) {
      throw new StateDbError("NOT_VALIDATED", `goal contract '${goalContractId}' not validated`);
    }
    const ts = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE goal_contracts
         SET mso_confirmed = 1, updated_at = ?
         WHERE goal_contract_id = ? AND version = ?`,
      )
      .run(ts, goalContractId, current.version);
    return this.loadLatestGoalContract(goalContractId)!;
  }

  putTrivialOp(opKey: string, response: unknown): void {
    this.db
      .prepare(
        `INSERT INTO trivial_ops(op_key, response_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(op_key) DO UPDATE SET
           response_json = excluded.response_json,
           updated_at = excluded.updated_at`,
      )
      .run(opKey, JSON.stringify(response), new Date().toISOString());
  }

  getTrivialOp(opKey: string): TrivialOpRow | undefined {
    const row = this.db
      .prepare(`SELECT op_key, response_json, updated_at FROM trivial_ops WHERE op_key = ?`)
      .get(opKey) as TrivialOpRow | undefined;
    return row;
  }

  recordTokenLedger(input: TokenLedgerInsert): TokenLedgerEntry {
    const entry_id = input.entry_id ?? `tl-${randomUUID()}`;
    const created_at = new Date().toISOString();
    const payload = input.payload ?? {};
    const model_requested = input.model_requested ?? input.model ?? undefined;
    const model_served = input.model_served ?? input.model ?? undefined;
    const model = model_served ?? model_requested;
    const tokens_output = input.tokens_output ?? input.tokens_out ?? null;
    this.db
      .prepare(
        `INSERT INTO token_ledger(
           entry_id, work_id, task_id, goal_contract_id, subsystem, provider_id, adapter_id,
           model, model_requested, model_served,
           tokens_in, tokens_out, tokens_system, tokens_context, tokens_tools, tokens_output,
           tokens_cache_hit, latency_ms, cost_usd, cost_provenance,
           status, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry_id,
        input.work_id,
        input.task_id ?? null,
        input.goal_contract_id ?? null,
        input.subsystem ?? null,
        input.provider_id ?? null,
        input.adapter_id ?? null,
        model ?? null,
        model_requested ?? null,
        model_served ?? null,
        input.tokens_in ?? null,
        input.tokens_out ?? null,
        input.tokens_system ?? null,
        input.tokens_context ?? null,
        input.tokens_tools ?? null,
        tokens_output,
        input.tokens_cache_hit ?? null,
        input.latency_ms ?? null,
        input.cost_usd ?? null,
        input.cost_provenance,
        input.status,
        JSON.stringify(payload),
        created_at,
      );
    return {
      entry_id,
      work_id: input.work_id,
      task_id: input.task_id,
      goal_contract_id: input.goal_contract_id,
      subsystem: input.subsystem,
      provider_id: input.provider_id,
      adapter_id: input.adapter_id,
      model,
      model_requested,
      model_served,
      tokens_in: input.tokens_in ?? null,
      tokens_out: input.tokens_out ?? null,
      tokens_system: input.tokens_system ?? null,
      tokens_context: input.tokens_context ?? null,
      tokens_tools: input.tokens_tools ?? null,
      tokens_output,
      tokens_cache_hit: input.tokens_cache_hit ?? null,
      latency_ms: input.latency_ms ?? null,
      cost_usd: input.cost_usd ?? null,
      cost_provenance: input.cost_provenance,
      status: input.status,
      payload,
      created_at,
    };
  }

  listTokenLedger(workId?: string): TokenLedgerEntry[] {
    const selectSql = `SELECT entry_id, work_id, task_id, goal_contract_id, subsystem, provider_id, adapter_id,
                      model, model_requested, model_served,
                      tokens_in, tokens_out, tokens_system, tokens_context, tokens_tools, tokens_output,
                      tokens_cache_hit, latency_ms, cost_usd, cost_provenance,
                      status, payload_json, created_at
               FROM token_ledger`;
    const rows = (
      workId
        ? this.db.prepare(`${selectSql} WHERE work_id = ? ORDER BY created_at DESC`).all(workId)
        : this.db.prepare(`${selectSql} ORDER BY created_at DESC`).all()
    ) as Array<{
      entry_id: string;
      work_id: string;
      task_id: string | null;
      goal_contract_id: string | null;
      subsystem: string | null;
      provider_id: string | null;
      adapter_id: string | null;
      model: string | null;
      model_requested: string | null;
      model_served: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
      tokens_system: number | null;
      tokens_context: number | null;
      tokens_tools: number | null;
      tokens_output: number | null;
      tokens_cache_hit: number | null;
      latency_ms: number | null;
      cost_usd: number | null;
      cost_provenance: TokenLedgerEntry["cost_provenance"];
      status: string;
      payload_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      entry_id: row.entry_id,
      work_id: row.work_id,
      task_id: row.task_id ?? undefined,
      goal_contract_id: row.goal_contract_id ?? undefined,
      subsystem: row.subsystem ?? undefined,
      provider_id: row.provider_id ?? undefined,
      adapter_id: row.adapter_id ?? undefined,
      model: row.model ?? row.model_served ?? row.model_requested ?? undefined,
      model_requested: row.model_requested ?? undefined,
      model_served: row.model_served ?? undefined,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      tokens_system: row.tokens_system,
      tokens_context: row.tokens_context,
      tokens_tools: row.tokens_tools,
      tokens_output: row.tokens_output,
      tokens_cache_hit: row.tokens_cache_hit,
      latency_ms: row.latency_ms,
      cost_usd: row.cost_usd,
      cost_provenance: row.cost_provenance,
      status: row.status,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      created_at: row.created_at,
    }));
  }

  recordCircuitRun(input: {
    run_id?: string;
    work_id: string;
    task_id: string;
    goal_contract_id?: string;
    status: string;
    reason?: string;
    workspace_path?: string;
    payload?: Record<string, unknown>;
  }): CircuitRunRow {
    const run_id = input.run_id ?? `cr-${randomUUID()}`;
    const created_at = new Date().toISOString();
    const payload = input.payload ?? {};
    this.db
      .prepare(
        `INSERT INTO circuit_runs(
           run_id, work_id, task_id, goal_contract_id, status, reason,
           workspace_path, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run_id,
        input.work_id,
        input.task_id,
        input.goal_contract_id ?? null,
        input.status,
        input.reason ?? null,
        input.workspace_path ?? null,
        JSON.stringify(payload),
        created_at,
      );
    return {
      run_id,
      work_id: input.work_id,
      task_id: input.task_id,
      goal_contract_id: input.goal_contract_id,
      status: input.status,
      reason: input.reason,
      workspace_path: input.workspace_path,
      payload,
      created_at,
    };
  }

  listCircuitRuns(workId?: string): CircuitRunRow[] {
    const rows = (
      workId
        ? this.db
            .prepare(
              `SELECT run_id, work_id, task_id, goal_contract_id, status, reason,
                      workspace_path, payload_json, created_at
               FROM circuit_runs WHERE work_id = ? ORDER BY created_at DESC`,
            )
            .all(workId)
        : this.db
            .prepare(
              `SELECT run_id, work_id, task_id, goal_contract_id, status, reason,
                      workspace_path, payload_json, created_at
               FROM circuit_runs ORDER BY created_at DESC`,
            )
            .all()
    ) as Array<{
      run_id: string;
      work_id: string;
      task_id: string;
      goal_contract_id: string | null;
      status: string;
      reason: string | null;
      workspace_path: string | null;
      payload_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      run_id: row.run_id,
      work_id: row.work_id,
      task_id: row.task_id,
      goal_contract_id: row.goal_contract_id ?? undefined,
      status: row.status,
      reason: row.reason ?? undefined,
      workspace_path: row.workspace_path ?? undefined,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      created_at: row.created_at,
    }));
  }

  // ── workspace_leases (V0-ORCH-02) ──────────────────────────────────────────

  getWorkspaceLease(workspaceId: string): WorkspaceLease | undefined {
    const row = this.db
      .prepare(
        `SELECT workspace_id, holder_id, fencing_token, acquired_at, renewed_at, expires_at, status
         FROM workspace_leases WHERE workspace_id = ?`,
      )
      .get(workspaceId) as
      | {
          workspace_id: string;
          holder_id: string;
          fencing_token: number;
          acquired_at: string;
          renewed_at: string;
          expires_at: string;
          status: WorkspaceLease["status"];
        }
      | undefined;
    return row;
  }

  /**
   * Acquire or renew exclusive MSO lease for a workspace.
   * Monotonic fencing_token: increments on every new holder / steal-after-expiry.
   * Rejects split-brain: second active holder without expiry fails.
   * Auto-heals stale `shell-<pid>` locks when the holder PID is dead (ESRCH).
   */
  acquireWorkspaceLease(input: {
    workspace_id: string;
    holder_id: string;
    lease_ms?: number;
    now?: Date;
    /** Discrete log hook when a dead shell lock is reclaimed. */
    on_stale_cleared?: (info: { pid: number; previous_holder: string; message: string }) => void;
  }): WorkspaceLease {
    const now = input.now ?? new Date();
    const leaseMs = input.lease_ms ?? 60_000;
    const ts = now.toISOString();
    const expires = new Date(now.getTime() + leaseMs).toISOString();

    return this.withTransaction(() => {
      const current = this.getWorkspaceLease(input.workspace_id);
      if (current && current.status === "active" && Date.parse(current.expires_at) > now.getTime()) {
        if (current.holder_id !== input.holder_id) {
          const pid = extractShellHolderPid(current.holder_id);
          const stale = pid !== undefined && !isPidAlive(pid);
          if (!stale) {
            throw new StateDbError(
              "LEASE_HELD",
              `workspace '${input.workspace_id}' held by ${current.holder_id} fencing=${current.fencing_token}`,
            );
          }
          const message = `Lock órfão de PID ${pid} limpo automaticamente`;
          input.on_stale_cleared?.({
            pid: pid!,
            previous_holder: current.holder_id,
            message,
          });
          // Fall through: steal with incremented fencing_token.
        } else {
          this.db
            .prepare(
              `UPDATE workspace_leases SET renewed_at = ?, expires_at = ? WHERE workspace_id = ?`,
            )
            .run(ts, expires, input.workspace_id);
          return this.getWorkspaceLease(input.workspace_id)!;
        }
      }

      const nextToken = current ? current.fencing_token + 1 : 1;
      this.db
        .prepare(
          `INSERT INTO workspace_leases(
             workspace_id, holder_id, fencing_token, acquired_at, renewed_at, expires_at, status
           ) VALUES (?, ?, ?, ?, ?, ?, 'active')
           ON CONFLICT(workspace_id) DO UPDATE SET
             holder_id = excluded.holder_id,
             fencing_token = excluded.fencing_token,
             acquired_at = excluded.acquired_at,
             renewed_at = excluded.renewed_at,
             expires_at = excluded.expires_at,
             status = 'active'`,
        )
        .run(input.workspace_id, input.holder_id, nextToken, ts, ts, expires);
      return this.getWorkspaceLease(input.workspace_id)!;
    });
  }

  releaseWorkspaceLease(workspaceId: string, fencingToken: number, holderId: string): void {
    this.withTransaction(() => {
      this.requireActiveFencing(workspaceId, fencingToken, holderId);
      this.db
        .prepare(`UPDATE workspace_leases SET status = 'released' WHERE workspace_id = ?`)
        .run(workspaceId);
    });
  }

  /**
   * Reject stale fencing tokens (split-brain prevention).
   * Returns expected token when mismatch.
   */
  checkWorkspaceFencing(
    workspaceId: string,
    fencingToken: number,
    holderId?: string,
  ): { ok: true; lease: WorkspaceLease } | { ok: false; reason: string; expected_token?: number } {
    const lease = this.getWorkspaceLease(workspaceId);
    if (!lease || lease.status !== "active") {
      return { ok: false, reason: "no_active_lease" };
    }
    if (Date.parse(lease.expires_at) <= Date.now()) {
      return { ok: false, reason: "lease_expired", expected_token: lease.fencing_token };
    }
    if (fencingToken !== lease.fencing_token) {
      return {
        ok: false,
        reason: "stale_fencing_token",
        expected_token: lease.fencing_token,
      };
    }
    if (holderId !== undefined && holderId !== lease.holder_id) {
      return { ok: false, reason: "holder_mismatch", expected_token: lease.fencing_token };
    }
    return { ok: true, lease };
  }

  private requireActiveFencing(workspaceId: string, fencingToken: number, holderId?: string): WorkspaceLease {
    const check = this.checkWorkspaceFencing(workspaceId, fencingToken, holderId);
    if (!check.ok) {
      throw new StateDbError(
        check.reason === "stale_fencing_token" ? "STALE_FENCING" : "FENCE_REJECTED",
        `${check.reason}${check.expected_token != null ? ` expected=${check.expected_token}` : ""}`,
      );
    }
    return check.lease;
  }

  // ── MSO sessions + transitions (V0-ORCH-03) ────────────────────────────────

  createMsoSession(input: {
    session_id?: string;
    workspace_id: string;
    fencing_token: number;
    holder_id: string;
    goal_contract_id?: string;
    work_id?: string;
  }): MsoSession {
    this.requireActiveFencing(input.workspace_id, input.fencing_token, input.holder_id);
    const session_id = input.session_id ?? `mso-${randomUUID()}`;
    const ts = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mso_sessions(
           session_id, workspace_id, state, fencing_token, goal_contract_id, work_id,
           reason, created_at, updated_at
         ) VALUES (?, ?, 'INIT', ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        session_id,
        input.workspace_id,
        input.fencing_token,
        input.goal_contract_id ?? null,
        input.work_id ?? null,
        ts,
        ts,
      );
    return this.getMsoSession(session_id)!;
  }

  /** Latest MSO session for a workspace (auto-resume when re-running evolve). */
  getLatestMsoSessionForWorkspace(workspaceId: string): MsoSession | undefined {
    const row = this.db
      .prepare(
        `SELECT session_id, workspace_id, state, fencing_token, goal_contract_id, work_id,
                reason, created_at, updated_at
         FROM mso_sessions
         WHERE workspace_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(workspaceId) as
      | {
          session_id: string;
          workspace_id: string;
          state: string;
          fencing_token: number;
          goal_contract_id: string | null;
          work_id: string | null;
          reason: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row || !isMsoState(row.state)) return undefined;
    return {
      session_id: row.session_id,
      workspace_id: row.workspace_id,
      state: row.state,
      fencing_token: row.fencing_token,
      goal_contract_id: row.goal_contract_id ?? undefined,
      work_id: row.work_id ?? undefined,
      reason: row.reason ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  getMsoSession(sessionId: string): MsoSession | undefined {
    const row = this.db
      .prepare(
        `SELECT session_id, workspace_id, state, fencing_token, goal_contract_id, work_id,
                reason, created_at, updated_at
         FROM mso_sessions WHERE session_id = ?`,
      )
      .get(sessionId) as
      | {
          session_id: string;
          workspace_id: string;
          state: string;
          fencing_token: number;
          goal_contract_id: string | null;
          work_id: string | null;
          reason: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row || !isMsoState(row.state)) return undefined;
    return {
      session_id: row.session_id,
      workspace_id: row.workspace_id,
      state: row.state,
      fencing_token: row.fencing_token,
      goal_contract_id: row.goal_contract_id ?? undefined,
      work_id: row.work_id ?? undefined,
      reason: row.reason ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  transitionMso(input: {
    session_id: string;
    to: MsoState;
    fencing_token: number;
    holder_id: string;
    reason?: string;
    event?: string;
  }): MsoSession {
    return this.withTransaction(() => {
      const session = this.getMsoSession(input.session_id);
      if (!session) {
        throw new StateDbError("NOT_FOUND", `mso session '${input.session_id}' not found`);
      }
      this.requireActiveFencing(session.workspace_id, input.fencing_token, input.holder_id);
      if (!canTransitionMso(session.state, input.to)) {
        throw new MsoError(
          "INVALID_TRANSITION",
          `${session.state} -> ${input.to}`,
        );
      }
      const ts = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE mso_sessions SET state = ?, reason = ?, updated_at = ? WHERE session_id = ?`,
        )
        .run(input.to, input.reason ?? null, ts, input.session_id);
      this.db
        .prepare(
          `INSERT INTO mso_transitions(
             transition_id, session_id, from_state, to_state, reason, event, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `mxt-${randomUUID()}`,
          input.session_id,
          session.state,
          input.to,
          input.reason ?? null,
          input.event ?? null,
          ts,
        );
      return this.getMsoSession(input.session_id)!;
    });
  }

  listMsoTransitions(sessionId: string): MsoTransitionRow[] {
    const rows = this.db
      .prepare(
        `SELECT transition_id, session_id, from_state, to_state, reason, event, created_at
         FROM mso_transitions WHERE session_id = ? ORDER BY created_at ASC`,
      )
      .all(sessionId) as Array<{
      transition_id: string;
      session_id: string;
      from_state: string;
      to_state: string;
      reason: string | null;
      event: string | null;
      created_at: string;
    }>;
    return rows
      .filter((r) => isMsoState(r.from_state) && isMsoState(r.to_state))
      .map((r) => ({
        transition_id: r.transition_id,
        session_id: r.session_id,
        from_state: r.from_state as MsoState,
        to_state: r.to_state as MsoState,
        reason: r.reason ?? undefined,
        event: r.event ?? undefined,
        created_at: r.created_at,
      }));
  }

  /**
   * Transactional Outbox: persist PENDING_DISPATCH (+ optional MSO→DELEGATING)
   * in the same transaction BEFORE any spawn. Caller must spawn then markDispatched.
   */
  enqueuePendingDispatch(input: {
    session_id: string;
    fencing_token: number;
    holder_id: string;
    work_id?: string;
    task_id?: string;
    payload?: Record<string, unknown>;
    transition_to_delegating?: boolean;
  }): OutboxRow {
    return this.withTransaction(() => {
      const session = this.getMsoSession(input.session_id);
      if (!session) {
        throw new StateDbError("NOT_FOUND", `mso session '${input.session_id}' not found`);
      }
      this.requireActiveFencing(session.workspace_id, input.fencing_token, input.holder_id);

      if (input.transition_to_delegating !== false && session.state !== "DELEGATING") {
        if (!canTransitionMso(session.state, "DELEGATING")) {
          throw new MsoError("INVALID_TRANSITION", `${session.state} -> DELEGATING`);
        }
        const ts = new Date().toISOString();
        this.db
          .prepare(
            `UPDATE mso_sessions SET state = 'DELEGATING', reason = ?, updated_at = ? WHERE session_id = ?`,
          )
          .run("pending_dispatch", ts, input.session_id);
        this.db
          .prepare(
            `INSERT INTO mso_transitions(
               transition_id, session_id, from_state, to_state, reason, event, created_at
             ) VALUES (?, ?, ?, 'DELEGATING', ?, 'outbox_enqueue', ?)`,
          )
          .run(`mxt-${randomUUID()}`, input.session_id, session.state, "pending_dispatch", ts);
      }

      const outbox_id = `obx-${randomUUID()}`;
      const created_at = new Date().toISOString();
      const payload = input.payload ?? {};
      this.db
        .prepare(
          `INSERT INTO outbox(
             outbox_id, session_id, workspace_id, work_id, task_id, status, payload_json,
             created_at, dispatched_at
           ) VALUES (?, ?, ?, ?, ?, 'PENDING_DISPATCH', ?, ?, NULL)`,
        )
        .run(
          outbox_id,
          input.session_id,
          session.workspace_id,
          input.work_id ?? session.work_id ?? null,
          input.task_id ?? null,
          JSON.stringify(payload),
          created_at,
        );
      return this.getOutbox(outbox_id)!;
    });
  }

  getOutbox(outboxId: string): OutboxRow | undefined {
    const row = this.db
      .prepare(
        `SELECT outbox_id, session_id, workspace_id, work_id, task_id, status, payload_json,
                created_at, dispatched_at
         FROM outbox WHERE outbox_id = ?`,
      )
      .get(outboxId) as
      | {
          outbox_id: string;
          session_id: string;
          workspace_id: string;
          work_id: string | null;
          task_id: string | null;
          status: OutboxStatus;
          payload_json: string;
          created_at: string;
          dispatched_at: string | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      outbox_id: row.outbox_id,
      session_id: row.session_id,
      workspace_id: row.workspace_id,
      work_id: row.work_id ?? undefined,
      task_id: row.task_id ?? undefined,
      status: row.status,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      created_at: row.created_at,
      dispatched_at: row.dispatched_at ?? undefined,
    };
  }

  listPendingDispatch(workspaceId?: string): OutboxRow[] {
    const rows = (
      workspaceId
        ? this.db
            .prepare(
              `SELECT outbox_id, session_id, workspace_id, work_id, task_id, status, payload_json,
                      created_at, dispatched_at
               FROM outbox WHERE status = 'PENDING_DISPATCH' AND workspace_id = ?
               ORDER BY created_at ASC`,
            )
            .all(workspaceId)
        : this.db
            .prepare(
              `SELECT outbox_id, session_id, workspace_id, work_id, task_id, status, payload_json,
                      created_at, dispatched_at
               FROM outbox WHERE status = 'PENDING_DISPATCH'
               ORDER BY created_at ASC`,
            )
            .all()
    ) as Array<{
      outbox_id: string;
      session_id: string;
      workspace_id: string;
      work_id: string | null;
      task_id: string | null;
      status: OutboxStatus;
      payload_json: string;
      created_at: string;
      dispatched_at: string | null;
    }>;
    return rows.map((row) => ({
      outbox_id: row.outbox_id,
      session_id: row.session_id,
      workspace_id: row.workspace_id,
      work_id: row.work_id ?? undefined,
      task_id: row.task_id ?? undefined,
      status: row.status,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      created_at: row.created_at,
      dispatched_at: row.dispatched_at ?? undefined,
    }));
  }

  markOutboxDispatched(outboxId: string): OutboxRow {
    const ts = new Date().toISOString();
    const existing = this.getOutbox(outboxId);
    if (!existing) throw new StateDbError("NOT_FOUND", `outbox '${outboxId}' not found`);
    if (existing.status !== "PENDING_DISPATCH") {
      throw new StateDbError("INVALID", `outbox '${outboxId}' status=${existing.status}`);
    }
    this.db
      .prepare(`UPDATE outbox SET status = 'DISPATCHED', dispatched_at = ? WHERE outbox_id = ?`)
      .run(ts, outboxId);
    return this.getOutbox(outboxId)!;
  }

  // ── TaskGraph / Inbox / Work Ledger (V0-ORCH-01 coverage) ──────────────────

  upsertTaskGraphNode(input: {
    work_id: string;
    task_id: string;
    state: string;
    payload?: Record<string, unknown>;
  }): TaskGraphNodeRow {
    const updated_at = new Date().toISOString();
    const payload = input.payload ?? {};
    this.db
      .prepare(
        `INSERT INTO task_graph_nodes(work_id, task_id, state, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(work_id, task_id) DO UPDATE SET
           state = excluded.state,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
      )
      .run(input.work_id, input.task_id, input.state, JSON.stringify(payload), updated_at);
    return {
      work_id: input.work_id,
      task_id: input.task_id,
      state: input.state,
      payload,
      updated_at,
    };
  }

  listTaskGraphNodes(workId: string): TaskGraphNodeRow[] {
    const rows = this.db
      .prepare(
        `SELECT work_id, task_id, state, payload_json, updated_at
         FROM task_graph_nodes WHERE work_id = ? ORDER BY updated_at ASC`,
      )
      .all(workId) as Array<{
      work_id: string;
      task_id: string;
      state: string;
      payload_json: string;
      updated_at: string;
    }>;
    return rows.map((r) => ({
      work_id: r.work_id,
      task_id: r.task_id,
      state: r.state,
      payload: JSON.parse(r.payload_json) as Record<string, unknown>,
      updated_at: r.updated_at,
    }));
  }

  appendInboxMessage(input: {
    message_id?: string;
    workspace_id: string;
    session_id?: string;
    kind: string;
    body?: Record<string, unknown>;
  }): InboxMessageRow {
    const message_id = input.message_id ?? `inbox-${randomUUID()}`;
    const created_at = new Date().toISOString();
    const body = input.body ?? {};
    this.db
      .prepare(
        `INSERT INTO inbox_messages(
           message_id, workspace_id, session_id, kind, body_json, created_at, read_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        message_id,
        input.workspace_id,
        input.session_id ?? null,
        input.kind,
        JSON.stringify(body),
        created_at,
      );
    return {
      message_id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      kind: input.kind,
      body,
      created_at,
    };
  }

  listInboxMessages(workspaceId: string): InboxMessageRow[] {
    const rows = this.db
      .prepare(
        `SELECT message_id, workspace_id, session_id, kind, body_json, created_at, read_at
         FROM inbox_messages WHERE workspace_id = ? ORDER BY created_at ASC`,
      )
      .all(workspaceId) as Array<{
      message_id: string;
      workspace_id: string;
      session_id: string | null;
      kind: string;
      body_json: string;
      created_at: string;
      read_at: string | null;
    }>;
    return rows.map((r) => ({
      message_id: r.message_id,
      workspace_id: r.workspace_id,
      session_id: r.session_id ?? undefined,
      kind: r.kind,
      body: JSON.parse(r.body_json) as Record<string, unknown>,
      created_at: r.created_at,
      read_at: r.read_at ?? undefined,
    }));
  }

  appendWorkLedgerEntry(input: {
    entry_id?: string;
    work_id: string;
    type: string;
    payload?: Record<string, unknown>;
  }): WorkLedgerDbEntry {
    return this.withTransaction(() => {
      const maxRow = this.db
        .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM work_ledger_entries WHERE work_id = ?`)
        .get(input.work_id) as { v: number };
      const version = Number(maxRow.v) + 1;
      const entry_id = input.entry_id ?? `wle-${randomUUID()}`;
      const created_at = new Date().toISOString();
      const payload = input.payload ?? {};
      this.db
        .prepare(
          `INSERT INTO work_ledger_entries(entry_id, work_id, version, type, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(entry_id, input.work_id, version, input.type, JSON.stringify(payload), created_at);
      return { entry_id, work_id: input.work_id, version, type: input.type, payload, created_at };
    });
  }

  listWorkLedgerEntries(workId: string): WorkLedgerDbEntry[] {
    const rows = this.db
      .prepare(
        `SELECT entry_id, work_id, version, type, payload_json, created_at
         FROM work_ledger_entries WHERE work_id = ? ORDER BY version ASC`,
      )
      .all(workId) as Array<{
      entry_id: string;
      work_id: string;
      version: number;
      type: string;
      payload_json: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      entry_id: r.entry_id,
      work_id: r.work_id,
      version: r.version,
      type: r.type,
      payload: JSON.parse(r.payload_json) as Record<string, unknown>,
      created_at: r.created_at,
    }));
  }

  /**
   * V1-ORCH-02 — Atomically append an event and update relational projections
   * (task_substates and optional task_graph_nodes) in the same transaction.
   */
  appendEventAndProject(input: {
    stream_id: string;
    event_type: string;
    work_id?: string;
    task_id?: string;
    payload?: Record<string, unknown>;
    /** Projection into per-task sub-state machine (decoupled from global MSO). */
    substate?: {
      machine: string;
      state: string;
      checkpoint_id?: string;
      payload?: Record<string, unknown>;
    };
    /** Optional TaskGraph node projection. */
    task_graph?: {
      state: string;
      payload?: Record<string, unknown>;
    };
  }): { event: EventRow; substate?: TaskSubstateRow } {
    return this.withTransaction(() => {
      const maxRow = this.db
        .prepare(`SELECT COALESCE(MAX(seq), 0) AS v FROM events WHERE stream_id = ?`)
        .get(input.stream_id) as { v: number };
      const seq = Number(maxRow.v) + 1;
      const event_id = `evt-${randomUUID()}`;
      const created_at = new Date().toISOString();
      const payload = input.payload ?? {};
      this.db
        .prepare(
          `INSERT INTO events(event_id, stream_id, seq, event_type, task_id, work_id, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event_id,
          input.stream_id,
          seq,
          input.event_type,
          input.task_id ?? null,
          input.work_id ?? null,
          JSON.stringify(payload),
          created_at,
        );
      const event: EventRow = {
        event_id,
        stream_id: input.stream_id,
        seq,
        event_type: input.event_type,
        task_id: input.task_id,
        work_id: input.work_id,
        payload,
        created_at,
      };

      let substate: TaskSubstateRow | undefined;
      if (input.substate && input.work_id && input.task_id) {
        const updated_at = created_at;
        const sp = input.substate.payload ?? {};
        this.db
          .prepare(
            `INSERT INTO task_substates(work_id, task_id, machine, state, checkpoint_id, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(work_id, task_id, machine) DO UPDATE SET
               state = excluded.state,
               checkpoint_id = excluded.checkpoint_id,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at`,
          )
          .run(
            input.work_id,
            input.task_id,
            input.substate.machine,
            input.substate.state,
            input.substate.checkpoint_id ?? null,
            JSON.stringify(sp),
            updated_at,
          );
        substate = {
          work_id: input.work_id,
          task_id: input.task_id,
          machine: input.substate.machine,
          state: input.substate.state,
          checkpoint_id: input.substate.checkpoint_id,
          payload: sp,
          updated_at,
        };
      }

      if (input.task_graph && input.work_id && input.task_id) {
        const updated_at = created_at;
        const tp = input.task_graph.payload ?? {};
        this.db
          .prepare(
            `INSERT INTO task_graph_nodes(work_id, task_id, state, payload_json, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(work_id, task_id) DO UPDATE SET
               state = excluded.state,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at`,
          )
          .run(input.work_id, input.task_id, input.task_graph.state, JSON.stringify(tp), updated_at);
      }

      return { event, substate };
    });
  }

  listEvents(streamId: string): EventRow[] {
    const rows = this.db
      .prepare(
        `SELECT event_id, stream_id, seq, event_type, task_id, work_id, payload_json, created_at
         FROM events WHERE stream_id = ? ORDER BY seq ASC`,
      )
      .all(streamId) as Array<{
      event_id: string;
      stream_id: string;
      seq: number;
      event_type: string;
      task_id: string | null;
      work_id: string | null;
      payload_json: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      event_id: r.event_id,
      stream_id: r.stream_id,
      seq: r.seq,
      event_type: r.event_type,
      task_id: r.task_id ?? undefined,
      work_id: r.work_id ?? undefined,
      payload: JSON.parse(r.payload_json) as Record<string, unknown>,
      created_at: r.created_at,
    }));
  }

  getTaskSubstate(workId: string, taskId: string, machine: string): TaskSubstateRow | undefined {
    const r = this.db
      .prepare(
        `SELECT work_id, task_id, machine, state, checkpoint_id, payload_json, updated_at
         FROM task_substates WHERE work_id = ? AND task_id = ? AND machine = ?`,
      )
      .get(workId, taskId, machine) as
      | {
          work_id: string;
          task_id: string;
          machine: string;
          state: string;
          checkpoint_id: string | null;
          payload_json: string;
          updated_at: string;
        }
      | undefined;
    if (!r) return undefined;
    return {
      work_id: r.work_id,
      task_id: r.task_id,
      machine: r.machine,
      state: r.state,
      checkpoint_id: r.checkpoint_id ?? undefined,
      payload: JSON.parse(r.payload_json) as Record<string, unknown>,
      updated_at: r.updated_at,
    };
  }

  upsertEvidenceRecord(input: {
    evidence_id?: string;
    work_id: string;
    task_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
    status?: EvidenceStatus;
    kind?: string;
    payload?: Record<string, unknown>;
  }): EvidenceRecordRow {
    const evidence_id = input.evidence_id ?? `evd-${randomUUID()}`;
    const now = new Date().toISOString();
    const status = input.status ?? "VALID";
    const payload = input.payload ?? {};
    const existing = this.db
      .prepare(`SELECT created_at FROM evidence_records WHERE evidence_id = ?`)
      .get(evidence_id) as { created_at: string } | undefined;
    const created_at = existing?.created_at ?? now;
    this.db
      .prepare(
        `INSERT INTO evidence_records(
           evidence_id, work_id, task_id, goal_contract_id, goal_contract_version,
           status, kind, payload_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(evidence_id) DO UPDATE SET
           status = excluded.status,
           payload_json = excluded.payload_json,
           goal_contract_version = excluded.goal_contract_version,
           updated_at = excluded.updated_at`,
      )
      .run(
        evidence_id,
        input.work_id,
        input.task_id ?? null,
        input.goal_contract_id ?? null,
        input.goal_contract_version ?? null,
        status,
        input.kind ?? null,
        JSON.stringify(payload),
        created_at,
        now,
      );
    return {
      evidence_id,
      work_id: input.work_id,
      task_id: input.task_id,
      goal_contract_id: input.goal_contract_id,
      goal_contract_version: input.goal_contract_version,
      status,
      kind: input.kind,
      payload,
      created_at,
      updated_at: now,
    };
  }

  markEvidenceStale(filter: {
    work_id: string;
    goal_contract_id?: string;
    /** Mark evidence tied to versions strictly less than this. */
    before_version?: number;
    task_ids?: string[];
  }): string[] {
    const rows = this.db
      .prepare(
        `SELECT evidence_id, task_id, goal_contract_id, goal_contract_version, status
         FROM evidence_records WHERE work_id = ?`,
      )
      .all(filter.work_id) as Array<{
      evidence_id: string;
      task_id: string | null;
      goal_contract_id: string | null;
      goal_contract_version: number | null;
      status: string;
    }>;
    const staleIds: string[] = [];
    const now = new Date().toISOString();
    for (const r of rows) {
      if (filter.goal_contract_id && r.goal_contract_id !== filter.goal_contract_id) continue;
      if (
        filter.before_version != null &&
        r.goal_contract_version != null &&
        r.goal_contract_version >= filter.before_version
      ) {
        continue;
      }
      if (filter.task_ids && r.task_id && !filter.task_ids.includes(r.task_id)) continue;
      if (r.status === "STALE") continue;
      this.db
        .prepare(`UPDATE evidence_records SET status = 'STALE', updated_at = ? WHERE evidence_id = ?`)
        .run(now, r.evidence_id);
      staleIds.push(r.evidence_id);
    }
    return staleIds;
  }

  listEvidence(workId: string): EvidenceRecordRow[] {
    const rows = this.db
      .prepare(
        `SELECT evidence_id, work_id, task_id, goal_contract_id, goal_contract_version,
                status, kind, payload_json, created_at, updated_at
         FROM evidence_records WHERE work_id = ? ORDER BY created_at ASC`,
      )
      .all(workId) as Array<{
      evidence_id: string;
      work_id: string;
      task_id: string | null;
      goal_contract_id: string | null;
      goal_contract_version: number | null;
      status: EvidenceStatus;
      kind: string | null;
      payload_json: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((r) => ({
      evidence_id: r.evidence_id,
      work_id: r.work_id,
      task_id: r.task_id ?? undefined,
      goal_contract_id: r.goal_contract_id ?? undefined,
      goal_contract_version: r.goal_contract_version ?? undefined,
      status: r.status,
      kind: r.kind ?? undefined,
      payload: JSON.parse(r.payload_json) as Record<string, unknown>,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }
}
