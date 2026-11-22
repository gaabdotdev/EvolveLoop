/**
 * V5-M05 — Thin policy wrapper over REMED lifecycle run-controls.
 * Does NOT reimplement pause/resume/cancel — only checkPolicy before calling.
 *
 * Proven operational controls: orchestrator/src/v3/lifecycle/run-controls.ts (REMED-M2).
 */

export {
  pauseOwnedRuns,
  resumeOwnedRuns,
  cancelOwnedRuns,
  registerOwnedProcessSession,
  type RunControlAction,
  type RunControlOpts,
  type RunControlResult,
  type RunControlSessionResult,
} from "../lifecycle/run-controls.js";

import {
  cancelOwnedRuns,
  pauseOwnedRuns,
  resumeOwnedRuns,
  type RunControlOpts,
  type RunControlResult,
} from "../lifecycle/run-controls.js";
import type { AuditLog } from "./audit-log.js";
import type { PolicyCheckResult } from "./types.js";
import type { PolicyStore } from "./policy-store.js";

/**
 * Operator-facing notes for governance docs / audit (not a second control plane).
 */
export const LIFECYCLE_GOVERNANCE_NOTES = [
  "pause/resume/cancel are owned by orchestrator/src/v3/lifecycle/run-controls.ts (REMED-M2)",
  "Controls are identity-fenced to ProcessSessions for Work/Task — never bare PID kill",
  "no_live_targets is an honest outcome (persistence-only journey flag)",
  "Human Governance policy deny does not replace lifecycle — thin wrapper checks policy first",
  "Approvals authorize scoped operations; lifecycle controls journey execution",
] as const;

export type PolicyGatedLifecycleResult =
  | { kind: "RunControlResult"; result: RunControlResult; policy: PolicyCheckResult }
  | {
      kind: "PolicyDenied";
      policy: PolicyCheckResult;
      action: "pause" | "resume" | "cancel";
      message_pt: string;
    };

function gate(
  policy: PolicyStore,
  control: "pause" | "resume" | "cancel",
  opts: RunControlOpts,
  audit: AuditLog | undefined,
  invoke: (o: RunControlOpts) => RunControlResult,
): PolicyGatedLifecycleResult {
  const check = policy.checkPolicy({
    type: "lifecycle",
    control,
    work_id: opts.work_id,
  });
  if (!check.allowed) {
    audit?.append({
      work_id: opts.work_id,
      audit_kind: "policy_deny_lifecycle",
      message: `lifecycle ${control} denied by policy`,
      payload: { reasons: check.reasons },
    });
    return {
      kind: "PolicyDenied",
      policy: check,
      action: control,
      message_pt: `Política nega ${control} — controlo REMED não invocado.`,
    };
  }
  const result = invoke(opts);
  audit?.append({
    work_id: opts.work_id,
    audit_kind: "lifecycle_note",
    message: `lifecycle ${control} after policy allow`,
    payload: {
      no_live_targets: result.no_live_targets,
      ok: result.ok,
    },
  });
  return { kind: "RunControlResult", result, policy: check };
}

/** Policy-gated pause — reuses REMED pauseOwnedRuns when allowed. */
export function pauseOwnedRunsUnderPolicy(
  policy: PolicyStore,
  opts: RunControlOpts,
  audit?: AuditLog,
): PolicyGatedLifecycleResult {
  return gate(policy, "pause", opts, audit, pauseOwnedRuns);
}

/** Policy-gated resume — reuses REMED resumeOwnedRuns when allowed. */
export function resumeOwnedRunsUnderPolicy(
  policy: PolicyStore,
  opts: RunControlOpts,
  audit?: AuditLog,
): PolicyGatedLifecycleResult {
  return gate(policy, "resume", opts, audit, resumeOwnedRuns);
}

/** Policy-gated cancel — reuses REMED cancelOwnedRuns when allowed. */
export function cancelOwnedRunsUnderPolicy(
  policy: PolicyStore,
  opts: RunControlOpts,
  audit?: AuditLog,
): PolicyGatedLifecycleResult {
  return gate(policy, "cancel", opts, audit, cancelOwnedRuns);
}
