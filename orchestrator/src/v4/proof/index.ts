/**
 * M06 — WorkProof mínimo + independent verifier (V4.0).
 *
 * Import contracts only from `../contracts/`. This module implements
 * `VerifierPort` and `WorkProofPort`. Wiring to other metas is M19.
 */

export {
  AUTHZ_STANDING_LIMITATIONS,
  EMPTY_AUTHORIZATION_FOR_GAP_PREFIX,
  GENERATED_BY_EQUALS_SUBJECT_GAP,
  PROVENANCE_UNWIRED_LIMITATION,
  UNAUTHORIZED_EXTERNAL_GAP_PREFIX,
  applyProofCaps,
  assessExternalAuthorization,
  capProvenStatus,
  collectCiteableRefs,
  generatedByEqualsSubject,
  isCiteableAuthzRef,
  provenanceBackedEvidenceIds,
  refsFromLedgerPolicyDecided,
  requiresExternalAuthorization,
  type AuthzPorts,
  type EffectAuthzVerdict,
  type WorkAuthzAssessment,
} from "./authz.js";
export { WorkProofBuilder, type ProofSources, type WorkProofBuilderDeps } from "./builder.js";
export {
  DEFAULT_DETERMINISTIC_VERIFIER_ID,
  PROOF_BUILDER_ID,
  PROOF_ENGINE_VERSION,
  TEST_REPORT_KIND,
  TEST_REPORT_MEDIA_TYPE,
  TEST_REPORT_SCHEMA_VERSION,
  ARTIFACT_INTEGRITY_EVIDENCE_KIND,
  UNIT_TEST_EVIDENCE_KIND,
} from "./constants.js";
export {
  AmbiguousSubjectExecutor,
  GoalContractNotFound,
  ImmutableProofError,
  InvalidEvidenceError,
  ProofError,
  ProofValidationError,
  SelfVerificationRefused,
  VerifierIdentityError,
  WorkNotFound,
} from "./errors.js";
export { evidenceRecordedDraft, proofIssuedDraft, type EvidenceRecordedPayload, type ProofIssuedPayload } from "./events.js";
export { rejectProofPoison } from "./honesty-guards.js";
export { createRandomIdFactory, createSequenceIdFactory, type IdFactory } from "./ids.js";
export { assertIndependentVerifier, cannotQualify, requireExecutorId } from "./independence.js";
export { reassessProof, type Reassessment } from "./reassess.js";
export { MemoryEvidenceStore, MemoryProofStore, type EvidenceStore, type ProofStore } from "./stores.js";
export {
  encodeTestReport,
  evaluateTestReport,
  parseTestReport,
  type DeterministicTestReport,
  type TestReportParse,
} from "./test-report.js";
export { traceProof, type ProofLink, type ProofTrace } from "./trace.js";
export { DeterministicVerifier, type ArtifactContentPort, type DeterministicVerifierOptions } from "./verifier.js";
