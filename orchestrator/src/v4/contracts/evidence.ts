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
  scanForSecrets,
  validateWith,
  type ValidationResult,
} from "./common.js";
import { VERIFICATION_METHOD_KINDS, type VerificationMethodKind } from "./goal-contract.js";
import { FORBIDDEN_SELF_TRUST_FIELDS, rejectForbiddenFields } from "./field-class.js";

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

/** Subjects whose independence judgement requires a named subject executor (INV-EVD-01). */
export const EVIDENCE_SUBJECTS_REQUIRING_EXECUTOR: readonly EvidenceSubjectKind[] = ["CRITERION", "TASK", "EXECUTION"];

/**
 * Independence rule (ADR-V4-0009): evidence is independent iff it was not produced by the
 * executor under judgement and its method is not SELF_REPORTED. Executor identity is compared
 * by executor_id (version changes do not create independence).
 *
 * Fail closed: a missing `subject_executor_ref` is **not** independent. Omitting the subject
 * must not open a path to PROVEN.
 */
export function isIndependent(e: Pick<Evidence, "method" | "produced_by" | "subject_executor_ref" | "provenance">): boolean {
  if (e.method.kind === "SELF_REPORTED" || e.provenance === "SELF_REPORTED") return false;
  const subjectId = e.subject_executor_ref?.executor_id;
  const producerId = e.produced_by?.executor_id;
  if (!subjectId || !producerId) return false;
  return subjectId !== producerId;
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
    const requiresSubjectExecutor =
      subjectKind === undefined || (EVIDENCE_SUBJECTS_REQUIRING_EXECUTOR as readonly string[]).includes(subjectKind);
    c.executorRef("subject_executor_ref", { optional: true });
    if (requiresSubjectExecutor && c.get("subject_executor_ref") === undefined) {
      c.fail(
        "INV-EVD-01",
        "subject_executor_ref",
        "CRITERION/TASK/EXECUTION evidence must name the subject executor; omitting it cannot qualify as independent",
      );
    }
    c.each("tested_artifacts", (cc) => {
      cc.ensure(isSha256(cc.get("sha256")), "INV-EVD-03", "sha256", "tested artifacts must be hash-identified");
    });
    c.nested("environment", (cc) => cc.string("runtime"));
    const provenance = c.oneOf("provenance", PROVENANCE_KINDS);
    c.timestamp("observed_at");
    c.timestamp("valid_until", { optional: true });
    const limitations = c.stringArray("limitations");
    if (limitations) {
      c.ensure(limitations.length > 0, "INV-EVD-02", "limitations", "evidence must state what it does not prove");
    }
    if (methodKind === "SELF_REPORTED") {
      c.ensure(provenance === "SELF_REPORTED", "INV-EVD-01", "provenance", "SELF_REPORTED method implies SELF_REPORTED provenance");
    }
    rejectForbiddenFields(
      c,
      FORBIDDEN_SELF_TRUST_FIELDS,
      "INV-EVD-04",
      (field) => `self-asserted trust field "${field}" is forbidden; trust is derived from the authenticated channel (TM-V4-F09)`,
    );
    for (const f of scanForSecrets(c.value())) {
      c.fail("INV-EVD-05", f.path, `possible secret material (${f.reason}); evidence must not carry secrets (TM-V4-F11)`);
    }
  });
}
