/**
 * V3 adapters barrel — runtime integration.
 * Bridge symbols remain on agency/ + fabric/ barrels to avoid export clashes.
 * OutcomeStatus lives in failure/ (imported by agency-runtime; not re-exported here).
 */
export {
  AgencyRuntime,
  runAgencyRuntime,
  requiresSandboxAttestation,
  hasSandboxAttestation,
  inferEffectHints,
  requiredDepthForProposal,
  hasDestructiveEffectHint,
  allowsDestructiveWithoutOsSandbox,
  isDestructiveDeniedWithoutOsSandbox,
  SANDBOX_ATTESTATION_ENV,
  ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV,
  DESTRUCTIVE_DENIED_REASON,
  type AgencyRunReport,
  type AgencyRunEntry,
  type AgencyOracleEntry,
  type AgencyContainmentEntry,
  type AgencyRecoveryReport,
  type AgencyRecoveryHistoryEntry,
  type AgencyRuntimeOptions,
  type HumanGateRecord,
  type RecoveryTrigger,
} from "./agency-runtime.js";
