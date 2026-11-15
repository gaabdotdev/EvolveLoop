/**
 * Policy v1 + PolicyDecision v1 — deny-by-default authorization (constitution §4.10, §9; ADR-V4-0011).
 * Producer: M10. The policy *language* is deferred (ADR-V4-0011); this is the language-neutral
 * decision contract every Policy Decision Point implementation must honour.
 */

import { type ContractHeader, type ExecutorRef, type IsoTimestamp, validateWith, type ValidationResult } from "./common.js";
import { AUTONOMY_LEVELS, type AutonomyLevel } from "./goal-contract.js";

export const POLICY_SCHEMA_VERSION = "1.0.0";
export const POLICY_DECISION_SCHEMA_VERSION = "1.0.0";

/** Upper bound on cached decision validity; revocation latency is bounded by this (ADR-V4-0011). */
export const MAX_DECISION_TTL_MS = 5 * 60 * 1000;

export type PolicyEffect = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
export const POLICY_EFFECTS: readonly PolicyEffect[] = ["ALLOW", "DENY", "REQUIRE_APPROVAL"];

export type RiskLevel = "low" | "medium" | "high" | "critical";
export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high", "critical"];

/** What a policy change does to work in flight (constitution §9.4). */
export type PolicyChangeSemantics = "APPLY_TO_NEW_ACTIONS" | "REEVALUATE_IN_FLIGHT" | "INTERRUPT_IN_FLIGHT";

export interface PolicyRule {
  rule_id: string;
  effect: PolicyEffect;
  /** Executor selectors: executor ids or labels (e.g. "label:trusted-internal"). */
  subjects: string[];
  /** Action vocabulary; V3.5 CapabilityAction names are valid actions (ADR-V4-0002). */
  actions: string[];
  /** Resource patterns (glob-like); interpretation fixed by the chosen language (ADR-V4-0011). */
  resources: string[];
  conditions?: {
    environments?: string[];
    max_risk?: RiskLevel;
    max_cost?: { currency: string; amount: number };
    valid_from?: IsoTimestamp;
    valid_until?: IsoTimestamp;
  };
  obligations?: string[];
}

export interface Policy extends ContractHeader<"Policy"> {
  policy_id: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  /** Constant: anything not explicitly allowed is denied (INV-POL-01). */
  default_effect: "DENY";
  autonomy_ceiling: AutonomyLevel;
  rules: PolicyRule[];
  change_semantics: PolicyChangeSemantics;
  /** Monotonic; bumped on any change or revocation so cached decisions can be invalidated. */
  epoch: number;
  created_at: IsoTimestamp;
  revoked_at?: IsoTimestamp;
}

export interface PolicyDecisionRequest {
  work_id: string;
  task_id?: string;
  subject: ExecutorRef;
  action: string;
  resource: string;
  environment: string;
  risk: RiskLevel;
}

export interface PolicyDecision extends ContractHeader<"PolicyDecision"> {
  decision_id: string;
  request: PolicyDecisionRequest;
  decision: PolicyEffect;
  policy_ref: { policy_id: string; version: number; epoch: number };
  matched_rule_ids: string[];
  reason: string;
  obligations: string[];
  decided_at: IsoTimestamp;
  valid_until: IsoTimestamp;
}

/**
 * Normative combination rule: DENY > REQUIRE_APPROVAL > ALLOW; no match ⇒ DENY (INV-POL-01/03).
 */
export function combineRuleEffects(matched: readonly PolicyEffect[]): PolicyEffect {
  if (matched.length === 0) return "DENY";
  if (matched.includes("DENY")) return "DENY";
  if (matched.includes("REQUIRE_APPROVAL")) return "REQUIRE_APPROVAL";
  return "ALLOW";
}

/** Autonomy gate: L0 forbids write effects regardless of rules (constitution §4.10). */
export function autonomyPermitsWrite(level: AutonomyLevel): boolean {
  return level !== "L0_OBSERVE";
}

export function validatePolicy(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Policy");
    c.id("policy_id", "policy");
    c.integer("version", 1);
    c.oneOf("status", ["DRAFT", "ACTIVE", "RETIRED"] as const);
    c.ensure(c.get("default_effect") === "DENY", "INV-POL-01", "default_effect", 'default_effect must be "DENY"');
    const ceiling = c.oneOf("autonomy_ceiling", AUTONOMY_LEVELS);
    c.each("rules", (cc) => {
      cc.string("rule_id");
      cc.oneOf("effect", POLICY_EFFECTS);
      const subjects = cc.stringArray("subjects", { minLength: 1 });
      const actions = cc.stringArray("actions", { minLength: 1 });
      cc.stringArray("resources", { minLength: 1 });
      if (cc.get("effect") === "ALLOW") {
        cc.ensure(!(subjects ?? []).includes("*") || !(actions ?? []).includes("*"), "INV-POL-04", "subjects", "ALLOW * for * violates least privilege");
      }
    });
    c.oneOf("change_semantics", ["APPLY_TO_NEW_ACTIONS", "REEVALUATE_IN_FLIGHT", "INTERRUPT_IN_FLIGHT"] as const);
    c.integer("epoch", 0);
    c.timestamp("created_at");
    c.timestamp("revoked_at", { optional: true });
    if (ceiling === "L3_AUTONOMOUS") {
      const rules = (c.get("rules") as PolicyRule[] | undefined) ?? [];
      c.ensure(
        rules.filter((r) => r?.effect === "ALLOW").every((r) => r.conditions?.max_cost !== undefined && r.conditions?.valid_until !== undefined),
        "INV-POL-05",
        "rules",
        "L3 ALLOW rules must carry explicit cost and time limits",
      );
    }
  });
}

export function validatePolicyDecision(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("PolicyDecision");
    c.id("decision_id", "policy_decision");
    c.nested("request", (cc) => {
      cc.id("work_id", "work");
      cc.id("task_id", "task", { optional: true });
      cc.executorRef("subject");
      cc.string("action");
      cc.string("resource");
      cc.string("environment");
      cc.oneOf("risk", RISK_LEVELS);
    });
    const decision = c.oneOf("decision", POLICY_EFFECTS);
    c.nested("policy_ref", (cc) => {
      cc.id("policy_id", "policy");
      cc.integer("version", 1);
      cc.integer("epoch", 0);
    });
    const matched = c.stringArray("matched_rule_ids");
    c.string("reason");
    c.stringArray("obligations");
    const decided = c.timestamp("decided_at");
    const until = c.timestamp("valid_until");
    if (decided && until) {
      const ttl = Date.parse(until) - Date.parse(decided);
      c.ensure(ttl > 0 && ttl <= MAX_DECISION_TTL_MS, "INV-POL-02", "valid_until", `decision validity must be in (0, ${MAX_DECISION_TTL_MS}] ms`);
    }
    if (decision && decision !== "DENY") {
      c.ensure((matched?.length ?? 0) > 0, "INV-POL-03", "matched_rule_ids", "non-DENY decision must cite the rule(s) that allowed it");
    }
  });
}
