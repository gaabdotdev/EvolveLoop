/**
 * V3-ORCH-02 — Auto-Replanejamento Dinâmico de DAG.
 *
 * Tasks may propose structural TaskGraph mutations; the MSO validates
 * deterministically before any apply. Rejects cycles, budget overruns,
 * and permission violations. No LLM in the validation path.
 */

import { createHash } from "node:crypto";
import { topologicalOrder, type TopoTask } from "../mso/topo.js";
import { MsoError } from "../mso/errors.js";
import type { DomainRole, OrchestrationTask, TaskGraphSnapshot, TaskKind } from "./types.js";

export const DYNAMIC_DAG_SCHEMA_VERSION = "1" as const;

export type DagMutationOpKind =
  | "add_task"
  | "remove_task"
  | "set_depends_on"
  | "add_dependency"
  | "remove_dependency";

export const ALL_DAG_MUTATION_OPS: readonly DagMutationOpKind[] = [
  "add_task",
  "remove_task",
  "set_depends_on",
  "add_dependency",
  "remove_dependency",
] as const;

/** Minimal task draft used when proposing an add_task op. */
export interface DagTaskDraft {
  task_id: string;
  title: string;
  depends_on?: string[];
  parent_task_id?: string;
  task_kind?: TaskKind;
  domain?: string;
  touch_paths?: string[];
  /** Proxy cost charged against token_budget_remaining when present. */
  estimated_tokens?: number;
}

export type DagMutationOp =
  | { op: "add_task"; task: DagTaskDraft }
  | { op: "remove_task"; task_id: string }
  | { op: "set_depends_on"; task_id: string; depends_on: string[] }
  | { op: "add_dependency"; task_id: string; depends_on_task_id: string }
  | { op: "remove_dependency"; task_id: string; depends_on_task_id: string };

/** Working node for mutation projection (subset of OrchestrationTask). */
export interface MutableDagNode {
  task_id: string;
  title: string;
  depends_on: string[];
  parent_task_id?: string;
  task_kind?: TaskKind;
  domain?: string;
  touch_paths?: string[];
  estimated_tokens?: number;
}

export interface DagMutationProposal {
  kind: "DagMutationProposal";
  schema_version: typeof DYNAMIC_DAG_SCHEMA_VERSION;
  /** Deterministic sha256 of canonical proposal body (without proposal_id/proposed_at). */
  proposal_id: string;
  work_id: string;
  proposer_task_id: string;
  proposer_role: DomainRole;
  rationale: string;
  ops: DagMutationOp[];
  proposed_at: string;
}

export interface DagMutationBudgetPolicy {
  /** Hard cap on task count after mutation. */
  max_tasks: number;
  /** Longest depends_on path length (edge count) allowed after mutation. */
  max_depth: number;
  /** Max direct dependents of any single task. */
  max_fan_out: number;
  /** Lifetime mutation applications allowed for this work. */
  max_mutations: number;
  /** How many mutations already applied for this work. */
  mutations_applied: number;
  /** Optional remaining token budget; charged by sum of estimated_tokens on add_task. */
  token_budget_remaining?: number;
}

export interface DagMutationPermissionPolicy {
  allowed_roles: readonly DomainRole[];
  allowed_ops: readonly DagMutationOpKind[];
  /**
   * When true, ops may only touch the proposer task and its descendants
   * (via parent_task_id). Adding a task requires parent_task_id in-subtree.
   */
  restrict_to_subtree: boolean;
}

export type MutationRejectCode =
  | "CYCLE"
  | "BUDGET_MAX_TASKS"
  | "BUDGET_MAX_DEPTH"
  | "BUDGET_MAX_FAN_OUT"
  | "BUDGET_MAX_MUTATIONS"
  | "BUDGET_TOKENS"
  | "PERMISSION_ROLE"
  | "PERMISSION_OP"
  | "PERMISSION_SCOPE"
  | "MISSING_TASK"
  | "DUPLICATE_TASK"
  | "EMPTY_OPS"
  | "INVALID_OP";

export interface DagMutationValidationResult {
  kind: "DagMutationValidationResult";
  schema_version: typeof DYNAMIC_DAG_SCHEMA_VERSION;
  proposal_id: string;
  accepted: boolean;
  codes: MutationRejectCode[];
  reasons: string[];
  resulting_task_count: number;
  resulting_depth: number;
  resulting_max_fan_out: number;
  projected_tokens_added: number;
  /** Present when projection succeeded (even if later rejected on budget). */
  projected_nodes?: MutableDagNode[];
}

export interface ProposeDagMutationInput {
  work_id: string;
  proposer_task_id: string;
  proposer_role: DomainRole;
  rationale: string;
  ops: DagMutationOp[];
  /** Fixed timestamp for deterministic proposal_id across clocks (tests). */
  proposed_at?: string;
}

export interface ValidateMutationInput {
  proposal: DagMutationProposal;
  /** Current graph nodes (from TaskGraphSnapshot or synthetic). */
  nodes: MutableDagNode[];
  budget: DagMutationBudgetPolicy;
  permissions: DagMutationPermissionPolicy;
}

export class DynamicDagError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DynamicDagError";
  }
}

/** Stable JSON stringify: sorted object keys, arrays preserve order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function nodesFromSnapshot(snap: TaskGraphSnapshot): MutableDagNode[] {
  return snap.tasks.map(orchestrationTaskToNode);
}

export function orchestrationTaskToNode(task: OrchestrationTask): MutableDagNode {
  return {
    task_id: task.task_id,
    title: task.title,
    depends_on: [...(task.depends_on ?? [])].sort((a, b) => a.localeCompare(b)),
    parent_task_id: task.parent_task_id,
    task_kind: task.task_kind,
    domain: task.domain,
    touch_paths: task.touch_paths ? [...task.touch_paths] : undefined,
  };
}

function cloneNodes(nodes: MutableDagNode[]): MutableDagNode[] {
  return nodes.map((n) => ({
    ...n,
    depends_on: [...n.depends_on],
    touch_paths: n.touch_paths ? [...n.touch_paths] : undefined,
  }));
}

function normalizeDepends(deps: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of deps) {
    const id = d.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Build a structural mutation proposal. Does not validate or apply.
 * `proposal_id` is a deterministic sha256 of the canonical body.
 */
export function proposeDagMutation(input: ProposeDagMutationInput): DagMutationProposal {
  if (!input.work_id?.trim()) {
    throw new DynamicDagError("INVALID_INPUT", "work_id is required");
  }
  if (!input.proposer_task_id?.trim()) {
    throw new DynamicDagError("INVALID_INPUT", "proposer_task_id is required");
  }
  if (!Array.isArray(input.ops)) {
    throw new DynamicDagError("INVALID_INPUT", "ops must be an array");
  }

  const proposed_at = input.proposed_at ?? new Date().toISOString();
  const ops = cloneOps(input.ops);
  const body = {
    kind: "DagMutationProposal" as const,
    schema_version: DYNAMIC_DAG_SCHEMA_VERSION,
    work_id: input.work_id,
    proposer_task_id: input.proposer_task_id,
    proposer_role: input.proposer_role,
    rationale: input.rationale,
    ops,
  };
  const proposal_id = sha256Hex(canonicalJson(body));

  return {
    ...body,
    proposal_id,
    proposed_at,
  };
}

function cloneOps(ops: DagMutationOp[]): DagMutationOp[] {
  return ops.map((op) => {
    switch (op.op) {
      case "add_task":
        return {
          op: "add_task",
          task: {
            ...op.task,
            depends_on: op.task.depends_on
              ? normalizeDepends(op.task.depends_on)
              : undefined,
            touch_paths: op.task.touch_paths ? [...op.task.touch_paths] : undefined,
          },
        };
      case "remove_task":
        return { op: "remove_task", task_id: op.task_id };
      case "set_depends_on":
        return {
          op: "set_depends_on",
          task_id: op.task_id,
          depends_on: normalizeDepends(op.depends_on),
        };
      case "add_dependency":
        return {
          op: "add_dependency",
          task_id: op.task_id,
          depends_on_task_id: op.depends_on_task_id,
        };
      case "remove_dependency":
        return {
          op: "remove_dependency",
          task_id: op.task_id,
          depends_on_task_id: op.depends_on_task_id,
        };
      default: {
        const _exhaustive: never = op;
        throw new DynamicDagError("INVALID_OP", `unknown op: ${JSON.stringify(_exhaustive)}`);
      }
    }
  });
}

/** Longest depends_on path (edge count). Acyclic graphs only. */
export function computeDagDepth(nodes: MutableDagNode[]): number {
  const byId = new Map(nodes.map((n) => [n.task_id, n]));
  const memo = new Map<string, number>();

  function depthOf(id: string, stack: Set<string>): number {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return Number.POSITIVE_INFINITY; // cycle signal
    const node = byId.get(id);
    if (!node) return 0;
    stack.add(id);
    let best = 0;
    for (const dep of node.depends_on) {
      best = Math.max(best, 1 + depthOf(dep, stack));
    }
    stack.delete(id);
    memo.set(id, best);
    return best;
  }

  let max = 0;
  for (const n of nodes) {
    max = Math.max(max, depthOf(n.task_id, new Set()));
  }
  return max;
}

/** Max number of tasks that directly depend on the same task_id. */
export function computeMaxFanOut(nodes: MutableDagNode[]): number {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    for (const dep of n.depends_on) {
      counts.set(dep, (counts.get(dep) ?? 0) + 1);
    }
  }
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  // Roots with zero dependents still count as fan-out 0.
  return max;
}

function subtreeIds(nodes: MutableDagNode[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_task_id) {
      const list = children.get(n.parent_task_id) ?? [];
      list.push(n.task_id);
      children.set(n.parent_task_id, list);
    }
  }
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of children.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

export interface ApplyOpsResult {
  nodes: MutableDagNode[];
  tokens_added: number;
  codes: MutationRejectCode[];
  reasons: string[];
}

/**
 * Pure projection of ops onto a cloned node list. Does not enforce budget/permissions.
 * Collects structural errors (missing/duplicate) into codes.
 */
export function applyOpsToNodes(nodes: MutableDagNode[], ops: DagMutationOp[]): ApplyOpsResult {
  const working = cloneNodes(nodes);
  const byId = new Map(working.map((n) => [n.task_id, n]));
  const codes: MutationRejectCode[] = [];
  const reasons: string[] = [];
  let tokens_added = 0;

  const push = (code: MutationRejectCode, reason: string) => {
    codes.push(code);
    reasons.push(reason);
  };

  for (const op of ops) {
    switch (op.op) {
      case "add_task": {
        const id = op.task.task_id?.trim();
        if (!id) {
          push("INVALID_OP", "add_task missing task_id");
          break;
        }
        if (byId.has(id)) {
          push("DUPLICATE_TASK", `add_task duplicate task_id='${id}'`);
          break;
        }
        const node: MutableDagNode = {
          task_id: id,
          title: op.task.title || id,
          depends_on: normalizeDepends(op.task.depends_on ?? []),
          parent_task_id: op.task.parent_task_id,
          task_kind: op.task.task_kind,
          domain: op.task.domain,
          touch_paths: op.task.touch_paths ? [...op.task.touch_paths] : undefined,
          estimated_tokens: op.task.estimated_tokens,
        };
        working.push(node);
        byId.set(id, node);
        if (typeof op.task.estimated_tokens === "number" && op.task.estimated_tokens > 0) {
          tokens_added += Math.floor(op.task.estimated_tokens);
        }
        break;
      }
      case "remove_task": {
        if (!byId.has(op.task_id)) {
          push("MISSING_TASK", `remove_task unknown task_id='${op.task_id}'`);
          break;
        }
        byId.delete(op.task_id);
        const idx = working.findIndex((n) => n.task_id === op.task_id);
        if (idx >= 0) working.splice(idx, 1);
        for (const n of working) {
          n.depends_on = n.depends_on.filter((d) => d !== op.task_id);
          if (n.parent_task_id === op.task_id) {
            delete n.parent_task_id;
          }
        }
        break;
      }
      case "set_depends_on": {
        const node = byId.get(op.task_id);
        if (!node) {
          push("MISSING_TASK", `set_depends_on unknown task_id='${op.task_id}'`);
          break;
        }
        node.depends_on = normalizeDepends(op.depends_on);
        break;
      }
      case "add_dependency": {
        const node = byId.get(op.task_id);
        if (!node) {
          push("MISSING_TASK", `add_dependency unknown task_id='${op.task_id}'`);
          break;
        }
        if (!byId.has(op.depends_on_task_id) && op.depends_on_task_id !== op.task_id) {
          // Dep may be missing — topo will catch; also flag explicitly.
          push(
            "MISSING_TASK",
            `add_dependency missing depends_on_task_id='${op.depends_on_task_id}'`,
          );
          break;
        }
        node.depends_on = normalizeDepends([...node.depends_on, op.depends_on_task_id]);
        break;
      }
      case "remove_dependency": {
        const node = byId.get(op.task_id);
        if (!node) {
          push("MISSING_TASK", `remove_dependency unknown task_id='${op.task_id}'`);
          break;
        }
        node.depends_on = node.depends_on.filter((d) => d !== op.depends_on_task_id);
        break;
      }
      default: {
        const _exhaustive: never = op;
        push("INVALID_OP", `unknown op ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // Resolve deferred missing deps for add_task depends_on after full batch.
  for (const n of working) {
    for (const dep of n.depends_on) {
      if (!byId.has(dep)) {
        push("MISSING_TASK", `task '${n.task_id}' depends on missing '${dep}'`);
      }
    }
  }

  return { nodes: working, tokens_added, codes, reasons };
}

function detectCycle(nodes: MutableDagNode[]): boolean {
  const topoTasks: TopoTask[] = nodes.map((n) => ({
    task_id: n.task_id,
    depends_on: n.depends_on,
  }));
  try {
    topologicalOrder(topoTasks);
    return false;
  } catch (err) {
    if (err instanceof MsoError && (err.code === "TOPO_CYCLE" || err.code === "TOPO_MISSING_DEP")) {
      return err.code === "TOPO_CYCLE" || err.code === "TOPO_MISSING_DEP";
    }
    throw err;
  }
}

function isCycleError(nodes: MutableDagNode[]): { cycle: boolean; missing: boolean } {
  const topoTasks: TopoTask[] = nodes.map((n) => ({
    task_id: n.task_id,
    depends_on: n.depends_on,
  }));
  try {
    topologicalOrder(topoTasks);
    return { cycle: false, missing: false };
  } catch (err) {
    if (err instanceof MsoError) {
      if (err.code === "TOPO_CYCLE") return { cycle: true, missing: false };
      if (err.code === "TOPO_MISSING_DEP") return { cycle: false, missing: true };
    }
    throw err;
  }
}

/**
 * Deterministic MSO validation of a proposed structural DAG mutation.
 * Same inputs → same accepted/codes/metrics (no time, no randomness).
 */
export function validateMutationDeterministic(
  input: ValidateMutationInput,
): DagMutationValidationResult {
  const { proposal, budget, permissions } = input;
  const codes: MutationRejectCode[] = [];
  const reasons: string[] = [];

  const push = (code: MutationRejectCode, reason: string) => {
    codes.push(code);
    reasons.push(reason);
  };

  if (!proposal.ops || proposal.ops.length === 0) {
    push("EMPTY_OPS", "proposal has no ops");
  }

  // ── Permissions (role) ────────────────────────────────────────────────────
  if (!permissions.allowed_roles.includes(proposal.proposer_role)) {
    push(
      "PERMISSION_ROLE",
      `role '${proposal.proposer_role}' not in allowed_roles=[${permissions.allowed_roles.join(",")}]`,
    );
  }

  for (const op of proposal.ops) {
    if (!permissions.allowed_ops.includes(op.op)) {
      push("PERMISSION_OP", `op '${op.op}' not permitted for proposer`);
    }
  }

  // ── Budget: mutation count (before projection) ────────────────────────────
  if (budget.mutations_applied >= budget.max_mutations) {
    push(
      "BUDGET_MAX_MUTATIONS",
      `mutations_applied=${budget.mutations_applied} >= max_mutations=${budget.max_mutations}`,
    );
  }

  // ── Scope permissions (pre-check against current graph) ───────────────────
  if (permissions.restrict_to_subtree) {
    const scope = subtreeIds(input.nodes, proposal.proposer_task_id);
    if (!scope.has(proposal.proposer_task_id) && !input.nodes.some((n) => n.task_id === proposal.proposer_task_id)) {
      push(
        "PERMISSION_SCOPE",
        `proposer_task_id='${proposal.proposer_task_id}' not in graph`,
      );
    }
    for (const op of proposal.ops) {
      const touched = touchedTaskIds(op);
      for (const id of touched) {
        if (op.op === "add_task") {
          const parent = op.task.parent_task_id;
          if (!parent || !scope.has(parent)) {
            push(
              "PERMISSION_SCOPE",
              `add_task '${op.task.task_id}' requires parent_task_id inside proposer subtree`,
            );
          }
        } else if (!scope.has(id)) {
          push(
            "PERMISSION_SCOPE",
            `op '${op.op}' touches '${id}' outside proposer subtree`,
          );
        }
      }
    }
  }

  // ── Project ops ───────────────────────────────────────────────────────────
  const applied = applyOpsToNodes(input.nodes, proposal.ops);
  for (let i = 0; i < applied.codes.length; i++) {
    push(applied.codes[i]!, applied.reasons[i]!);
  }

  const projected = applied.nodes;
  const cycleInfo = projected.length > 0 ? isCycleError(projected) : { cycle: false, missing: false };
  if (cycleInfo.cycle) {
    push("CYCLE", "projected TaskGraph has a cycle");
  }
  if (cycleInfo.missing && !codes.includes("MISSING_TASK")) {
    push("MISSING_TASK", "projected TaskGraph has missing dependency");
  }

  const resulting_task_count = projected.length;
  const resulting_depth =
    cycleInfo.cycle || cycleInfo.missing ? -1 : computeDagDepth(projected);
  const resulting_max_fan_out = computeMaxFanOut(projected);
  const projected_tokens_added = applied.tokens_added;

  if (resulting_task_count > budget.max_tasks) {
    push(
      "BUDGET_MAX_TASKS",
      `task_count=${resulting_task_count} > max_tasks=${budget.max_tasks}`,
    );
  }
  if (resulting_depth >= 0 && resulting_depth > budget.max_depth) {
    push(
      "BUDGET_MAX_DEPTH",
      `depth=${resulting_depth} > max_depth=${budget.max_depth}`,
    );
  }
  if (resulting_max_fan_out > budget.max_fan_out) {
    push(
      "BUDGET_MAX_FAN_OUT",
      `max_fan_out=${resulting_max_fan_out} > budget.max_fan_out=${budget.max_fan_out}`,
    );
  }
  if (
    typeof budget.token_budget_remaining === "number" &&
    projected_tokens_added > budget.token_budget_remaining
  ) {
    push(
      "BUDGET_TOKENS",
      `tokens_added=${projected_tokens_added} > token_budget_remaining=${budget.token_budget_remaining}`,
    );
  }

  const accepted = codes.length === 0;

  // Stable sort for determinism (same inputs → same codes/reasons order)
  const uniqueCodes = [...new Set(codes)].sort((a, b) => a.localeCompare(b));
  const uniqueReasons = [...new Set(reasons)].sort((a, b) => a.localeCompare(b));

  return {
    kind: "DagMutationValidationResult",
    schema_version: DYNAMIC_DAG_SCHEMA_VERSION,
    proposal_id: proposal.proposal_id,
    accepted,
    codes: accepted ? [] : uniqueCodes,
    reasons: accepted ? [] : uniqueReasons,
    resulting_task_count,
    resulting_depth: resulting_depth < 0 ? 0 : resulting_depth,
    resulting_max_fan_out,
    projected_tokens_added,
    projected_nodes: projected,
  };
}

function touchedTaskIds(op: DagMutationOp): string[] {
  switch (op.op) {
    case "add_task":
      return [op.task.task_id, ...(op.task.parent_task_id ? [op.task.parent_task_id] : [])];
    case "remove_task":
      return [op.task_id];
    case "set_depends_on":
      return [op.task_id, ...op.depends_on];
    case "add_dependency":
    case "remove_dependency":
      return [op.task_id, op.depends_on_task_id];
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

/**
 * Apply a validated proposal onto a TaskGraphStore snapshot in memory.
 * Throws if validation would reject — call validateMutationDeterministic first.
 */
export function projectMutationNodes(
  nodes: MutableDagNode[],
  proposal: DagMutationProposal,
): MutableDagNode[] {
  const applied = applyOpsToNodes(nodes, proposal.ops);
  if (applied.codes.length > 0) {
    throw new DynamicDagError(applied.codes[0]!, applied.reasons[0]!);
  }
  if (detectCycle(applied.nodes)) {
    throw new DynamicDagError("CYCLE", "projected TaskGraph has a cycle");
  }
  return applied.nodes;
}

/** Sensible defaults for MSO gate tests. */
export function defaultBudgetPolicy(
  overrides?: Partial<DagMutationBudgetPolicy>,
): DagMutationBudgetPolicy {
  return {
    max_tasks: 32,
    max_depth: 8,
    max_fan_out: 8,
    max_mutations: 16,
    mutations_applied: 0,
    token_budget_remaining: 100_000,
    ...overrides,
  };
}

export function defaultPermissionPolicy(
  overrides?: Partial<DagMutationPermissionPolicy>,
): DagMutationPermissionPolicy {
  return {
    allowed_roles: ["master", "leader", "planner", "worker"],
    allowed_ops: [...ALL_DAG_MUTATION_OPS],
    restrict_to_subtree: false,
    ...overrides,
  };
}
