/**
 * SQLite WAL store for V0 durable state (.evolveloop/state.db).
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { GoalContract } from "../goal-contract/types.js";
import { STATE_DB_SCHEMA_SQL, STATE_DB_SCHEMA_VERSION } from "./schema.js";
import type {
  CircuitRunRow,
  PersistedGoalContract,
  TokenLedgerEntry,
  TokenLedgerInsert,
  TrivialOpRow,
} from "./types.js";

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
    this.path = resolve(dbPath);
    mkdirSync(dirname(this.path), { recursive: true });
    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(this.path);
    this.db.exec(STATE_DB_SCHEMA_SQL);
    this.db
      .prepare(
        `INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(STATE_DB_SCHEMA_VERSION);
  }

  close(): void {
    this.db.close();
  }

  journalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
    return String(row?.journal_mode ?? "unknown").toLowerCase();
  }

  saveGoalContract(
    contract: GoalContract,
    opts?: { validated?: boolean; mso_confirmed?: boolean },
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
    this.db
      .prepare(
        `INSERT INTO token_ledger(
           entry_id, work_id, task_id, goal_contract_id, provider_id, adapter_id,
           model, tokens_in, tokens_out, latency_ms, cost_usd, cost_provenance,
           status, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry_id,
        input.work_id,
        input.task_id ?? null,
        input.goal_contract_id ?? null,
        input.provider_id ?? null,
        input.adapter_id ?? null,
        input.model ?? null,
        input.tokens_in ?? null,
        input.tokens_out ?? null,
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
      provider_id: input.provider_id,
      adapter_id: input.adapter_id,
      model: input.model,
      tokens_in: input.tokens_in ?? null,
      tokens_out: input.tokens_out ?? null,
      latency_ms: input.latency_ms ?? null,
      cost_usd: input.cost_usd ?? null,
      cost_provenance: input.cost_provenance,
      status: input.status,
      payload,
      created_at,
    };
  }

  listTokenLedger(workId?: string): TokenLedgerEntry[] {
    const rows = (
      workId
        ? this.db
            .prepare(
              `SELECT entry_id, work_id, task_id, goal_contract_id, provider_id, adapter_id,
                      model, tokens_in, tokens_out, latency_ms, cost_usd, cost_provenance,
                      status, payload_json, created_at
               FROM token_ledger WHERE work_id = ? ORDER BY created_at DESC`,
            )
            .all(workId)
        : this.db
            .prepare(
              `SELECT entry_id, work_id, task_id, goal_contract_id, provider_id, adapter_id,
                      model, tokens_in, tokens_out, latency_ms, cost_usd, cost_provenance,
                      status, payload_json, created_at
               FROM token_ledger ORDER BY created_at DESC`,
            )
            .all()
    ) as Array<{
      entry_id: string;
      work_id: string;
      task_id: string | null;
      goal_contract_id: string | null;
      provider_id: string | null;
      adapter_id: string | null;
      model: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
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
      provider_id: row.provider_id ?? undefined,
      adapter_id: row.adapter_id ?? undefined,
      model: row.model ?? undefined,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
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
}
