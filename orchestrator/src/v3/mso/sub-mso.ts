/**
 * V3-ORCH-03 — Orquestração Hierárquica Delimitada (Sub-MSOs).
 *
 * Ephemeral Sub-MSOs spawn with:
 *   - attenuated capabilities (hard subset of parent — never escalate)
 *   - inherited token budget (never exceed parent remaining / delegated max)
 *
 * Enforcement rejects token spend above budget and any capability outside
 * the attenuated set. No LLM in the enforcement path.
 */

import { createHash } from "node:crypto";
import type { CapabilityAction } from "../security/types.js";
import { MsoError } from "./errors.js";

export const SUB_MSO_SCHEMA_VERSION = "1" as const;

/** Capability identifiers delegated to an MSO / Sub-MSO. */
export type MsoCapability = CapabilityAction | (string & {});

export interface SubMsoBudget {
  /** Hard ceiling for this Sub-MSO (tokens). */
  max_tokens: number;
  /**
   * Parent remaining tokens at spawn time. When set, child max_tokens
   * must be ≤ parent_remaining_tokens (fail-closed on escalation).
   */
  parent_remaining_tokens?: number;
}

export interface SpawnSubMsoOptions {
  parent_mso_id?: string;
  work_id?: string;
  objective?: string;
  /**
   * Requested capability set. Must be ⊆ parentCaps.
   * When omitted, child inherits a copy of parentCaps (still attenuated = subset).
   */
  requested_caps?: readonly MsoCapability[];
  /** Injectable clock for deterministic tests. */
  clock?: () => Date;
  /** Optional stable id seed (tests). */
  sub_mso_id?: string;
}

export interface SubMsoHandle {
  kind: "SubMso";
  schema_version: typeof SUB_MSO_SCHEMA_VERSION;
  sub_mso_id: string;
  parent_mso_id: string;
  work_id?: string;
  objective?: string;
  /** Always true — Sub-MSOs are ephemeral session-scoped units. */
  ephemeral: true;
  /** Attenuated capabilities: ⊆ parent at spawn. */
  capabilities: readonly MsoCapability[];
  budget: {
    max_tokens: number;
    tokens_spent: number;
    parent_remaining_tokens?: number;
  };
  created_at: string;
  terminated_at?: string;
}

export type SubMsoRejectCode =
  | "BUDGET_EXCEEDED"
  | "BUDGET_ESCALATION"
  | "CAPABILITY_NOT_DELEGATED"
  | "CAPABILITY_ESCALATION"
  | "TERMINATED"
  | "INVALID_BUDGET"
  | "INVALID_PARENT_CAPS"
  | "INVALID_SPEND";

export interface SubMsoEnforceOk {
  ok: true;
}

export interface SubMsoEnforceReject {
  ok: false;
  code: SubMsoRejectCode;
  reason: string;
}

export type SubMsoEnforceResult = SubMsoEnforceOk | SubMsoEnforceReject;

export class SubMsoError extends MsoError {
  constructor(
    readonly rejectCode: SubMsoRejectCode,
    message: string,
  ) {
    super(rejectCode, message);
    this.name = "SubMsoError";
  }
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function uniqSorted(caps: readonly MsoCapability[]): MsoCapability[] {
  return [...new Set(caps.map((c) => String(c).trim()).filter(Boolean))].sort();
}

/** True iff every child cap appears in parent. */
export function capabilitiesAreSubset(
  child: readonly MsoCapability[],
  parent: readonly MsoCapability[],
): boolean {
  const set = new Set(parent.map(String));
  return child.every((c) => set.has(String(c)));
}

/**
 * Intersect requested with parent. Returns attenuated set (sorted, unique).
 * Throws CAPABILITY_ESCALATION when requested contains anything outside parent.
 */
export function attenuateCapabilities(
  parentCaps: readonly MsoCapability[],
  requestedCaps?: readonly MsoCapability[],
): MsoCapability[] {
  const parent = uniqSorted(parentCaps);
  if (parent.length === 0) {
    throw new SubMsoError(
      "INVALID_PARENT_CAPS",
      "parentCaps must be a non-empty capability set",
    );
  }
  if (requestedCaps == null) {
    return parent;
  }
  const requested = uniqSorted(requestedCaps);
  if (requested.length === 0) {
    throw new SubMsoError(
      "CAPABILITY_ESCALATION",
      "requested_caps must be non-empty when provided",
    );
  }
  if (!capabilitiesAreSubset(requested, parent)) {
    const extras = requested.filter((c) => !parent.includes(c));
    throw new SubMsoError(
      "CAPABILITY_ESCALATION",
      `requested caps escalate beyond parent: ${extras.join(",")}`,
    );
  }
  return requested;
}

function resolveBudget(budget: SubMsoBudget): {
  max_tokens: number;
  parent_remaining_tokens?: number;
} {
  const max = Math.floor(Number(budget.max_tokens));
  if (!Number.isFinite(max) || max < 0) {
    throw new SubMsoError(
      "INVALID_BUDGET",
      `max_tokens must be a non-negative integer; got ${budget.max_tokens}`,
    );
  }
  if (budget.parent_remaining_tokens != null) {
    const remaining = Math.floor(Number(budget.parent_remaining_tokens));
    if (!Number.isFinite(remaining) || remaining < 0) {
      throw new SubMsoError(
        "INVALID_BUDGET",
        `parent_remaining_tokens must be a non-negative integer; got ${budget.parent_remaining_tokens}`,
      );
    }
    if (max > remaining) {
      throw new SubMsoError(
        "BUDGET_ESCALATION",
        `child max_tokens=${max} exceeds parent_remaining_tokens=${remaining}`,
      );
    }
    return { max_tokens: max, parent_remaining_tokens: remaining };
  }
  return { max_tokens: max };
}

function makeSubMsoId(
  parentId: string,
  caps: readonly MsoCapability[],
  maxTokens: number,
  explicit?: string,
): string {
  if (explicit) return explicit;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        parent: parentId,
        caps: [...caps],
        max_tokens: maxTokens,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return `sub-mso-${digest}`;
}

/**
 * Spawn an ephemeral Sub-MSO with attenuated capabilities and inherited budget.
 *
 * Invariants:
 * - capabilities ⊆ parentCaps
 * - max_tokens ≤ parent_remaining_tokens when parent_remaining_tokens is set
 * - tokens_spent starts at 0
 */
export function spawnSubMso(
  parentCaps: readonly MsoCapability[],
  budget: SubMsoBudget,
  opts: SpawnSubMsoOptions = {},
): SubMsoHandle {
  const attenuated = attenuateCapabilities(parentCaps, opts.requested_caps);
  const resolved = resolveBudget(budget);
  const parent_mso_id = opts.parent_mso_id?.trim() || "mso-root";
  const created_at = nowIso(opts.clock);

  return {
    kind: "SubMso",
    schema_version: SUB_MSO_SCHEMA_VERSION,
    sub_mso_id: makeSubMsoId(
      parent_mso_id,
      attenuated,
      resolved.max_tokens,
      opts.sub_mso_id,
    ),
    parent_mso_id,
    work_id: opts.work_id,
    objective: opts.objective,
    ephemeral: true,
    capabilities: Object.freeze([...attenuated]) as readonly MsoCapability[],
    budget: {
      max_tokens: resolved.max_tokens,
      tokens_spent: 0,
      parent_remaining_tokens: resolved.parent_remaining_tokens,
    },
    created_at,
  };
}

/** Spawn a nested Sub-MSO from an existing Sub-MSO (further attenuation). */
export function spawnNestedSubMso(
  parent: SubMsoHandle,
  budget: SubMsoBudget,
  opts: Omit<SpawnSubMsoOptions, "parent_mso_id"> = {},
): SubMsoHandle {
  if (parent.terminated_at) {
    throw new SubMsoError(
      "TERMINATED",
      `parent Sub-MSO ${parent.sub_mso_id} is terminated`,
    );
  }
  const remaining = parent.budget.max_tokens - parent.budget.tokens_spent;
  const inherited: SubMsoBudget = {
    max_tokens: budget.max_tokens,
    parent_remaining_tokens:
      budget.parent_remaining_tokens != null
        ? Math.min(budget.parent_remaining_tokens, remaining)
        : remaining,
  };
  return spawnSubMso(parent.capabilities, inherited, {
    ...opts,
    parent_mso_id: parent.sub_mso_id,
  });
}

/**
 * Enforce that `capability` is in the attenuated set.
 * Does not mutate state.
 */
export function enforceCapability(
  sub: SubMsoHandle,
  capability: MsoCapability,
): SubMsoEnforceResult {
  if (sub.terminated_at) {
    return {
      ok: false,
      code: "TERMINATED",
      reason: `Sub-MSO ${sub.sub_mso_id} is terminated`,
    };
  }
  const cap = String(capability).trim();
  if (!cap) {
    return {
      ok: false,
      code: "CAPABILITY_NOT_DELEGATED",
      reason: "empty capability",
    };
  }
  if (!sub.capabilities.map(String).includes(cap)) {
    return {
      ok: false,
      code: "CAPABILITY_NOT_DELEGATED",
      reason: `capability ${cap} not in attenuated set of ${sub.sub_mso_id}`,
    };
  }
  return { ok: true };
}

/**
 * Enforce a token spend against the Sub-MSO budget.
 * On success, mutates `sub.budget.tokens_spent` (+tokens).
 * Rejects when spend would exceed max_tokens.
 */
export function enforceSpend(
  sub: SubMsoHandle,
  tokens: number,
): SubMsoEnforceResult {
  if (sub.terminated_at) {
    return {
      ok: false,
      code: "TERMINATED",
      reason: `Sub-MSO ${sub.sub_mso_id} is terminated`,
    };
  }
  const n = Math.floor(Number(tokens));
  if (!Number.isFinite(n) || n < 0) {
    return {
      ok: false,
      code: "INVALID_SPEND",
      reason: `tokens must be a non-negative integer; got ${tokens}`,
    };
  }
  const projected = sub.budget.tokens_spent + n;
  if (projected > sub.budget.max_tokens) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      reason: `token spend ${projected} > budget max_tokens=${sub.budget.max_tokens}`,
    };
  }
  sub.budget.tokens_spent = projected;
  return { ok: true };
}

/** Throw SubMsoError when enforceCapability rejects. */
export function assertCapability(
  sub: SubMsoHandle,
  capability: MsoCapability,
): void {
  const r = enforceCapability(sub, capability);
  if (!r.ok) throw new SubMsoError(r.code, r.reason);
}

/** Throw SubMsoError when enforceSpend rejects. */
export function assertSpend(sub: SubMsoHandle, tokens: number): void {
  const r = enforceSpend(sub, tokens);
  if (!r.ok) throw new SubMsoError(r.code, r.reason);
}

/** Mark Sub-MSO terminated (further enforce* → TERMINATED). */
export function terminateSubMso(
  sub: SubMsoHandle,
  clock?: () => Date,
): SubMsoHandle {
  if (!sub.terminated_at) {
    sub.terminated_at = nowIso(clock);
  }
  return sub;
}

/** Remaining tokens before budget breach. */
export function remainingTokens(sub: SubMsoHandle): number {
  return Math.max(0, sub.budget.max_tokens - sub.budget.tokens_spent);
}
