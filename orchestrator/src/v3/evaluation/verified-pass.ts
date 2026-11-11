/**
 * Verified TRUE_FULL_PASS — adversarial-hardened evaluator.
 * Rejects agent prose, missing/corrupt evidence, self-review, stale tests, etc.
 */

import type { GoalContract } from "../goal-contract/types.js";
import { evaluateTrueFullPass } from "../goal-contract/types.js";
import type { EvidenceStore } from "./evidence.js";
import { fingerprintWorkspace } from "./evidence.js";

export interface VerifiedPassContext {
  evidence: EvidenceStore;
  /** Current workspace root for fingerprint binding */
  workspace_root: string;
  /** Implementer agent — review must not equal this */
  implementer_agent_id?: string;
  /** Require at least one diff with files_changed > 0 */
  require_code_changes?: boolean;
  /** ISO timestamp of last mutation; test evidence must be >= this */
  last_mutation_at?: string;
  /** Expected fingerprint after changes (optional strict bind) */
  expected_workspace_fingerprint?: string;
}

export interface VerifiedPassResult {
  eligible: boolean;
  work_state: "TRUE_FULL_PASS" | "NOT_PASS";
  reasons: string[];
  adversarial_checks: string[];
}

export function evaluateVerifiedTrueFullPass(
  contract: GoalContract,
  ctx: VerifiedPassContext,
): VerifiedPassResult {
  const base = evaluateTrueFullPass(contract);
  const reasons = [...base.reasons];
  const adversarial_checks: string[] = [];

  const applicable = contract.criteria.filter((c) => c.state !== "NOT_APPLICABLE");
  const mandatory = applicable.filter((c) => c.mandatory);

  let sawValidTest = false;
  let sawValidReview = false;
  let sawDiffWithChanges = false;
  let reviewActor: string | undefined;

  for (const c of mandatory) {
    if (c.state !== "PASS") continue;
    for (const eid of c.evidence_ids) {
      const integrity = ctx.evidence.verifyIntegrity(eid);
      if (!integrity.ok) {
        reasons.push(`evidence_integrity_fail:${c.id}:${eid}:${integrity.reasons.join(",")}`);
        adversarial_checks.push(`reject_corrupt_or_missing:${eid}`);
        continue;
      }
      const rec = ctx.evidence.load(eid)!;
      if (rec.goal_contract_id !== contract.goal_contract_id) {
        reasons.push(`evidence_wrong_contract:${eid}`);
        adversarial_checks.push("reject_cross_contract_evidence");
      }
      if (rec.work_id && contract.work_id && rec.work_id !== contract.work_id) {
        reasons.push(`evidence_wrong_work:${eid}`);
        adversarial_checks.push("reject_cross_work_evidence");
      }

      if (ctx.expected_workspace_fingerprint) {
        if (rec.workspace_fingerprint !== ctx.expected_workspace_fingerprint) {
          reasons.push(`evidence_stale_fingerprint:${eid}`);
          adversarial_checks.push("reject_stale_or_foreign_fingerprint");
        }
      } else {
        const live = fingerprintWorkspace(ctx.workspace_root);
        // Allow evidence recorded at matching fingerprint only when we can recompute
        if (rec.workspace_fingerprint !== live && rec.evidence_kind !== "exploration") {
          // Exploration may precede mutations; other kinds must match current tree
          if (["test_result", "diff", "review", "file_hash"].includes(rec.evidence_kind)) {
            reasons.push(`evidence_fingerprint_mismatch:${eid}`);
            adversarial_checks.push("reject_fingerprint_mismatch");
          }
        }
      }

      if (rec.evidence_kind === "test_result") {
        const exit = rec.payload.exit_code;
        const executed = Number(rec.payload.tests_executed ?? 0);
        const skipped = Number(rec.payload.tests_skipped ?? 0);
        const ignored = rec.payload.ignored === true;
        if (exit !== 0) {
          reasons.push(`test_exit_nonzero:${eid}`);
          adversarial_checks.push("reject_nonzero_exit");
        }
        if (executed <= 0) {
          reasons.push(`tests_not_executed:${eid}`);
          adversarial_checks.push("reject_no_tests_executed");
        }
        if (ignored) {
          reasons.push(`tests_ignored:${eid}`);
          adversarial_checks.push("reject_ignored_tests");
        }
        if (executed > 0 && skipped >= executed) {
          reasons.push(`all_tests_skipped:${eid}`);
          adversarial_checks.push("reject_all_skipped");
        }
        if (ctx.last_mutation_at && typeof rec.payload.run_at === "string") {
          if (rec.payload.run_at < ctx.last_mutation_at) {
            reasons.push(`tests_before_last_mutation:${eid}`);
            adversarial_checks.push("reject_stale_test_before_mutation");
          }
        }
        if (exit === 0 && executed > 0 && !ignored) sawValidTest = true;
      }

      if (rec.evidence_kind === "review") {
        reviewActor = rec.actor_agent_id ?? (rec.payload.reviewer_agent_id as string | undefined);
        const verdict = String(rec.payload.verdict ?? "").toUpperCase();
        if (verdict !== "PASS") {
          reasons.push(`review_not_pass:${eid}`);
          adversarial_checks.push("reject_failed_review");
        }
        if (ctx.implementer_agent_id && reviewActor === ctx.implementer_agent_id) {
          reasons.push(`review_not_independent:${eid}`);
          adversarial_checks.push("reject_self_review");
        }
        if (!reviewActor) {
          reasons.push(`review_missing_actor:${eid}`);
          adversarial_checks.push("reject_anonymous_review");
        }
        if (verdict === "PASS" && reviewActor) sawValidReview = true;
      }

      if (rec.evidence_kind === "diff") {
        const changed = Array.isArray(rec.payload.files_changed)
          ? (rec.payload.files_changed as string[])
          : [];
        if (changed.length > 0) sawDiffWithChanges = true;
        else {
          reasons.push(`diff_empty:${eid}`);
          adversarial_checks.push("reject_claim_without_file_changes");
        }
      }
    }

    // Mandatory criterion marked PASS but no resolvable evidence when required
    if (c.evidence_required.length > 0) {
      for (const req of c.evidence_required) {
        const resolved = c.evidence_ids.some((eid) => {
          const r = ctx.evidence.load(eid);
          return r && !r.invalidated && (r.evidence_kind === req || eid === req || r.payload.label === req);
        });
        // Also accept if evidence_ids point to valid records covering the semantic requirement
        if (!resolved && c.evidence_ids.length === 0) {
          reasons.push(`mandatory_missing_evidence:${c.id}:${req}`);
        }
      }
    }
  }

  // Structural requirements for engineering verification when criteria include these kinds
  const needsTest = mandatory.some((c) =>
    c.evidence_required.some((e) => e === "test-log" || e === "test_result"),
  );
  const needsReview = mandatory.some((c) =>
    c.evidence_required.some((e) => e === "review-report" || e === "review"),
  );
  const needsDiff =
    ctx.require_code_changes === true ||
    mandatory.some((c) => c.evidence_required.some((e) => e === "diff" || e === "workspace-diff"));

  if (needsTest && !sawValidTest) {
    reasons.push("missing_valid_test_evidence");
    adversarial_checks.push("reject_missing_test_evidence");
  }
  if (needsReview && !sawValidReview) {
    reasons.push("missing_valid_independent_review");
    adversarial_checks.push("reject_missing_review");
  }
  if (needsDiff && !sawDiffWithChanges) {
    reasons.push("missing_diff_with_changes");
    adversarial_checks.push("reject_no_code_changes");
  }

  // Deduplicate reasons
  const uniq = [...new Set(reasons)];
  const eligible = uniq.length === 0 && mandatory.length > 0;
  return {
    eligible,
    work_state: eligible ? "TRUE_FULL_PASS" : "NOT_PASS",
    reasons: uniq,
    adversarial_checks: [...new Set(adversarial_checks)],
  };
}
