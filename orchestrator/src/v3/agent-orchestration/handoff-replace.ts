/**
 * V5-M02 — Handoff/replace contract over ContinuityEngine + Attempts.
 * REPLACED preserves Work; Attempt failure/supersede ≠ Work failure.
 */

import type {
  ContinuityEngine,
  CreateHandoffInput,
} from "../continuity/engine.js";
import type { HandoffPackage } from "../continuity/types.js";
import type { PersistentWorkRuntime } from "../work-runtime/runtime.js";
import type { Attempt, Work } from "../work-runtime/types.js";

export interface ReplaceViaHandoffInput {
  work_id: string;
  agent_id: string;
  trigger: CreateHandoffInput["trigger"];
  reason: string;
  next_action: string;
  /**
   * When true (default), running/pending Attempts for the replaced agent
   * are marked superseded — Work.work_state is left unchanged.
   */
  supersede_agent_attempts?: boolean;
}

export interface ReplaceViaHandoffResult {
  kind: "ReplaceViaHandoffResult";
  work_before: Work;
  work_after: Work;
  handoff: HandoffPackage;
  to_agent_id?: string;
  superseded_attempts: Attempt[];
  /** Contract assertion: Work still durable and not terminalized by replace. */
  work_preserved: boolean;
  limitations: string[];
}

/**
 * Apply Continuity handoff (REPLACED) and optionally supersede Attempts.
 * Does not rewrite adapters; reuses ContinuityEngine.
 */
export function replaceAgentPreservingWork(
  runtime: PersistentWorkRuntime,
  continuity: ContinuityEngine,
  input: ReplaceViaHandoffInput,
): ReplaceViaHandoffResult {
  const work_before = runtime.read(input.work_id);
  const limitations: string[] = [];

  const pkg = continuity.createHandoff({
    work_id: input.work_id,
    agent_id: input.agent_id,
    trigger: input.trigger,
    reason: input.reason,
    next_action: input.next_action,
  });
  const applied = continuity.applyHandoff(pkg.handoff_id);

  const superseded_attempts: Attempt[] = [];
  if (input.supersede_agent_attempts !== false) {
    const attempts = runtime.listAttempts(input.work_id);
    for (const a of attempts) {
      const belongs =
        a.agent_id === input.agent_id || a.executor_id === input.agent_id;
      if (!belongs) continue;
      if (a.status === "succeeded" || a.status === "superseded") continue;
      if (a.status === "failed" || a.status === "cancelled") continue;
      superseded_attempts.push(
        runtime.supersedeAttempt(
          a.attempt_id,
          `agent_replaced:${input.agent_id}→${applied.to_agent_id ?? "unknown"}`,
        ),
      );
    }
  } else {
    limitations.push("supersede_agent_attempts:skipped");
  }

  const work_after = runtime.read(input.work_id);
  const replaced = work_after.agent_refs.find((a) => a.agent_id === input.agent_id);
  const work_preserved =
    work_after.liveness.durable === true &&
    work_after.work_id === work_before.work_id &&
    work_after.work_state !== "TRUE_FULL_PASS" &&
    (replaced?.state === "REPLACED" || !replaced);

  if (replaced && replaced.state !== "REPLACED") {
    limitations.push(`agent_state_unexpected:${replaced.state}`);
  }

  return {
    kind: "ReplaceViaHandoffResult",
    work_before,
    work_after,
    handoff: applied,
    to_agent_id: applied.to_agent_id,
    superseded_attempts,
    work_preserved,
    limitations,
  };
}
