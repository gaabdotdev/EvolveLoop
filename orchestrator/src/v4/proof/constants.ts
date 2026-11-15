/**
 * M06 WorkProof-min constants. Not a frozen contract — engine identity only.
 * Contract schemas live in `../contracts/` (M00).
 */

export const PROOF_ENGINE_VERSION = "1.0.0";
export const PROOF_BUILDER_ID = "v4-m06-workproof-builder";

/** Default independent deterministic verifier identity (must be a valid executor id). */
export const DEFAULT_DETERMINISTIC_VERIFIER_ID = "executor_v4detmin1";

export const TEST_REPORT_KIND = "DeterministicTestReport";
export const TEST_REPORT_SCHEMA_VERSION = "1.0.0";
export const TEST_REPORT_MEDIA_TYPE = "application/vnd.evolveloop.deterministic-test-report+json";

export const ARTIFACT_INTEGRITY_EVIDENCE_KIND = "artifact_integrity";
export const UNIT_TEST_EVIDENCE_KIND = "unit_test";
