import type { AutonomyLevel, Policy, PolicyDecisionRequest, PolicyRule } from "../../../src/v4/contracts/index.js";
import type { Clock, WorkPolicyContext } from "../../../src/v4/policy/types.js";

export const NOW_MS = Date.parse("2026-11-15T12:00:00.000Z");
export const NOW = "2026-11-15T12:00:00.000Z";
export const LATER = "2026-11-15T13:00:00.000Z";

export class FakeClock implements Clock {
  constructor(public ms = NOW_MS) {}
  now(): Date {
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

export function allowRule(over: Partial<PolicyRule> = {}): PolicyRule {
  return {
    rule_id: "rule_read_ws",
    effect: "ALLOW",
    subjects: ["executor_worker01"],
    actions: ["filesystem.read"],
    resources: ["/workspace/src/"],
    ...over,
  };
}

export function basePolicy(over: Partial<Policy> = {}): Policy {
  return {
    kind: "Policy",
    schema_version: "1.0.0",
    tenant_id: "local",
    policy_id: "pol_default0001",
    version: 1,
    status: "ACTIVE",
    default_effect: "DENY",
    autonomy_ceiling: "L2_SUPERVISED",
    rules: [],
    change_semantics: "REEVALUATE_IN_FLIGHT",
    epoch: 0,
    created_at: NOW,
    ...over,
  };
}

export function request(over: Partial<PolicyDecisionRequest> = {}): PolicyDecisionRequest {
  return {
    work_id: "work_abc123def",
    task_id: "task_abc123def",
    subject: { executor_id: "executor_worker01", executor_version: "1.0.0" },
    action: "filesystem.read",
    resource: "/workspace/src/app.ts",
    environment: "dev",
    risk: "low",
    ...over,
  };
}

export function workCtx(over: Partial<WorkPolicyContext> = {}): WorkPolicyContext {
  return {
    work_id: "work_abc123def",
    autonomy: "L1_EXECUTE" as AutonomyLevel,
    executor_labels: ["trusted-internal"],
    ...over,
  };
}
