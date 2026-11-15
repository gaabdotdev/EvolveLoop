/**
 * Fair-baseline protocol pins (docs/v4/benchmarks/PROTOCOL.md).
 * Honesty flags stay false in this early cut.
 */

import type { CostRecord } from "../contracts/common.js";
import {
  CANONICAL_SUITE_ID,
  CANONICAL_SUITE_VERSION,
  HARNESS_ID,
  HARNESS_VERSION,
  QUALITY_PROOF_PROVENANCE,
  type QualityProofProvenance,
} from "./types.js";

export const PRODUCTION_SCORES_EXIST = false;
export const METHODOLOGY_ACCEPTED_BY_M17 = false;
export const BASELINE_MAY_DRIVE_L2_L3_ROUTING = false;

export const M08_PUBLISHED_METHODOLOGY_ID = "cprof-methodology.provisional.v0";
export const M08_PUBLISHED_METHODOLOGY_VERSION = "0.1.0";

export const CANONICAL_WORK_CATEGORY = "software.engineering";
export const CANONICAL_TASK_KIND = "verified_delivery";
export const CANONICAL_ENVIRONMENT_CLASS = "local-first";

export const CANONICAL_CASE_IDS = ["FBC-SE-01", "FBC-SE-02", "FBC-SE-03"] as const;

export function isQualityProofProvenance(kind: unknown): kind is QualityProofProvenance {
  return typeof kind === "string" && (QUALITY_PROOF_PROVENANCE as readonly string[]).includes(kind);
}

export function costMayProveQuality(cost: CostRecord): boolean {
  return cost.amount !== null && isQualityProofProvenance(cost.provenance);
}

export function canonicalSuiteIdentity(): { suite_id: string; suite_version: string } {
  return { suite_id: CANONICAL_SUITE_ID, suite_version: CANONICAL_SUITE_VERSION };
}

export function canonicalHarnessIdentity(): { harness_id: string; harness_version: string } {
  return { harness_id: HARNESS_ID, harness_version: HARNESS_VERSION };
}
