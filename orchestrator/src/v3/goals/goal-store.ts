/**
 * GoalStore — create / accept / activate / transition / supersede with versioned mutations.
 * Uses GoalLifecycleState from §176. Prohibits silent delete.
 */

import { V3_API_VERSION, V3_SCHEMA_VERSION } from "../contracts/common.js";
import type {
  GoalContract,
  GoalLifecycleState,
  GoalTransition,
  GoalVersion,
} from "../contracts/types.js";
import { validateGoalContract } from "../contracts/validators.js";
import {
  GoalNotFoundError,
  GoalValidationError,
  InvalidGoalTransitionError,
  SilentDeleteForbiddenError,
} from "./errors.js";

/**
 * Allowed GoalLifecycle edges (§176).
 * Operational path: proposed → accepted → active ↔ blocked|paused|replanning → verifying → completed.
 * Terminals: abandoned | cancelled | expired | failed | superseded (plus completed).
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<GoalLifecycleState, readonly GoalLifecycleState[]> = new Map([
  ["proposed", ["accepted", "abandoned", "cancelled", "expired", "superseded"]],
  ["accepted", ["active", "abandoned", "cancelled", "expired", "superseded"]],
  [
    "active",
    [
      "blocked",
      "paused",
      "replanning",
      "verifying",
      "abandoned",
      "cancelled",
      "expired",
      "failed",
      "superseded",
    ],
  ],
  [
    "blocked",
    ["active", "paused", "replanning", "abandoned", "cancelled", "expired", "failed", "superseded"],
  ],
  [
    "paused",
    ["active", "blocked", "replanning", "abandoned", "cancelled", "expired", "superseded"],
  ],
  [
    "replanning",
    ["active", "verifying", "abandoned", "cancelled", "expired", "failed", "superseded"],
  ],
  [
    "verifying",
    [
      "completed",
      "active",
      "replanning",
      "failed",
      "abandoned",
      "cancelled",
      "expired",
      "superseded",
    ],
  ],
  ["completed", ["superseded"]],
  ["abandoned", ["superseded"]],
  ["cancelled", ["superseded"]],
  ["expired", ["superseded"]],
  ["failed", ["superseded", "abandoned"]],
  ["superseded", []],
]);

/** States AgencyLoop may propose work for. */
export const AGENCY_ACTIONABLE_STATES: readonly GoalLifecycleState[] = ["active", "verifying"];

export interface CreateGoalInput {
  id: string;
  desired_outcome: string;
  parent_goal_id?: string;
  constraints?: string[];
  non_goals?: string[];
  success_criteria_refs?: string[];
  acceptable_degradation?: string;
  deadline?: string;
  budget?: GoalContract["spec"]["budget"];
  authority?: string;
  risk_policy?: string;
  /** Defaults to proposed (§176). */
  lifecycle_state?: GoalLifecycleState;
  goal_version?: GoalVersion;
  created_at?: string;
}

export interface TransitionOptions {
  reason: string;
  /** Defaults to "system" when omitted — still recorded on GoalTransition. */
  actor?: string;
  evidence?: string[];
  /** @deprecated Prefer `evidence`. */
  evidence_refs?: string[];
  policy_snapshot?: string;
  at?: string;
}

/** @deprecated Use GoalTransition (§176). Kept as type alias for call-site migration. */
export type GoalMutationRecord = GoalTransition;

export interface GoalPortfolio {
  portfolio_id: string;
  goals: GoalContract[];
  /** Optional priority weights (higher = more urgent). */
  priorities?: Record<string, number>;
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function defaultVersion(): GoalVersion {
  return { major: 0, minor: 1, patch: 0, revision: 1 };
}

function bumpRevision(v: GoalVersion): GoalVersion {
  return { ...v, revision: v.revision + 1 };
}

function assertValid(goal: GoalContract): void {
  const result = validateGoalContract(goal);
  if (!result.valid) {
    throw new GoalValidationError(result.errors);
  }
}

function resolveEvidence(options: TransitionOptions): string[] {
  return options.evidence ?? options.evidence_refs ?? [];
}

function buildTransition(
  goal: GoalContract,
  from: GoalLifecycleState,
  to: GoalLifecycleState,
  options: TransitionOptions,
  at: string,
  version: GoalVersion,
): GoalTransition {
  return {
    goal_id: goal.metadata.id,
    parent_goal_id: goal.metadata.parent_goal_id,
    from_state: from,
    to_state: to,
    version,
    reason: options.reason,
    evidence: resolveEvidence(options),
    timestamp: at,
    policy_snapshot: options.policy_snapshot,
    actor: options.actor ?? "system",
  };
}

export function canTransition(from: GoalLifecycleState, to: GoalLifecycleState): boolean {
  const allowed = ALLOWED_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.includes(to);
}

export class GoalStore {
  private readonly goals = new Map<string, GoalContract>();
  private readonly history: GoalTransition[] = [];

  create(input: CreateGoalInput): GoalContract {
    if (this.goals.has(input.id)) {
      throw new GoalValidationError([`goal id already exists: ${input.id}`]);
    }
    const created_at = nowIso(input.created_at);
    const goal: GoalContract = {
      apiVersion: V3_API_VERSION,
      kind: "GoalContract",
      metadata: {
        id: input.id,
        parent_goal_id: input.parent_goal_id,
        schema_version: V3_SCHEMA_VERSION,
        created_at,
        updated_at: created_at,
      },
      spec: {
        desired_outcome: input.desired_outcome,
        constraints: input.constraints ?? [],
        non_goals: input.non_goals ?? [],
        success_criteria_refs: input.success_criteria_refs ?? [],
        acceptable_degradation: input.acceptable_degradation,
        deadline: input.deadline,
        budget: input.budget,
        authority: input.authority,
        risk_policy: input.risk_policy,
        lifecycle_state: input.lifecycle_state ?? "proposed",
        goal_version: input.goal_version ?? defaultVersion(),
      },
    };
    assertValid(goal);
    this.goals.set(goal.metadata.id, goal);
    return structuredClone(goal);
  }

  /** proposed → accepted. */
  accept(goalId: string, options: TransitionOptions): GoalContract {
    return this.transition(goalId, "accepted", options);
  }

  /** accepted → active. */
  activate(goalId: string, options: TransitionOptions): GoalContract {
    return this.transition(goalId, "active", options);
  }

  transition(goalId: string, to: GoalLifecycleState, options: TransitionOptions): GoalContract {
    const current = this.require(goalId);
    const from = current.spec.lifecycle_state;
    if (!canTransition(from, to)) {
      throw new InvalidGoalTransitionError(from, to);
    }
    const at = nowIso(options.at);
    const next: GoalContract = {
      ...current,
      metadata: {
        ...current.metadata,
        updated_at: at,
      },
      spec: {
        ...current.spec,
        lifecycle_state: to,
        // State transitions bump revision so mutations are versioned.
        goal_version: bumpRevision(current.spec.goal_version),
      },
    };
    assertValid(next);
    this.goals.set(goalId, next);
    this.history.push(buildTransition(next, from, to, options, at, next.spec.goal_version));
    return structuredClone(next);
  }

  /**
   * Versioned content mutation: bumps revision, keeps lifecycle unless caller transitions.
   * Does not change lifecycle_state by itself.
   */
  mutateSpec(
    goalId: string,
    patch: Partial<Omit<GoalContract["spec"], "lifecycle_state" | "goal_version">>,
    options: TransitionOptions,
  ): GoalContract {
    const current = this.require(goalId);
    if (current.spec.lifecycle_state === "superseded") {
      throw new InvalidGoalTransitionError("superseded", "mutate");
    }
    const at = nowIso(options.at);
    const next: GoalContract = {
      ...current,
      metadata: {
        ...current.metadata,
        updated_at: at,
      },
      spec: {
        ...current.spec,
        ...patch,
        lifecycle_state: current.spec.lifecycle_state,
        goal_version: bumpRevision(current.spec.goal_version),
      },
    };
    assertValid(next);
    this.goals.set(goalId, next);
    this.history.push(
      buildTransition(
        next,
        current.spec.lifecycle_state,
        current.spec.lifecycle_state,
        options,
        at,
        next.spec.goal_version,
      ),
    );
    return structuredClone(next);
  }

  /**
   * Mark previous as superseded and create a replacement goal (new id or same lineage id+version).
   */
  supersede(
    previousId: string,
    replacement: CreateGoalInput,
    options: TransitionOptions,
  ): { previous: GoalContract; next: GoalContract } {
    const previous = this.transition(previousId, "superseded", options);
    const next = this.create({
      ...replacement,
      parent_goal_id: replacement.parent_goal_id ?? previous.metadata.parent_goal_id,
      lifecycle_state: replacement.lifecycle_state ?? "proposed",
      goal_version: replacement.goal_version ?? {
        major: previous.spec.goal_version.major,
        minor: previous.spec.goal_version.minor + 1,
        patch: 0,
        revision: 1,
      },
    });
    return { previous, next };
  }

  get(goalId: string): GoalContract | undefined {
    const g = this.goals.get(goalId);
    return g ? structuredClone(g) : undefined;
  }

  list(): GoalContract[] {
    return [...this.goals.values()].map((g) => structuredClone(g));
  }

  listActive(): GoalContract[] {
    return this.list().filter((g) =>
      (AGENCY_ACTIONABLE_STATES as readonly string[]).includes(g.spec.lifecycle_state),
    );
  }

  portfolio(portfolioId: string, priorities?: Record<string, number>): GoalPortfolio {
    return {
      portfolio_id: portfolioId,
      goals: this.list(),
      priorities,
    };
  }

  mutationHistory(goalId?: string): GoalTransition[] {
    const rows = goalId ? this.history.filter((h) => h.goal_id === goalId) : this.history;
    return rows.map((r) => structuredClone(r));
  }

  /**
   * Explicitly forbidden. Goals must be abandoned / cancelled / superseded — never deleted silently.
   */
  delete(goalId?: string): never {
    throw new SilentDeleteForbiddenError(goalId);
  }

  private require(goalId: string): GoalContract {
    const g = this.goals.get(goalId);
    if (!g) throw new GoalNotFoundError(goalId);
    return g;
  }
}
