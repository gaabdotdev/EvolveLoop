/**
 * V1-SEC-04 — Structural Taint Tracking.
 * Runtime + MemoryBroker block privileged actions originating from tainted data.
 * V2-SEC-01 — QuarantineStore.quarantineFromTaint / quarantineDerivedFromTaint consume TrackedValue.
 */

import type { CapabilityAction } from "./types.js";
import { DESTRUCTIVE_OR_SENSITIVE_ACTIONS } from "./capability-gate.js";

export type TaintSource =
  | "untrusted_input"
  | "external_url"
  | "agent_proposal"
  | "holdout_leak"
  | "user_paste"
  | "memory_tainted";

export interface TaintedValue<T = unknown> {
  kind: "TaintedValue";
  value: T;
  tainted: true;
  sources: TaintSource[];
  label?: string;
}

export interface CleanValue<T = unknown> {
  kind: "CleanValue";
  value: T;
  tainted: false;
}

export type TrackedValue<T = unknown> = TaintedValue<T> | CleanValue<T>;

export function taint<T>(value: T, source: TaintSource, label?: string): TaintedValue<T> {
  return { kind: "TaintedValue", value, tainted: true, sources: [source], label };
}

export function clean<T>(value: T): CleanValue<T> {
  return { kind: "CleanValue", value, tainted: false };
}

export function isTainted(v: TrackedValue | { tainted?: boolean } | null | undefined): boolean {
  if (v == null) return false;
  return Boolean((v as { tainted?: boolean }).tainted);
}

/** Merge taint: any tainted operand → tainted result. */
export function joinTaint<T>(
  value: T,
  ...parts: Array<TrackedValue | { tainted?: boolean } | null | undefined>
): TrackedValue<T> {
  const sources: TaintSource[] = [];
  let tainted = false;
  for (const p of parts) {
    if (!p) continue;
    if ("tainted" in p && p.tainted) {
      tainted = true;
      if ("sources" in p && Array.isArray((p as TaintedValue).sources)) {
        sources.push(...(p as TaintedValue).sources);
      } else {
        sources.push("untrusted_input");
      }
    }
  }
  if (tainted) {
    return { kind: "TaintedValue", value, tainted: true, sources: [...new Set(sources)] };
  }
  return clean(value);
}

export const PRIVILEGED_TAINT_ACTIONS: ReadonlySet<CapabilityAction> = new Set([
  ...DESTRUCTIVE_OR_SENSITIVE_ACTIONS,
  "shell.execute",
  "process.spawn",
  "filesystem.write",
  "secrets.inject",
]);

export interface TaintGateResult {
  kind: "TaintGateResult";
  allowed: boolean;
  blocked: boolean;
  reason: string;
  action: CapabilityAction;
  sources: TaintSource[];
}

/**
 * Block privileged actions when any input is tainted.
 */
export function evaluateTaintGate(
  action: CapabilityAction,
  inputs: Array<TrackedValue | { tainted?: boolean; sources?: TaintSource[] } | null | undefined>,
): TaintGateResult {
  const sources: TaintSource[] = [];
  let tainted = false;
  for (const inp of inputs) {
    if (inp && "tainted" in inp && inp.tainted) {
      tainted = true;
      if ("sources" in inp && Array.isArray(inp.sources)) sources.push(...inp.sources);
      else sources.push("untrusted_input");
    }
  }

  if (tainted && PRIVILEGED_TAINT_ACTIONS.has(action)) {
    return {
      kind: "TaintGateResult",
      allowed: false,
      blocked: true,
      reason: `taint_blocks_privileged_action:${action}`,
      action,
      sources: [...new Set(sources)],
    };
  }

  return {
    kind: "TaintGateResult",
    allowed: true,
    blocked: false,
    reason: tainted ? "tainted_but_action_not_privileged" : "clean_inputs",
    action,
    sources: [...new Set(sources)],
  };
}

export class TaintPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly gate: TaintGateResult,
  ) {
    super(message);
    this.name = "TaintPolicyError";
  }
}

export function assertTaintAllowed(
  action: CapabilityAction,
  inputs: Array<TrackedValue | { tainted?: boolean; sources?: TaintSource[] } | null | undefined>,
): TaintGateResult {
  const gate = evaluateTaintGate(action, inputs);
  if (gate.blocked) {
    throw new TaintPolicyError("TAINT_BLOCKED", gate.reason, gate);
  }
  return gate;
}
