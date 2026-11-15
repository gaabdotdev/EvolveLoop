/**
 * M10 Policy foundations — public surface.
 * Consumers depend on PolicyDecisionPort (contracts/ports.ts), not this barrel,
 * except M19 wiring and tests.
 */

export { DenyByDefaultPolicyEngine, InMemoryWorkContext, InvalidPolicyRequest } from "./engine.js";
export type { WorkContextPort, DenyByDefaultEngineOptions } from "./engine.js";
export { PolicyStore, PolicyLoadError } from "./store.js";
export { GrantRegistry } from "./grants.js";
export { ApprovalRegistry, rejectSelfApproval } from "./approvals.js";
export { InMemoryOperatorAuthn, POLICY_ENGINE_PRINCIPAL, requestAssertsCallerIdentity } from "./authn.js";
export type { OperatorAuthnPort } from "./authn.js";
export {
  allowRuleHasWildcard,
  canonicalizeResource,
  resourceMatches,
  ruleMatches,
} from "./match.js";
export { effectiveAutonomy, applyAutonomyOverlay } from "./autonomy.js";
export { newGrantId, newApprovalId, newPolicyDecisionId, isLocalGrantId, isLocalApprovalId } from "./ids.js";
export {
  readDecidedBy,
  principalToActor,
  isWriteAction,
  isSensitiveAction,
  minAutonomy,
  WRITE_ACTIONS,
  SENSITIVE_ACTIONS,
} from "./types.js";
export type {
  AuditedPolicyDecision,
  AuthenticatedPrincipal,
  Grant,
  Approval,
  WorkPolicyContext,
  Clock,
  ConsumeResult,
  ApprovalDecisionResult,
  PolicyEventSink,
} from "./types.js";
