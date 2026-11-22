/**
 * Persistent human-in-the-loop approval requests.
 * An approval authorizes only the exact operation, resource, and validity window.
 */

import type { CapabilityAction } from "../security/types.js";

export type ApprovalState =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export interface ApprovalDecisionRecord {
  at: string;
  actor: string;
  from_state: ApprovalState;
  to_state: ApprovalState;
  note?: string;
}

export interface ApprovalRequest {
  kind: "ApprovalRequest";
  approval_id: string;
  work_id: string;
  goal_id?: string;
  task_id?: string;
  agent_id?: string;
  /** V5-M05 — bridge to domain Attempt when known (additive; optional). */
  attempt_id?: string;
  operation: CapabilityAction | string;
  resource: string;
  justification: string;
  risk: "low" | "medium" | "high" | "critical";
  impact: string;
  permissions_requested: string[];
  scope: {
    workspace?: string;
    path_prefix?: string;
    hosts?: string[];
    max_uses: number;
  };
  expires_at: string;
  state: ApprovalState;
  decided_by?: string;
  uses_remaining: number;
  history: ApprovalDecisionRecord[];
  created_at: string;
  updated_at: string;
  /** Test-only provider marker — never treat as production grant source. */
  test_provider?: boolean;
}

export interface ApprovalCreateInput {
  work_id: string;
  goal_id?: string;
  task_id?: string;
  agent_id?: string;
  /** V5-M05 — optional Attempt binding for Work/Attempt governance bridge. */
  attempt_id?: string;
  operation: CapabilityAction | string;
  resource: string;
  justification: string;
  risk?: ApprovalRequest["risk"];
  impact?: string;
  permissions_requested?: string[];
  scope?: Partial<ApprovalRequest["scope"]>;
  ttl_ms?: number;
  test_provider?: boolean;
}
