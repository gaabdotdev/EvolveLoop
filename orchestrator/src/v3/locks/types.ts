/**
 * Work locks + fencing — best-effort mutual exclusion, NOT exactly-once.
 */

export type LockScope = "work" | "task" | "domain";

export interface WorkLock {
  kind: "WorkLock";
  lock_id: string;
  work_id: string;
  scope: LockScope;
  /** Optional task or domain key when scope ≠ work. */
  resource_key?: string;
  holder_agent_id: string;
  fencing_token: number;
  acquired_at: string;
  expires_at: string;
  renewed_at?: string;
  released_at?: string;
  status: "held" | "released" | "expired";
}

export interface LockAcquireResult {
  kind: "LockAcquireResult";
  status: "acquired" | "denied" | "conflict";
  lock?: WorkLock;
  reason?: string;
  limitations: string[];
}

export interface FencingCheckResult {
  allowed: boolean;
  reason: string;
  expected_token?: number;
  provided_token?: number;
}
