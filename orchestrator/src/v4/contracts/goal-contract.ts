/**
 * Goal Contract v1 — intent, constraints, acceptance (constitution §4.2, §5).
 * Producer: M01 (Goal Compiler). Immutable per version; revisions supersede.
 * V3 predecessor: orchestrator/src/v3/goal-contract/types.ts (mapped by ADR-V4-0002).
 */

import { type ContractHeader, type IsoTimestamp, type ActorRef, validateWith, type ValidationResult } from "./common.js";

export const GOAL_CONTRACT_SCHEMA_VERSION = "1.0.0";

export type GoalContractStatus = "DRAFT" | "NEEDS_CLARIFICATION" | "ACCEPTED" | "SUPERSEDED" | "WITHDRAWN";
export const GOAL_CONTRACT_STATUSES: readonly GoalContractStatus[] = [
  "DRAFT",
  "NEEDS_CLARIFICATION",
  "ACCEPTED",
  "SUPERSEDED",
  "WITHDRAWN",
];

/** Autonomy vocabulary L0–L3 (constitution §4.10). Effective authority is decided by Policy, not by this field. */
export type AutonomyLevel = "L0_OBSERVE" | "L1_EXECUTE" | "L2_SUPERVISED" | "L3_AUTONOMOUS";
export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ["L0_OBSERVE", "L1_EXECUTE", "L2_SUPERVISED", "L3_AUTONOMOUS"];

/** Where a statement came from — makes invented criteria visible (constitution §4.2). */
export type StatementOrigin = "USER_STATED" | "DERIVED" | "ASSUMED";
export const STATEMENT_ORIGINS: readonly StatementOrigin[] = ["USER_STATED", "DERIVED", "ASSUMED"];

export type VerificationMethodKind =
  | "DETERMINISTIC_RULE"
  | "AUTOMATED_TEST"
  | "STATIC_ANALYSIS"
  | "INDEPENDENT_MODEL_REVIEW"
  | "HUMAN_REVIEW"
  | "OBSERVATION";
export const VERIFICATION_METHOD_KINDS: readonly VerificationMethodKind[] = [
  "DETERMINISTIC_RULE",
  "AUTOMATED_TEST",
  "STATIC_ANALYSIS",
  "INDEPENDENT_MODEL_REVIEW",
  "HUMAN_REVIEW",
  "OBSERVATION",
];

export interface AcceptanceCriterion {
  criterion_id: string;
  statement: string;
  mandatory: boolean;
  origin: StatementOrigin;
  /** Acceptable verification methods; SELF_REPORTED is never acceptable (ADR-V4-0009). */
  verification_methods: VerificationMethodKind[];
  /** Named evidence kinds that must exist before the criterion can be PROVEN. */
  evidence_required: string[];
}

export type ConstraintKind = "BUDGET" | "SECURITY" | "DEPLOYMENT" | "DEADLINE" | "DATA_RESIDENCY" | "SCOPE" | "OTHER";
export const CONSTRAINT_KINDS: readonly ConstraintKind[] = [
  "BUDGET",
  "SECURITY",
  "DEPLOYMENT",
  "DEADLINE",
  "DATA_RESIDENCY",
  "SCOPE",
  "OTHER",
];

export interface GoalConstraint {
  constraint_id: string;
  kind: ConstraintKind;
  statement: string;
  origin: StatementOrigin;
  value?: string | number | boolean;
}

export interface Assumption {
  assumption_id: string;
  statement: string;
  origin: Exclude<StatementOrigin, "USER_STATED">;
  confirmed_by_user: boolean;
}

export type AmbiguityStatus = "OPEN" | "RESOLVED" | "ASSUMED";
export const AMBIGUITY_STATUSES: readonly AmbiguityStatus[] = ["OPEN", "RESOLVED", "ASSUMED"];

export interface Ambiguity {
  ambiguity_id: string;
  question: string;
  status: AmbiguityStatus;
  resolution?: string;
  /** Required when status = ASSUMED: the visible assumption that resolves it. */
  assumption_id?: string;
  blocking: boolean;
}

export interface GoalContract extends ContractHeader<"GoalContract"> {
  goal_contract_id: string;
  version: number;
  supersedes_version?: number;
  work_id: string;
  status: GoalContractStatus;
  objective: string;
  scope: string[];
  out_of_scope: string[];
  constraints: GoalConstraint[];
  acceptance_criteria: AcceptanceCriterion[];
  assumptions: Assumption[];
  ambiguities: Ambiguity[];
  risks: string[];
  dependencies: string[];
  budget?: { currency: string; max_amount: number };
  deadline?: IsoTimestamp;
  execution: {
    autonomy: AutonomyLevel;
    verification: "INDEPENDENT" | "AUTOMATED_ONLY" | "HUMAN_REQUIRED";
    recovery_enabled: boolean;
  };
  stop_conditions: string[];
  created_at: IsoTimestamp;
  created_by: ActorRef;
}

export function validateGoalContract(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("GoalContract");
    c.id("goal_contract_id", "goal_contract");
    const version = c.integer("version", 1);
    const supersedes = c.integer("supersedes_version", 1, { optional: true });
    c.id("work_id", "work");
    const status = c.oneOf("status", GOAL_CONTRACT_STATUSES);
    c.string("objective");
    c.stringArray("scope");
    c.stringArray("out_of_scope");
    c.stringArray("risks");
    c.stringArray("dependencies");
    c.stringArray("stop_conditions");
    c.timestamp("created_at");
    c.timestamp("deadline", { optional: true });

    if (version !== undefined && version > 1) {
      c.ensure(supersedes === version - 1, "INV-GC-05", "supersedes_version", "revision must supersede version - 1");
    }
    if (version === 1) {
      c.ensure(supersedes === undefined, "INV-GC-05", "supersedes_version", "version 1 cannot supersede anything");
    }

    const criterionIds = new Set<string>();
    c.each("acceptance_criteria", (cc) => {
      const id = cc.string("criterion_id");
      if (id) {
        c.ensure(!criterionIds.has(id), "INV-GC-04", "acceptance_criteria", `duplicate criterion_id ${id}`);
        criterionIds.add(id);
      }
      cc.string("statement");
      cc.boolean("mandatory");
      cc.oneOf("origin", STATEMENT_ORIGINS);
      const methods = cc.array("verification_methods", { minLength: 1 });
      if (methods) {
        cc.ensure(
          methods.every((m) => (VERIFICATION_METHOD_KINDS as readonly unknown[]).includes(m)),
          "INV-GC-06",
          "verification_methods",
          "only non-self verification methods are allowed",
        );
      }
      cc.stringArray("evidence_required");
    });

    c.each("constraints", (cc) => {
      cc.string("constraint_id");
      cc.oneOf("kind", CONSTRAINT_KINDS);
      cc.string("statement");
      cc.oneOf("origin", STATEMENT_ORIGINS);
    });

    const assumptionIds = new Set<string>();
    c.each("assumptions", (cc) => {
      const id = cc.string("assumption_id");
      if (id) assumptionIds.add(id);
      cc.string("statement");
      cc.oneOf("origin", ["DERIVED", "ASSUMED"] as const);
      cc.boolean("confirmed_by_user");
    });

    const ambiguities = (c.get("ambiguities") as Ambiguity[] | undefined) ?? [];
    c.each("ambiguities", (cc) => {
      cc.string("ambiguity_id");
      cc.string("question");
      const st = cc.oneOf("status", AMBIGUITY_STATUSES);
      cc.boolean("blocking");
      if (st === "ASSUMED") {
        const aid = cc.string("assumption_id");
        cc.ensure(
          aid !== undefined && assumptionIds.has(aid),
          "INV-GC-03",
          "assumption_id",
          "ASSUMED ambiguity must reference a visible assumption",
        );
      }
      if (st === "RESOLVED") cc.string("resolution");
    });

    c.nested("execution", (cc) => {
      cc.oneOf("autonomy", AUTONOMY_LEVELS);
      cc.oneOf("verification", ["INDEPENDENT", "AUTOMATED_ONLY", "HUMAN_REQUIRED"] as const);
      cc.boolean("recovery_enabled");
    });
    c.nested("created_by", (cc) => {
      cc.oneOf("kind", ["PLATFORM", "EXECUTOR", "HUMAN", "POLICY_ENGINE", "VERIFIER"] as const);
      cc.string("id");
    });

    if (status === "ACCEPTED") {
      const criteria = (c.get("acceptance_criteria") as AcceptanceCriterion[] | undefined) ?? [];
      c.ensure(
        criteria.some((x) => x?.mandatory === true),
        "INV-GC-02",
        "acceptance_criteria",
        "ACCEPTED contract needs at least one mandatory criterion",
      );
      c.ensure(
        !ambiguities.some((a) => a?.status === "OPEN" && a?.blocking === true),
        "INV-GC-03",
        "ambiguities",
        "ACCEPTED contract cannot have OPEN blocking ambiguities",
      );
    }
  });
}
