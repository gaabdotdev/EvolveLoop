/**
 * Evidence v1 — proof item bound to a requirement/result (constitution §5, §8.2; ADR-V4-0009).
 * Producers: M06 verifiers (independent), executors (SELF_REPORTED, non-qualifying), M03 reconciliation.
 */

import {
  type ContractHeader,
  type ContentRef,
  type ExecutorRef,
  type IsoTimestamp,
  type V4ProvenanceKind,
  PROVENANCE_KINDS,
  isSha256,
  validateWith,
  type ValidationResult,
} from "./common.js";
import { VERIFICATION_METHOD_KINDS, type VerificationMethodKind } from "./goal-contract.js";

export const EVIDENCE_SCHEMA_VERSION = "1.0.0";

/** SELF_REPORTED exists so self-assessment is recorded explicitly — and never qualifies. */
export type EvidenceMethodKind = VerificationMethodKind | "SELF_REPORTED";
export const EVIDENCE_METHOD_KINDS: readonly EvidenceMethodKind[] = [...VERIFICATION_METHOD_KINDS, "SELF_REPORTED"];

export type EvidenceResult = "PASS" | "FAIL" | "INCONCLUSIVE" | "ERROR";
export const EVIDENCE_RESULTS: readonly EvidenceResult[] = ["PASS", "FAIL", "INCONCLUSIVE", "ERROR"];

export type EvidenceSubjectKind = "CRITERION" | "TASK" | "ARTIFACT" | "EFFECT" | "EXECUTION";

export interface Evidence extends ContractHeader<"Evidence"> {
  evidence_id: string;
  work_id: string;
  subject: { kind: EvidenceSubjectKind; ref: string };
  /** Required when subject.kind = CRITERION: exact goal-contract version (constitution §8.2). */
  criterion_ref?: { goal_contract_id: string; goal_contract_version: number; criterion_id: string };
  /** Named evidence kind matched against AcceptanceCriterion.evidence_required. */
  evidence_kind: string;
  method: { kind: EvidenceMethodKind; description: string; command?: string };
  result: EvidenceResult;
  /** Who produced the observation. */
  produced_by: ExecutorRef;
  /** Executor whose work is being judged; independence is computed against it (INV-EVD-01). */
  subject_executor_ref?: ExecutorRef;
  /** Artifacts examined, by content hash; evidence is stale if current artifacts differ. */
  tested_artifacts: ContentRef[];
  code_version?: { vcs: "git"; commit: string };
  environment: { runtime: string; os?: string; versions?: Record<string, string> };
  logs_ref?: ContentRef;
  provenance: V4ProvenanceKind;
  observed_at: IsoTimestamp;
  valid_until?: IsoTimestamp;
  /** What this evidence does NOT prove (constitution §8.2). At least one entry. */
  limitations: string[];
}

/**
 * Independence rule (ADR-V4-0009): evidence is independent iff it was not produced by the
 * executor under judgement and its method is not SELF_REPORTED. Executor identity is compared
 * by executor_id (version changes do not create independence).
 */
export function isIndependent(e: Pick<Evidence, "method" | "produced_by" | "subject_executor_ref" | "provenance">): boolean {
  if (e.method.kind === "SELF_REPORTED" || e.provenance === "SELF_REPORTED") return false;
  if (!e.subject_executor_ref) return true;
  return e.subject_executor_ref.executor_id !== e.produced_by.executor_id;
}

export function validateEvidence(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Evidence");
    c.id("evidence_id", "evidence");
    c.id("work_id", "work");
    let subjectKind: string | undefined;
    c.nested("subject", (cc) => {
      subjectKind = cc.oneOf("kind", ["CRITERION", "TASK", "ARTIFACT", "EFFECT", "EXECUTION"] as const);
      cc.string("ref");
    });
    c.nested(
      "criterion_ref",
      (cc) => {
        cc.id("goal_contract_id", "goal_contract");
        cc.integer("goal_contract_version", 1);
        cc.string("criterion_id");
      },
      { optional: subjectKind !== "CRITERION" },
    );
    c.string("evidence_kind");
    let methodKind: string | undefined;
    c.nested("method", (cc) => {
      methodKind = cc.oneOf("kind", EVIDENCE_METHOD_KINDS);
      cc.string("description");
    });
    c.oneOf("result", EVIDENCE_RESULTS);
    c.executorRef("produced_by");
    c.executorRef("subject_executor_ref", { optional: true });
    c.each("tested_artifacts", (cc) => {
      cc.ensure(isSha256(cc.get("sha256")), "INV-EVD-03", "sha256", "tested artifacts must be hash-identified");
    });
    c.nested("environment", (cc) => cc.string("runtime"));
    const provenance = c.oneOf("provenance", PROVENANCE_KINDS);
    c.timestamp("observed_at");
    c.timestamp("valid_until", { optional: true });
    c.stringArray("limitations", { minLength: 1 });
    if (methodKind === "SELF_REPORTED") {
      c.ensure(provenance === "SELF_REPORTED", "INV-EVD-01", "provenance", "SELF_REPORTED method implies SELF_REPORTED provenance");
    }
  });
}
