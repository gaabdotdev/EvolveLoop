/**
 * Classify agent limit/failure signals. LIMIT_REACHED is a session event — not task terminal.
 */

export type LimitCause =
  | "context_window"
  | "quota_exhausted"
  | "rate_limit"
  | "insufficient_balance"
  | "timeout"
  | "disconnect"
  | "process_crash"
  | "session_expired"
  | "provider_unavailable"
  | "unknown";

export interface LimitClassification {
  kind: "LimitClassification";
  cause: LimitCause;
  agent_state: "LIMIT_REACHED" | "FAILED" | "STALE" | "YIELDING";
  should_handoff: boolean;
  preventive: boolean;
  detail: string;
}

const PATTERNS: Array<{ cause: LimitCause; re: RegExp; state: LimitClassification["agent_state"] }> = [
  { cause: "rate_limit", re: /rate.?limit|429|too many requests/i, state: "LIMIT_REACHED" },
  { cause: "quota_exhausted", re: /quota|usage.?limit|monthly.?limit/i, state: "LIMIT_REACHED" },
  { cause: "insufficient_balance", re: /insufficient.?fund|billing|payment.?required|402/i, state: "LIMIT_REACHED" },
  { cause: "context_window", re: /context.?length|context.?window|maximum.?context|token.?limit/i, state: "LIMIT_REACHED" },
  { cause: "timeout", re: /timeout|timed?\s*out|deadline/i, state: "LIMIT_REACHED" },
  { cause: "disconnect", re: /disconnect|ECONNRESET|socket hang up|network.?error/i, state: "FAILED" },
  { cause: "session_expired", re: /session.?expir|unauthorized|401/i, state: "STALE" },
  { cause: "provider_unavailable", re: /503|unavailable|overloaded/i, state: "YIELDING" },
  { cause: "process_crash", re: /segfault|SIGKILL|process.?crash|exit.?code/i, state: "FAILED" },
];

export function classifyLimitSignal(message: string, opts?: { preventive?: boolean }): LimitClassification {
  const text = message.trim();
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return {
        kind: "LimitClassification",
        cause: p.cause,
        agent_state: p.state,
        should_handoff: true,
        preventive: opts?.preventive === true,
        detail: text.slice(0, 500),
      };
    }
  }
  return {
    kind: "LimitClassification",
    cause: "unknown",
    agent_state: "FAILED",
    should_handoff: true,
    preventive: false,
    detail: text.slice(0, 500) || "empty_signal",
  };
}
