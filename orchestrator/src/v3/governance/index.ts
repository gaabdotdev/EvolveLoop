/**
 * V5-M05 — Human Governance (PolicyStore, BudgetGuard, AuditLog, approvals bridge).
 * Capability honesty: deny / exceed → block (ADR-005).
 */

export type {
  GovernancePolicyScope,
  LifecycleControlAction,
  PolicyDocument,
  GovernancePolicyDocument,
  PolicyStoreSnapshot,
  GovernancePolicyStoreSnapshot,
  PolicyAction,
  PolicyCheckVerdict,
  PolicyCheckResult,
  BudgetLimitRecord,
  BudgetCheckVerdict,
  BudgetCheckResult,
  GovernanceAuditKind,
  AuditEntry,
  GovernanceAuditEvent,
} from "./types.js";

export {
  PolicyStore,
  GovernancePolicyStore,
  PolicyStoreError,
  GovernancePolicyError,
  POLICY_PRECEDENCE,
  GOVERNANCE_POLICY_PRECEDENCE,
  type UpsertPolicyInput,
} from "./policy-store.js";

export {
  BudgetGuard,
  GovernanceBudgetStore,
  BudgetGuardError,
  GovernanceBudgetError,
  type BudgetStoreSnapshot,
} from "./budget-guard.js";

export { AuditLog, GovernanceAuditLog } from "./audit-log.js";

export {
  ApprovalWorkAttemptBridge,
  ApprovalGovernanceFacade,
  type ApprovalBridgeCreateInput,
} from "./approvals-bridge.js";

export {
  authorizeToolUnderPolicy,
  type GovernedToolAuthorizeInput,
} from "./tool-policy.js";

export {
  pauseOwnedRuns,
  resumeOwnedRuns,
  cancelOwnedRuns,
  registerOwnedProcessSession,
  pauseOwnedRunsUnderPolicy,
  resumeOwnedRunsUnderPolicy,
  cancelOwnedRunsUnderPolicy,
  LIFECYCLE_GOVERNANCE_NOTES,
  type RunControlAction,
  type RunControlOpts,
  type RunControlResult,
  type RunControlSessionResult,
  type PolicyGatedLifecycleResult,
} from "./lifecycle-controls.js";

import { join } from "node:path";
import { AuditLog } from "./audit-log.js";
import { BudgetGuard } from "./budget-guard.js";
import { PolicyStore } from "./policy-store.js";

/** Open Human Governance stores under `<dataDir>/governance`. */
export function openGovernance(rootDir: string): {
  policy: PolicyStore;
  budgets: BudgetGuard;
  audit: AuditLog;
  rootDir: string;
} {
  return {
    policy: new PolicyStore(rootDir),
    budgets: new BudgetGuard(rootDir),
    audit: new AuditLog(rootDir),
    rootDir,
  };
}

/** @deprecated alias — prefer openGovernance */
export function openHumanGovernance(rootDir: string): {
  policy: PolicyStore;
  budgets: BudgetGuard;
  audit: AuditLog;
  rootDir: string;
} {
  return openGovernance(rootDir);
}

export function governanceDirFromDataRoot(dataRoot: string): string {
  return join(dataRoot, "governance");
}
