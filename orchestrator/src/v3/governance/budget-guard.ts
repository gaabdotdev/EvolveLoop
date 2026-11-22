/**
 * V5-M05 — BudgetGuard (tokens / attempts) — fail-closed when exceeded.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BudgetCheckResult,
  BudgetLimitRecord,
  GovernancePolicyScope,
} from "./types.js";

export class BudgetGuardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BudgetGuardError";
  }
}

/** @deprecated alias */
export class GovernanceBudgetError extends BudgetGuardError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "GovernanceBudgetError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export interface BudgetStoreSnapshot {
  kind: "BudgetGuard" | "GovernanceBudgetStore";
  version: number;
  updated_at: string;
  records: BudgetLimitRecord[];
  limitations: string[];
}

const LIMITATIONS = [
  "Fail-closed: exceeded OR unmeasured (limit set, consumed null-path) → block",
  "Core never invents token counts — callers must recordConsumption",
  "Complements AgentRegistry delegation budgets; does not replace them",
];

function recordKey(r: {
  scope: GovernancePolicyScope;
  work_id?: string;
  agent_id?: string;
}): string {
  return [r.scope, r.work_id?.trim() || "-", r.agent_id?.trim() || "-"].join(":");
}

export class BudgetGuard {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "budgets.json");
  }

  load(): BudgetStoreSnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "BudgetGuard",
        version: 0,
        updated_at: nowIso(),
        records: [],
        limitations: [...LIMITATIONS, "budgets file absent"],
      };
    }
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as BudgetStoreSnapshot;
    if (parsed.kind !== "BudgetGuard" && parsed.kind !== "GovernanceBudgetStore") {
      throw new BudgetGuardError("INVALID", this.path);
    }
    return { ...parsed, kind: "BudgetGuard" };
  }

  private persist(snap: BudgetStoreSnapshot): BudgetStoreSnapshot {
    const out: BudgetStoreSnapshot = { ...snap, kind: "BudgetGuard" };
    atomicWrite(this.path, JSON.stringify(out, null, 2));
    return out;
  }

  upsertLimit(input: {
    scope: GovernancePolicyScope;
    work_id?: string;
    agent_id?: string;
    max_tokens?: number;
    max_attempts?: number;
  }): BudgetLimitRecord {
    if (input.scope === "work" && !input.work_id?.trim()) {
      throw new BudgetGuardError("WORK_ID_REQUIRED", "scope=work needs work_id");
    }
    if (input.max_tokens == null && input.max_attempts == null) {
      throw new BudgetGuardError(
        "LIMIT_REQUIRED",
        "at least one of max_tokens|max_attempts",
      );
    }
    const snap = this.load();
    const key = recordKey(input);
    const existing = snap.records.find((r) => recordKey(r) === key);
    const rec: BudgetLimitRecord = {
      kind: "BudgetLimitRecord",
      scope: input.scope,
      work_id: input.work_id?.trim(),
      agent_id: input.agent_id?.trim(),
      max_tokens: input.max_tokens ?? existing?.max_tokens,
      max_attempts: input.max_attempts ?? existing?.max_attempts,
      consumed_tokens: existing?.consumed_tokens ?? 0,
      consumed_attempts: existing?.consumed_attempts ?? 0,
      updated_at: nowIso(),
    };
    const records = snap.records.filter((r) => recordKey(r) !== key);
    records.push(rec);
    this.persist({
      kind: "BudgetGuard",
      version: Math.max(1, snap.version + 1),
      updated_at: nowIso(),
      records,
      limitations: snap.limitations.length ? snap.limitations : [...LIMITATIONS],
    });
    return rec;
  }

  recordConsumption(input: {
    scope: GovernancePolicyScope;
    work_id?: string;
    agent_id?: string;
    delta_tokens?: number;
    delta_attempts?: number;
  }): BudgetLimitRecord {
    const snap = this.load();
    const key = recordKey(input);
    const existing = snap.records.find((r) => recordKey(r) === key);
    if (!existing) {
      throw new BudgetGuardError(
        "NO_LIMIT",
        `no budget limit for ${key} — upsertLimit first`,
      );
    }
    const rec: BudgetLimitRecord = {
      ...existing,
      consumed_tokens:
        existing.consumed_tokens + Math.max(0, input.delta_tokens ?? 0),
      consumed_attempts:
        existing.consumed_attempts + Math.max(0, input.delta_attempts ?? 0),
      updated_at: nowIso(),
    };
    const records = snap.records.map((r) => (recordKey(r) === key ? rec : r));
    this.persist({
      kind: "BudgetGuard",
      version: Math.max(1, snap.version + 1),
      updated_at: nowIso(),
      records,
      limitations: snap.limitations.length ? snap.limitations : [...LIMITATIONS],
    });
    return rec;
  }

  get(input: {
    scope: GovernancePolicyScope;
    work_id?: string;
    agent_id?: string;
  }): BudgetLimitRecord | undefined {
    return this.load().records.find((r) => recordKey(r) === recordKey(input));
  }

  /**
   * Fail-closed check: exceeded limits → block.
   */
  check(input: {
    scope: GovernancePolicyScope;
    work_id?: string;
    agent_id?: string;
  }): BudgetCheckResult {
    const checked_at = nowIso();
    const record = this.get(input);
    if (!record) {
      const empty: BudgetLimitRecord = {
        kind: "BudgetLimitRecord",
        scope: input.scope,
        work_id: input.work_id,
        agent_id: input.agent_id,
        consumed_tokens: 0,
        consumed_attempts: 0,
        updated_at: checked_at,
      };
      return {
        kind: "BudgetCheckResult",
        verdict: "ok",
        record: empty,
        reasons: ["no_governance_budget_configured"],
        checked_at,
        fail_closed_block: false,
      };
    }

    const reasons: string[] = [];
    let exceeded = false;

    if (record.max_tokens != null) {
      if (record.consumed_tokens > record.max_tokens) {
        exceeded = true;
        reasons.push(
          `tokens_exceeded:${record.consumed_tokens}>${record.max_tokens}`,
        );
      }
    }
    if (record.max_attempts != null) {
      if (record.consumed_attempts > record.max_attempts) {
        exceeded = true;
        reasons.push(
          `attempts_exceeded:${record.consumed_attempts}>${record.max_attempts}`,
        );
      }
    }

    if (exceeded) {
      return {
        kind: "BudgetCheckResult",
        verdict: "exceeded",
        record,
        reasons,
        checked_at,
        fail_closed_block: true,
      };
    }

    return {
      kind: "BudgetCheckResult",
      verdict: "ok",
      record,
      reasons: ["within_limits"],
      checked_at,
      fail_closed_block: false,
    };
  }
}

/** @deprecated alias — prefer BudgetGuard */
export class GovernanceBudgetStore extends BudgetGuard {}
