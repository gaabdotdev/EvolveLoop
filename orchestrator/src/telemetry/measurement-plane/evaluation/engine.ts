import { createHash } from "node:crypto";
import { createMeasurementEvent } from "../envelope.js";
import type {
  BenchmarkCaseManifest,
  CriterionState,
  EvaluationResult,
  MeasurementEvent,
} from "../types.js";

export interface ArtifactEvidence {
  evidence_id: string;
  criterion_id: string;
  kind: "hash" | "test" | "diff" | "log" | "declaration";
  content_hash?: string;
  workspace_fingerprint?: string;
  expected_fingerprint?: string;
  exit_code?: number;
  tests_executed?: boolean;
  review_approved?: boolean;
  from_commit?: string;
  current_commit?: string;
  agent_declared_success?: boolean;
  files_changed?: number;
  produced_by?: "root" | "worker" | "unknown";
}

export interface EvaluateRunInput {
  run_id: string;
  caseManifest: Pick<BenchmarkCaseManifest, "case_id" | "acceptance_criteria">;
  evidences: ArtifactEvidence[];
  required_review?: boolean;
  blockers?: string[];
}

/**
 * Independent Evaluation Engine — does not trust agent self-declaration.
 * Integrates with TRUE_FULL_PASS semantics from V3 without replacing EvidenceStore.
 */
export function evaluateRun(input: EvaluateRunInput): {
  result: EvaluationResult;
  events: MeasurementEvent[];
} {
  const events: MeasurementEvent[] = [];
  const criteria: CriterionState[] = [];
  const fpChecks: EvaluationResult["false_positive_checks"] = [];

  events.push(
    createMeasurementEvent({
      event_name: "evaluation.started",
      source: { component: "measurement-plane", module: "evaluation" },
      correlation: { run_id: input.run_id, case_id: input.caseManifest.case_id },
      critical: true,
    }),
  );

  for (const c of input.caseManifest.acceptance_criteria) {
    const related = input.evidences.filter((e) => e.criterion_id === c.id);
    let state: CriterionState["state"] = "NOT_EVALUATED";
    let reason: string | undefined;

    if (!related.length) {
      state = "FAIL";
      reason = "no_evidence";
    } else {
      const invalid = related.find((e) => isInvalidEvidence(e));
      if (invalid) {
        state = "INVALID_EVIDENCE";
        reason = invalidReason(invalid);
        fpChecks.push({
          id: `fp-${c.id}-${invalid.evidence_id}`,
          rejected: true,
          reason: reason ?? "invalid_evidence",
        });
      } else if (related.every((e) => evidencePasses(e))) {
        state = "PASS";
      } else {
        state = "FAIL";
        reason = "evidence_failed_checks";
      }
    }

    if (input.blockers?.length && c.mandatory) {
      state = "BLOCKED";
      reason = input.blockers.join(",");
    }

    const criterion: CriterionState = {
      id: c.id,
      description: c.description,
      mandatory: c.mandatory,
      evaluator: c.evaluator,
      state,
      evidence_ids: related.map((e) => e.evidence_id),
      evaluated_at: new Date().toISOString(),
      reason,
    };
    criteria.push(criterion);

    events.push(
      createMeasurementEvent({
        event_name:
          state === "PASS"
            ? "criterion.passed"
            : state === "FAIL"
              ? "criterion.failed"
              : state === "BLOCKED"
                ? "criterion.blocked"
                : state === "INVALID_EVIDENCE"
                  ? "evidence.rejected"
                  : "criterion.evaluated",
        source: { component: "measurement-plane", module: "evaluation" },
        correlation: { run_id: input.run_id, case_id: input.caseManifest.case_id, artifact_id: related[0]?.evidence_id },
        attributes: { criterion_id: c.id, state, reason },
        critical: true,
      }),
    );
  }

  // Adversarial false-positive probes (always run)
  for (const ev of input.evidences) {
    if (ev.agent_declared_success && (ev.files_changed ?? 0) === 0) {
      fpChecks.push({
        id: `fp-no-file-change-${ev.evidence_id}`,
        rejected: true,
        reason: "declaration_without_file_change",
      });
    }
    if (ev.tests_executed === false && ev.kind === "test") {
      fpChecks.push({
        id: `fp-tests-not-run-${ev.evidence_id}`,
        rejected: true,
        reason: "tests_not_executed",
      });
    }
    if (ev.from_commit && ev.current_commit && ev.from_commit !== ev.current_commit) {
      fpChecks.push({
        id: `fp-stale-commit-${ev.evidence_id}`,
        rejected: true,
        reason: "evidence_from_other_commit",
      });
    }
    if (ev.produced_by === "worker" && input.required_review && ev.review_approved === false) {
      fpChecks.push({
        id: `fp-worker-self-review-${ev.evidence_id}`,
        rejected: true,
        reason: "review_missing_or_self_issued",
      });
    }
  }

  const mandatory = criteria.filter((c) => c.mandatory);
  const allMandatoryPass = mandatory.every((c) => c.state === "PASS");
  const anyInvalid = criteria.some((c) => c.state === "INVALID_EVIDENCE");
  const anyBlocked = criteria.some((c) => c.state === "BLOCKED");
  const testsOk = input.evidences.some((e) => e.kind === "test" && e.tests_executed && e.exit_code === 0);
  const reviewOk = !input.required_review || input.evidences.some((e) => e.review_approved === true);
  const fpRejected = fpChecks.some((f) => f.rejected);

  let true_full_pass = false;
  let true_full_pass_reason = "";
  if (!allMandatoryPass) true_full_pass_reason = "mandatory_criteria_not_all_pass";
  else if (anyInvalid) true_full_pass_reason = "invalid_evidence_present";
  else if (anyBlocked) true_full_pass_reason = "blockers_present";
  else if (!testsOk) true_full_pass_reason = "required_tests_not_verified";
  else if (!reviewOk) true_full_pass_reason = "required_review_missing";
  else if (fpRejected) true_full_pass_reason = "false_positive_checks_failed";
  else {
    true_full_pass = true;
    true_full_pass_reason = "all_mandatory_criteria_verified";
  }

  events.push(
    createMeasurementEvent({
      event_name: true_full_pass ? "true_full_pass.granted" : "true_full_pass.rejected",
      source: { component: "measurement-plane", module: "evaluation" },
      correlation: { run_id: input.run_id, case_id: input.caseManifest.case_id },
      attributes: { reason: true_full_pass_reason },
      critical: true,
    }),
  );
  events.push(
    createMeasurementEvent({
      event_name: "evaluation.completed",
      source: { component: "measurement-plane", module: "evaluation" },
      correlation: { run_id: input.run_id, case_id: input.caseManifest.case_id },
      attributes: { true_full_pass, reason: true_full_pass_reason },
      critical: true,
    }),
  );

  const evaluatedEvidence = input.evidences.length;
  const validEvidence = input.evidences.filter((e) => !isInvalidEvidence(e)).length;

  return {
    result: {
      run_id: input.run_id,
      case_id: input.caseManifest.case_id,
      criteria,
      true_full_pass,
      true_full_pass_reason,
      evidence_validity_rate: evaluatedEvidence ? validEvidence / evaluatedEvidence : null,
      false_positive_checks: fpChecks,
    },
    events,
  };
}

function isInvalidEvidence(e: ArtifactEvidence): boolean {
  if (e.kind === "declaration" && (e.files_changed ?? 0) === 0) return true;
  if (e.kind === "test" && e.tests_executed === false) return true;
  if (e.kind === "test" && e.exit_code !== undefined && e.exit_code !== 0) return true;
  if (e.expected_fingerprint && e.workspace_fingerprint && e.expected_fingerprint !== e.workspace_fingerprint) {
    return true;
  }
  if (e.from_commit && e.current_commit && e.from_commit !== e.current_commit) return true;
  if (e.content_hash && e.content_hash.length < 8) return true;
  return false;
}

function invalidReason(e: ArtifactEvidence): string {
  if (e.kind === "declaration" && (e.files_changed ?? 0) === 0) return "declaration_without_changes";
  if (e.kind === "test" && e.tests_executed === false) return "tests_not_executed";
  if (e.exit_code !== undefined && e.exit_code !== 0) return "nonzero_exit";
  if (e.from_commit && e.current_commit && e.from_commit !== e.current_commit) return "stale_commit";
  if (e.expected_fingerprint && e.workspace_fingerprint !== e.expected_fingerprint) return "hash_mismatch";
  return "invalid_evidence";
}

function evidencePasses(e: ArtifactEvidence): boolean {
  if (isInvalidEvidence(e)) return false;
  if (e.kind === "test") return e.tests_executed === true && e.exit_code === 0;
  if (e.kind === "hash") return !!e.content_hash && (!e.expected_fingerprint || e.workspace_fingerprint === e.expected_fingerprint);
  if (e.kind === "diff") return (e.files_changed ?? 0) > 0;
  if (e.kind === "log") return !!e.content_hash;
  return false;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
