/**
 * V5-M05 — Human Governance domain types (policy, budget, audit).
 * Fail-closed: deny / exceed → block; never invent allow.
 */

export type GovernancePolicyScope = "workspace" | "work";

export type LifecycleControlAction = "pause" | "resume" | "cancel";

/** Minimal policy document (JSON) — deny tools / lifecycle / require approvals. */
export interface PolicyDocument {
  kind: "PolicyDocument";
  policy_id: string;
  scope: GovernancePolicyScope;
  /** Required when scope=work. */
  work_id?: string;
  /** Tools explicitly denied even if assigned (M04 overlay). */
  deny_tool_ids: string[];
  /** Lifecycle controls forbidden by policy (thin wrapper over REMED run-controls). */
  deny_lifecycle_actions: LifecycleControlAction[];
  /** When true, tool invokes require an APPROVED ApprovalRequest. */
  require_approval_for_tools: boolean;
  /** Optional human-readable notes. */
  notes: string[];
  updated_at: string;
  version: number;
}

/** @deprecated alias — prefer PolicyDocument */
export type GovernancePolicyDocument = PolicyDocument;

export interface PolicyStoreSnapshot {
  kind: "PolicyStore";
  version: number;
  updated_at: string;
  /** At most one workspace policy. */
  workspace?: PolicyDocument;
  /** Policies keyed by work_id. */
  works: Record<string, PolicyDocument>;
  limitations: string[];
}

/** @deprecated alias — prefer PolicyStoreSnapshot */
export type GovernancePolicyStoreSnapshot = PolicyStoreSnapshot;

/** Action checked by PolicyStore.checkPolicy. */
export type PolicyAction =
  | {
      type: "tool_use";
      tool_id: string;
      work_id?: string;
      agent_id?: string;
      attempt_id?: string;
    }
  | {
      type: "lifecycle";
      control: LifecycleControlAction;
      work_id?: string;
      agent_id?: string;
    };

export type PolicyCheckVerdict = "allow" | "deny";

export interface PolicyCheckResult {
  kind: "PolicyCheckResult";
  action: PolicyAction;
  verdict: PolicyCheckVerdict;
  allowed: boolean;
  reasons: string[];
  checked_at: string;
}

/** Budget limit record — tokens and/or attempts; fail-closed when exceeded. */
export interface BudgetLimitRecord {
  kind: "BudgetLimitRecord";
  scope: GovernancePolicyScope;
  work_id?: string;
  agent_id?: string;
  max_tokens?: number;
  max_attempts?: number;
  consumed_tokens: number;
  consumed_attempts: number;
  updated_at: string;
}

export type BudgetCheckVerdict = "ok" | "exceeded" | "unmeasured";

export interface BudgetCheckResult {
  kind: "BudgetCheckResult";
  verdict: BudgetCheckVerdict;
  record: BudgetLimitRecord;
  reasons: string[];
  checked_at: string;
  /** True when any configured limit is breached or unmeasured (fail-closed). */
  fail_closed_block: boolean;
}

export type GovernanceAuditKind =
  | "policy_upsert"
  | "policy_deny_tool"
  | "policy_deny_lifecycle"
  | "budget_record"
  | "budget_exceeded"
  | "approval_bridge"
  | "lifecycle_note"
  | "tool_authorize"
  | "other";

export interface AuditEntry {
  kind: "GovernanceAuditEvent";
  event_id: string;
  ts: string;
  work_id?: string;
  attempt_id?: string;
  agent_id?: string;
  audit_kind: GovernanceAuditKind;
  message: string;
  payload?: Record<string, unknown>;
}

/** @deprecated alias — prefer AuditEntry */
export type GovernanceAuditEvent = AuditEntry;
