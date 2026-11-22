/**
 * V5-M06 — Verification, Evidence & Delivery unification (extend M5; ADR-005).
 */

export type {
  CriterionEvidenceLink,
  CriterionEvaluationRow,
  WorkCriteriaEvaluation,
  IgnoredEvidenceReason,
  IgnoredEvidenceEntry,
  EvidenceProvenanceView,
  UnifiedEvidenceRead,
  DeliveryProjectionStatus,
  DeliveryProjection,
  VerifierImplementation,
  VerifierRecord,
  VerifierRegistrySnapshot,
  CustomVerifier,
  CustomVerifierHook,
  VerifierRunResult,
  DeliveryStatus,
  DeliveryEvidenceProvenance,
  DeliveryVerification,
} from "./types.js";

export {
  evaluateWorkCriteria,
  WorkCriteriaError,
} from "./criteria.js";

export {
  readWorkEvidenceProvenance,
  listIgnoredEvidenceForWork,
} from "./evidence-facade.js";

export {
  getWorkDelivery,
  projectDeliveryForWork,
  projectFromAgentClaim,
  toProjectionStatus,
  fromProjectionStatus,
  WorkDeliveryError,
} from "./delivery-projection.js";

export {
  VerifierRegistryStore,
  VerifierRegistryError,
  defaultVerifierSeed,
  NATIVE_LOCAL_COMMAND_ID,
  CUSTOM_VERIFIER_ID,
  NATIVE_TEST_RUNNER_ID,
  CUSTOM_HOOK_VERIFIER_ID,
} from "./verifier-registry.js";

import { join } from "node:path";
import { VerifierRegistryStore } from "./verifier-registry.js";

export function openVerification(rootDir: string): {
  verifiers: VerifierRegistryStore;
  rootDir: string;
} {
  return { verifiers: new VerifierRegistryStore(rootDir), rootDir };
}

export function verificationDirFromDataRoot(dataRoot: string): string {
  return join(dataRoot, "verification");
}
