/**
 * V2-QUAL-01 — Independent Review Gate.
 * When Goal Contract sets require_independent_review, TRUE_FULL_PASS / VERIFIED_PASS
 * are blocked until a review from a distinct agent_id and session_id is accepted.
 */

import { randomUUID } from "node:crypto";
import type { GoalContract } from "../goal-contract/types.js";

export type IndependentReviewVerdict = "PASS" | "FAIL" | "BLOCKED";

/** Pass promotions blocked without a valid independent review when the flag is set. */
export type IndependentReviewPassTarget = "TRUE_FULL_PASS" | "VERIFIED_PASS";

export interface SubmitReviewInput {
  executor_agent_id: string;
  executor_session_id: string;
  reviewer_agent_id: string;
  reviewer_session_id: string;
  verdict: IndependentReviewVerdict | string;
  work_id?: string;
  goal_contract_id?: string;
}

export interface IndependentReviewRecord {
  kind: "IndependentReview";
  review_id: string;
  executor_agent_id: string;
  executor_session_id: string;
  reviewer_agent_id: string;
  reviewer_session_id: string;
  verdict: IndependentReviewVerdict;
  work_id?: string;
  goal_contract_id?: string;
  independent: true;
  session_separated: true;
  submitted_at: string;
}

export class IndependentReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IndependentReviewError";
  }
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function normalizeVerdict(raw: string): IndependentReviewVerdict {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "PASS" || v === "FAIL" || v === "BLOCKED") return v;
  throw new IndependentReviewError(
    "INVALID_VERDICT",
    `verdict must be PASS|FAIL|BLOCKED (got: ${raw})`,
  );
}

function requireNonEmpty(value: string | undefined, code: string, label: string): string {
  const t = value?.trim();
  if (!t) {
    throw new IndependentReviewError(code, `${label} required`);
  }
  return t;
}

/** Read require_independent_review from a Goal Contract (default false). */
export function contractRequiresIndependentReview(contract: GoalContract): boolean {
  return contract.require_independent_review === true;
}

/**
 * Runtime gate: submitReview enforces distinct reviewer identity (agent + session).
 * Pass assertions consult accepted PASS reviews when the Goal Contract flag is set.
 */
export class IndependentReviewGate {
  private readonly reviews: IndependentReviewRecord[] = [];
  private require_independent_review: boolean;
  private readonly clock: () => Date;

  constructor(opts?: {
    require_independent_review?: boolean;
    clock?: () => Date;
    /** Seed from Goal Contract. */
    contract?: GoalContract;
  }) {
    this.clock = opts?.clock ?? (() => new Date());
    this.require_independent_review =
      opts?.require_independent_review ??
      (opts?.contract ? contractRequiresIndependentReview(opts.contract) : false);
  }

  isRequired(): boolean {
    return this.require_independent_review;
  }

  /** Bind / update flag from Goal Contract (or explicit override). */
  bindContract(contract: GoalContract): void {
    this.require_independent_review = contractRequiresIndependentReview(contract);
  }

  setRequired(required: boolean): void {
    this.require_independent_review = required;
  }

  /**
   * Accept an independent review. Rejects when reviewer shares agent_id or session_id
   * with the executor (self-review / same-session review).
   */
  submitReview(input: SubmitReviewInput): IndependentReviewRecord {
    const executor_agent_id = requireNonEmpty(
      input.executor_agent_id,
      "EXECUTOR_AGENT_REQUIRED",
      "executor_agent_id",
    );
    const executor_session_id = requireNonEmpty(
      input.executor_session_id,
      "EXECUTOR_SESSION_REQUIRED",
      "executor_session_id",
    );
    const reviewer_agent_id = requireNonEmpty(
      input.reviewer_agent_id,
      "REVIEWER_AGENT_REQUIRED",
      "reviewer_agent_id",
    );
    const reviewer_session_id = requireNonEmpty(
      input.reviewer_session_id,
      "REVIEWER_SESSION_REQUIRED",
      "reviewer_session_id",
    );
    const verdict = normalizeVerdict(String(input.verdict));

    if (reviewer_agent_id === executor_agent_id) {
      throw new IndependentReviewError(
        "REVIEWER_IS_EXECUTOR",
        `reviewer_agent_id must differ from executor_agent_id (${executor_agent_id})`,
      );
    }
    if (reviewer_session_id === executor_session_id) {
      throw new IndependentReviewError(
        "SAME_SESSION",
        `reviewer_session_id must differ from executor_session_id (${executor_session_id})`,
      );
    }

    const record: IndependentReviewRecord = {
      kind: "IndependentReview",
      review_id: `ir-${randomUUID()}`,
      executor_agent_id,
      executor_session_id,
      reviewer_agent_id,
      reviewer_session_id,
      verdict,
      work_id: input.work_id?.trim() || undefined,
      goal_contract_id: input.goal_contract_id?.trim() || undefined,
      independent: true,
      session_separated: true,
      submitted_at: nowIso(this.clock),
    };
    this.reviews.push(record);
    return { ...record };
  }

  listReviews(filter?: { work_id?: string; goal_contract_id?: string }): IndependentReviewRecord[] {
    return this.reviews
      .filter((r) => {
        // Scoped reviews must match; unscoped (missing field) remain visible to that filter key.
        if (filter?.work_id && r.work_id && r.work_id !== filter.work_id) return false;
        if (
          filter?.goal_contract_id &&
          r.goal_contract_id &&
          r.goal_contract_id !== filter.goal_contract_id
        ) {
          return false;
        }
        return true;
      })
      .map((r) => ({ ...r }));
  }

  /** Latest accepted PASS review matching optional work/goal scope. */
  latestValidPassReview(filter?: {
    work_id?: string;
    goal_contract_id?: string;
  }): IndependentReviewRecord | undefined {
    const matches = this.listReviews(filter).filter((r) => r.verdict === "PASS");
    return matches.length > 0 ? matches[matches.length - 1] : undefined;
  }

  hasValidPassReview(filter?: { work_id?: string; goal_contract_id?: string }): boolean {
    return this.latestValidPassReview(filter) !== undefined;
  }

  /**
   * Block TRUE_FULL_PASS / VERIFIED_PASS when the contract requires independent review
   * and no valid PASS review is present. When the flag is off, returns null (no-op).
   */
  assertPassAllowed(
    target: IndependentReviewPassTarget,
    filter?: { work_id?: string; goal_contract_id?: string },
  ): IndependentReviewRecord | null {
    if (!this.require_independent_review) {
      return this.latestValidPassReview(filter) ?? null;
    }
    const review = this.latestValidPassReview(filter);
    if (!review) {
      throw new IndependentReviewError(
        "MISSING_INDEPENDENT_REVIEW",
        `${target} blocked: require_independent_review without valid PASS review`,
      );
    }
    return review;
  }

  /**
   * Soft check used by Evidence Validator / verified-pass (no throw when not required).
   */
  evaluateForPass(
    target: IndependentReviewPassTarget,
    filter?: { work_id?: string; goal_contract_id?: string },
  ): {
    allowed: boolean;
    reasons: string[];
    review?: IndependentReviewRecord;
  } {
    if (!this.require_independent_review) {
      return { allowed: true, reasons: [] };
    }
    const review = this.latestValidPassReview(filter);
    if (!review) {
      return {
        allowed: false,
        reasons: [
          `missing_valid_independent_review:${target}`,
          "require_independent_review",
        ],
      };
    }
    return { allowed: true, reasons: [], review };
  }
}
