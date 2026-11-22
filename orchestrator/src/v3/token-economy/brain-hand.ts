/**
 * V1-TOK-17 — Brain vs Hand (Fast-Apply).
 *
 * Main model emits a compact 50–100 token plan; a local small model or
 * deterministic applier expands it. Deterministic path uses surgical-edit.
 */

import {
  applySurgicalEdit,
  hashLineRange,
  type SurgicalEditResult,
  type SurgicalEditSpec,
  type SurgicalOp,
} from "./surgical-edit.js";

/** Compact plan from the "brain" — intentionally small. */
export interface CompactEditPlan {
  kind: "CompactEditPlan";
  /** Target file (workspace-relative or absolute). */
  path: string;
  op: SurgicalOp;
  /** Inclusive 1-indexed. */
  start: number;
  end: number;
  /** Replacement text for REPLACE (may be omitted for DELETE). */
  content?: string;
  /** Optional expected hash; when omitted, computed at apply time if file readable. */
  expectedHash?: string;
  note?: string;
}

export interface SplitPlanAndApplyInput {
  /** Compact plan JSON or already-parsed plan. */
  plan: CompactEditPlan | string;
  workspaceRoot?: string;
  /**
   * When true (default), apply via surgical-edit (deterministic hand).
   * When false, only parse/validate and return the plan without mutating.
   */
  apply?: boolean;
  /** Optional local expander hook (small model); unused on deterministic path. */
  expandLocal?: (plan: CompactEditPlan) => Promise<CompactEditPlan> | CompactEditPlan;
}

export interface SplitPlanAndApplyResult {
  kind: "SplitPlanAndApplyResult";
  plan: CompactEditPlan;
  /** Rough proxy token count of the compact plan (chars/4). */
  plan_tokens_proxy: number;
  applied: boolean;
  mode: "deterministic" | "local_expand" | "plan_only";
  edit?: SurgicalEditResult;
  error?: string;
}

const PLAN_TOKEN_SOFT_MIN = 50;
const PLAN_TOKEN_SOFT_MAX = 100;

/** Estimate proxy tokens (chars/4) for plan budget checks. */
export function estimatePlanTokensProxy(plan: CompactEditPlan): number {
  const raw = JSON.stringify({
    path: plan.path,
    op: plan.op,
    start: plan.start,
    end: plan.end,
    content: plan.content,
    note: plan.note,
  });
  return Math.ceil(raw.length / 4);
}

export function parseCompactEditPlan(raw: string | CompactEditPlan): CompactEditPlan {
  if (typeof raw !== "string") {
    if (raw.kind !== "CompactEditPlan") {
      throw new Error("invalid CompactEditPlan.kind");
    }
    return raw;
  }
  const parsed = JSON.parse(raw) as CompactEditPlan;
  if (!parsed || parsed.kind !== "CompactEditPlan") {
    throw new Error("plan must be CompactEditPlan JSON");
  }
  if (!parsed.path || (parsed.op !== "REPLACE" && parsed.op !== "DELETE")) {
    throw new Error("plan requires path and op REPLACE|DELETE");
  }
  if (!Number.isInteger(parsed.start) || !Number.isInteger(parsed.end)) {
    throw new Error("plan requires integer start/end");
  }
  return parsed;
}

/**
 * Brain emits compact plan; Hand applies deterministically via surgical-edit.
 * Optional expandLocal runs before apply when provided (still local / zero frontier).
 */
export async function splitPlanAndApply(
  input: SplitPlanAndApplyInput,
): Promise<SplitPlanAndApplyResult> {
  let plan: CompactEditPlan;
  try {
    plan = parseCompactEditPlan(input.plan);
  } catch (err) {
    return {
      kind: "SplitPlanAndApplyResult",
      plan: {
        kind: "CompactEditPlan",
        path: "",
        op: "REPLACE",
        start: 1,
        end: 1,
      },
      plan_tokens_proxy: 0,
      applied: false,
      mode: "plan_only",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (input.expandLocal) {
    plan = await Promise.resolve(input.expandLocal(plan));
  }

  const plan_tokens_proxy = estimatePlanTokensProxy(plan);
  const apply = input.apply !== false;

  if (!apply) {
    return {
      kind: "SplitPlanAndApplyResult",
      plan,
      plan_tokens_proxy,
      applied: false,
      mode: input.expandLocal ? "local_expand" : "plan_only",
    };
  }

  const spec: SurgicalEditSpec = {
    op: plan.op,
    start: plan.start,
    end: plan.end,
    content: plan.content,
    expectedHash: plan.expectedHash,
  };

  // If no expectedHash, compute from current file so apply can still validate when provided later.
  // Surgical-edit allows missing expectedHash; we pass through as-is.
  const edit = applySurgicalEdit(plan.path, spec, input.workspaceRoot);

  return {
    kind: "SplitPlanAndApplyResult",
    plan,
    plan_tokens_proxy,
    applied: edit.ok,
    mode: input.expandLocal ? "local_expand" : "deterministic",
    edit,
    error: edit.ok ? undefined : edit.error,
  };
}

/** Soft budget hint for brain output (does not hard-fail). */
export function planWithinSoftBudget(plan: CompactEditPlan): {
  ok: boolean;
  tokens: number;
  soft_min: number;
  soft_max: number;
} {
  const tokens = estimatePlanTokensProxy(plan);
  return {
    ok: tokens >= PLAN_TOKEN_SOFT_MIN && tokens <= PLAN_TOKEN_SOFT_MAX,
    tokens,
    soft_min: PLAN_TOKEN_SOFT_MIN,
    soft_max: PLAN_TOKEN_SOFT_MAX,
  };
}

export { hashLineRange };
