/**
 * V0-TOK-06 — Rigid max_tokens_budget per TaskGraph node.
 * Alert at 80%, abort + checkpoint at 100%. Sliding window: max 2 failed attempts in context.
 */

export const TOKEN_BUDGET_ALERT_RATIO = 0.8;
export const TOKEN_BUDGET_ABORT_RATIO = 1.0;
export const FAILED_ATTEMPT_CONTEXT_WINDOW = 2;

export type NodeBudgetVerdict = "ok" | "alert_80" | "abort_100";

export interface FailedAttemptRecord {
  attempt_id: string;
  task_id: string;
  error_summary: string;
  tokens_spent?: number | null;
  at: string;
}

export interface NodeTokenBudgetState {
  work_id: string;
  task_id: string;
  max_tokens_budget: number;
  tokens_consumed: number;
  failed_attempts: FailedAttemptRecord[];
  checkpoint?: Record<string, unknown>;
}

export interface NodeBudgetEvaluation {
  kind: "NodeBudgetEvaluation";
  verdict: NodeBudgetVerdict;
  ratio: number;
  alert_threshold: number;
  abort_threshold: number;
  tokens_consumed: number;
  max_tokens_budget: number;
  remaining: number;
  /** At most FAILED_ATTEMPT_CONTEXT_WINDOW most-recent failures for prompt context. */
  context_failed_attempts: FailedAttemptRecord[];
  checkpoint?: Record<string, unknown>;
  aborted: boolean;
  message_en: string;
}

export function slidingFailedAttempts(
  attempts: FailedAttemptRecord[],
  window: number = FAILED_ATTEMPT_CONTEXT_WINDOW,
): FailedAttemptRecord[] {
  if (window <= 0) return [];
  if (attempts.length <= window) return [...attempts];
  return attempts.slice(attempts.length - window);
}

/**
 * Evaluate budget for a TaskGraph node. Pure — caller persists checkpoint on abort_100.
 */
export function evaluateNodeTokenBudget(state: NodeTokenBudgetState): NodeBudgetEvaluation {
  const max = state.max_tokens_budget;
  if (!(max > 0)) {
    return {
      kind: "NodeBudgetEvaluation",
      verdict: "abort_100",
      ratio: Number.POSITIVE_INFINITY,
      alert_threshold: TOKEN_BUDGET_ALERT_RATIO,
      abort_threshold: TOKEN_BUDGET_ABORT_RATIO,
      tokens_consumed: state.tokens_consumed,
      max_tokens_budget: max,
      remaining: 0,
      context_failed_attempts: slidingFailedAttempts(state.failed_attempts),
      checkpoint: state.checkpoint,
      aborted: true,
      message_en: `budget.invalid max_tokens_budget=${max} task=${state.task_id}`,
    };
  }

  const ratio = state.tokens_consumed / max;
  const remaining = Math.max(0, max - state.tokens_consumed);
  const context_failed_attempts = slidingFailedAttempts(state.failed_attempts);

  if (ratio >= TOKEN_BUDGET_ABORT_RATIO) {
    const checkpoint = state.checkpoint ?? {
      kind: "TokenBudgetCheckpoint",
      work_id: state.work_id,
      task_id: state.task_id,
      tokens_consumed: state.tokens_consumed,
      max_tokens_budget: max,
      failed_attempts: context_failed_attempts,
      saved_at: new Date().toISOString(),
      reason: "max_tokens_budget_exhausted",
    };
    return {
      kind: "NodeBudgetEvaluation",
      verdict: "abort_100",
      ratio,
      alert_threshold: TOKEN_BUDGET_ALERT_RATIO,
      abort_threshold: TOKEN_BUDGET_ABORT_RATIO,
      tokens_consumed: state.tokens_consumed,
      max_tokens_budget: max,
      remaining: 0,
      context_failed_attempts,
      checkpoint,
      aborted: true,
      message_en: `budget.abort ratio=${ratio.toFixed(3)} consumed=${state.tokens_consumed}/${max} task=${state.task_id}`,
    };
  }

  if (ratio >= TOKEN_BUDGET_ALERT_RATIO) {
    return {
      kind: "NodeBudgetEvaluation",
      verdict: "alert_80",
      ratio,
      alert_threshold: TOKEN_BUDGET_ALERT_RATIO,
      abort_threshold: TOKEN_BUDGET_ABORT_RATIO,
      tokens_consumed: state.tokens_consumed,
      max_tokens_budget: max,
      remaining,
      context_failed_attempts,
      aborted: false,
      message_en: `budget.alert_80 ratio=${ratio.toFixed(3)} remaining=${remaining} task=${state.task_id}`,
    };
  }

  return {
    kind: "NodeBudgetEvaluation",
    verdict: "ok",
    ratio,
    alert_threshold: TOKEN_BUDGET_ALERT_RATIO,
    abort_threshold: TOKEN_BUDGET_ABORT_RATIO,
    tokens_consumed: state.tokens_consumed,
    max_tokens_budget: max,
    remaining,
    context_failed_attempts,
    aborted: false,
    message_en: `budget.ok ratio=${ratio.toFixed(3)} remaining=${remaining} task=${state.task_id}`,
  };
}

/**
 * Persist abort checkpoint onto TaskGraph node payload (SQLite).
 */
export function applyBudgetAbortToNodePayload(
  payload: Record<string, unknown>,
  evaluation: NodeBudgetEvaluation,
): Record<string, unknown> {
  return {
    ...payload,
    max_tokens_budget: evaluation.max_tokens_budget,
    tokens_consumed: evaluation.tokens_consumed,
    token_budget_verdict: evaluation.verdict,
    token_budget_checkpoint: evaluation.checkpoint,
    failed_attempts_context: evaluation.context_failed_attempts,
  };
}
