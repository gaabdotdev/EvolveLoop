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
  SANDBOX_ATTESTATION_ENV,
  type AgencyRunReport,
  type AgencyRunEntry,
  type AgencyOracleEntry,
  type AgencyContainmentEntry,
  type AgencyRuntimeOptions,
  type HumanGateRecord,
} from "./agency-runtime.js";
