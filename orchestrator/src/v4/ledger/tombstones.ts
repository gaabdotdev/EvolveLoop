/**
 * Monotonic tombstones so restore cannot resurrect consumed grants or
 * roll COMMITTED effects back to uncommitted (ADR-V4-0004, TM-V4-D19).
 *
 * Tombstones live under `tombstones/<work_id>.jsonl` — work_id is path-safe.
 * grant_ref is an opaque field inside the record, never a path component (R5).
 * On restore, live and restored tombstone logs are unioned (append-only, max-wins
 * for effect rank).
 */

import { existsSync } from "node:fs";
import {
  DEFAULT_TENANT_ID,
  isValidId,
  type IsoTimestamp,
} from "../contracts/common.js";
import type { EffectState } from "../contracts/effect.js";
import { atomicWriteFsync, parseJsonlRecords, readJsonlLines, resolveUnderRoot } from "./persistence.js";
import { requireId } from "./ids.js";
import type { LedgerProjection } from "./projection.js";

export type TerminalEffectState = Extract<EffectState, "COMMITTED" | "REJECTED" | "NOT_EXECUTED" | "COMPENSATED">;

export type Tombstone =
  | {
      kind: "grant_consumed";
      work_id: string;
      tenant_id: typeof DEFAULT_TENANT_ID;
      /** Opaque grant reference — NOT a filesystem path (R5). */
      grant_ref: string;
      at: IsoTimestamp;
    }
  | {
      kind: "effect_terminal";
      work_id: string;
      tenant_id: typeof DEFAULT_TENANT_ID;
      effect_id: string;
      state: TerminalEffectState;
      at: IsoTimestamp;
    };

const TERMINAL_RANK: Record<TerminalEffectState, number> = {
  COMMITTED: 10,
  REJECTED: 10,
  NOT_EXECUTED: 10,
  COMPENSATED: 11,
};

const EFFECT_RANK: Record<string, number> = {
  PLANNED: 0,
  AUTHORIZED: 1,
  DISPATCHED: 2,
  UNKNOWN: 3,
  PARTIAL: 4,
  ESCALATED: 5,
  ...TERMINAL_RANK,
};

function tombstonePath(root: string, work_id: string): string {
  return resolveUnderRoot(root, "tombstones", `${requireId("work", work_id)}.jsonl`);
}

function grantRefSafe(grant_ref: string): boolean {
  // Not an id-kind (R5). Still refuse path-like values so a confused caller
  // cannot smuggle separators into the record for later misuse.
  if (grant_ref.length === 0 || grant_ref.length > 256) return false;
  return !grant_ref.includes("/") && !grant_ref.includes("\\") && !grant_ref.includes("\0") && !grant_ref.includes("..") && !grant_ref.includes("%");
}

export class TombstoneStore {
  constructor(private readonly root: string) {}

  async list(work_id: string): Promise<Tombstone[]> {
    const p = tombstonePath(this.root, work_id);
    if (!existsSync(p)) return [];
    const lines = await readJsonlLines(p);
    return parseJsonlRecords<Tombstone>(lines);
  }

  async recordGrantConsumed(work_id: string, grant_ref: string, at: IsoTimestamp): Promise<Tombstone> {
    requireId("work", work_id);
    if (!grantRefSafe(grant_ref)) {
      throw new Error("grant_ref_not_path_safe");
    }
    const rec: Tombstone = { kind: "grant_consumed", work_id, tenant_id: DEFAULT_TENANT_ID, grant_ref, at };
    await this.append(work_id, rec);
    return rec;
  }

  async recordEffectTerminal(work_id: string, effect_id: string, state: TerminalEffectState, at: IsoTimestamp): Promise<Tombstone> {
    requireId("work", work_id);
    if (!isValidId("effect", effect_id)) throw new Error("invalid_effect_id");
    const rec: Tombstone = { kind: "effect_terminal", work_id, tenant_id: DEFAULT_TENANT_ID, effect_id, state, at };
    await this.append(work_id, rec);
    return rec;
  }

  private async append(work_id: string, rec: Tombstone): Promise<void> {
    const existing = await this.list(work_id);
    const body = [...existing, rec].map((t) => JSON.stringify(t)).join("\n") + "\n";
    atomicWriteFsync(tombstonePath(this.root, work_id), body);
  }

  /** Union live ∪ other (restored). Grants stay consumed; effects take the higher rank. */
  async mergeFrom(other: TombstoneStore, work_id: string): Promise<Tombstone[]> {
    const live = await this.list(work_id);
    const restored = await other.list(work_id);
    const grants = new Set<string>();
    const effects = new Map<string, TerminalEffectState>();
    const order: Tombstone[] = [];
    for (const t of [...live, ...restored]) {
      if (t.kind === "grant_consumed") {
        if (grants.has(t.grant_ref)) continue;
        grants.add(t.grant_ref);
        order.push(t);
      } else {
        const prev = effects.get(t.effect_id);
        if (prev && TERMINAL_RANK[prev] >= TERMINAL_RANK[t.state]) continue;
        effects.set(t.effect_id, t.state);
        order.push(t);
      }
    }
    const body = order.map((t) => JSON.stringify(t)).join("\n") + (order.length ? "\n" : "");
    if (order.length) atomicWriteFsync(tombstonePath(this.root, work_id), body);
    return order;
  }

  consumedGrants(tombstones: readonly Tombstone[]): ReadonlySet<string> {
    return new Set(tombstones.filter((t) => t.kind === "grant_consumed").map((t) => t.grant_ref));
  }

  applyToProjection(projection: LedgerProjection, tombstones: readonly Tombstone[]): LedgerProjection {
    const next: LedgerProjection = {
      ...projection,
      task_states: [...projection.task_states],
      effect_summary: projection.effect_summary.map((e) => ({ ...e })),
      artifact_refs: [...projection.artifact_refs],
    };
    for (const t of tombstones) {
      if (t.kind !== "effect_terminal") continue;
      const i = next.effect_summary.findIndex((e) => e.effect_id === t.effect_id);
      if (i < 0) {
        next.effect_summary.push({ effect_id: t.effect_id, state: t.state });
        continue;
      }
      const current = next.effect_summary[i].state;
      const currentRank = EFFECT_RANK[current] ?? 0;
      if (TERMINAL_RANK[t.state] >= currentRank) {
        next.effect_summary[i] = { effect_id: t.effect_id, state: t.state };
      }
    }
    return next;
  }
}
