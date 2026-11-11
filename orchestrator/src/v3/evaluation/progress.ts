/**
 * Anti-loop / unproductive cycle detection for engineering runs.
 */

export type ProgressSignal =
  | "test_improved"
  | "files_changed"
  | "criterion_advanced"
  | "replan"
  | "same_error"
  | "revert"
  | "budget_exceeded"
  | "blocked_dependency"
  | "redundant_delegation";

export interface ProgressEvent {
  at: string;
  signal: ProgressSignal;
  detail?: string;
  error_signature?: string;
}

export interface ProgressPolicy {
  max_replans: number;
  max_same_error: number;
  max_reverts: number;
  max_redundant_delegations: number;
}

export interface ProgressVerdict {
  allow_continue: boolean;
  action: "CONTINUE" | "PAUSE" | "ESCALATE" | "STOP_FAILED";
  reasons: string[];
}

const DEFAULT_POLICY: ProgressPolicy = {
  max_replans: 3,
  max_same_error: 3,
  max_reverts: 2,
  max_redundant_delegations: 3,
};

export class ProgressTracker {
  private events: ProgressEvent[] = [];
  constructor(private readonly policy: ProgressPolicy = DEFAULT_POLICY) {}

  record(signal: ProgressSignal, detail?: string, error_signature?: string): void {
    this.events.push({
      at: new Date().toISOString(),
      signal,
      detail,
      error_signature,
    });
  }

  snapshot(): ProgressEvent[] {
    return [...this.events];
  }

  evaluate(): ProgressVerdict {
    const reasons: string[] = [];
    const replans = this.events.filter((e) => e.signal === "replan").length;
    if (replans > this.policy.max_replans) {
      reasons.push(`excessive_replans:${replans}`);
    }

    const errorCounts = new Map<string, number>();
    for (const e of this.events) {
      if (e.signal === "same_error" && e.error_signature) {
        errorCounts.set(e.error_signature, (errorCounts.get(e.error_signature) ?? 0) + 1);
      }
    }
    for (const [sig, n] of errorCounts) {
      if (n >= this.policy.max_same_error) reasons.push(`repeated_error:${sig}:${n}`);
    }

    const reverts = this.events.filter((e) => e.signal === "revert").length;
    if (reverts >= this.policy.max_reverts) reasons.push(`repeated_reverts:${reverts}`);

    const redundant = this.events.filter((e) => e.signal === "redundant_delegation").length;
    if (redundant >= this.policy.max_redundant_delegations) {
      reasons.push(`redundant_delegations:${redundant}`);
    }

    if (this.events.some((e) => e.signal === "budget_exceeded")) {
      reasons.push("budget_exceeded");
    }
    if (this.events.some((e) => e.signal === "blocked_dependency")) {
      reasons.push("blocked_dependency");
    }

    if (reasons.length === 0) {
      return { allow_continue: true, action: "CONTINUE", reasons: [] };
    }

    const action =
      reasons.some((r) => r.startsWith("budget") || r.startsWith("blocked"))
        ? "PAUSE"
        : reasons.some((r) => r.startsWith("excessive") || r.startsWith("repeated"))
          ? "STOP_FAILED"
          : "ESCALATE";

    return { allow_continue: false, action, reasons };
  }
}
