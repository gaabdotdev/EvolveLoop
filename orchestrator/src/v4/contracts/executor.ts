/**
 * Executor v1 — replaceable agent/model/provider/runtime/worker/tool/human (constitution §1.2, §5).
 * Producers: M14 (manifests/conformance), M13 (workers via V3.7 node registry).
 * Declared capabilities are claims; observed competence lives in CapabilityProfile (M08).
 */

import { type ContractHeader, type IsoTimestamp, validateWith, type ValidationResult } from "./common.js";

export const EXECUTOR_SCHEMA_VERSION = "1.0.0";

export type ExecutorKind = "MODEL" | "AGENT" | "PROVIDER" | "RUNTIME" | "WORKER" | "TOOL" | "HUMAN";
export const EXECUTOR_KINDS: readonly ExecutorKind[] = ["MODEL", "AGENT", "PROVIDER", "RUNTIME", "WORKER", "TOOL", "HUMAN"];

/** Mirrors V3.7 fabric `TrustState` (orchestrator/src/v3/fabric/types.ts) — reused, not redefined semantically. */
export type ExecutorTrustState = "untrusted" | "pending" | "trusted" | "revoked" | "quarantined";
export const EXECUTOR_TRUST_STATES: readonly ExecutorTrustState[] = ["untrusted", "pending", "trusted", "revoked", "quarantined"];

/** Interoperability conformance levels (ADR-V4-0013). */
export type ConformanceLevel = "C0_OBSERVED" | "C1_TASK" | "C2_CONTINUITY" | "C3_EFFECT_AWARE";
export const CONFORMANCE_LEVELS: readonly ConformanceLevel[] = ["C0_OBSERVED", "C1_TASK", "C2_CONTINUITY", "C3_EFFECT_AWARE"];

export interface Executor extends ContractHeader<"Executor"> {
  executor_id: string;
  executor_kind: ExecutorKind;
  name: string;
  executor_version: string;
  declared_capabilities: string[];
  trust_state: ExecutorTrustState;
  conformance_level: ConformanceLevel;
  /** Policy subject selectors bind to these labels; no permission is implied by them. */
  labels: string[];
  /** Optional links into V3.7 registries (ADR-V4-0002). */
  v37_refs?: { worker_node_id?: string; agent_id?: string; provider_id?: string };
  registered_at: IsoTimestamp;
}

export function isAssignable(executor: Pick<Executor, "trust_state">): boolean {
  return executor.trust_state === "trusted";
}

export function validateExecutor(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Executor");
    c.id("executor_id", "executor");
    c.oneOf("executor_kind", EXECUTOR_KINDS);
    c.string("name");
    c.string("executor_version");
    c.stringArray("declared_capabilities");
    c.oneOf("trust_state", EXECUTOR_TRUST_STATES);
    c.oneOf("conformance_level", CONFORMANCE_LEVELS);
    c.stringArray("labels");
    c.record("v37_refs", { optional: true });
    c.timestamp("registered_at");
    for (const forbidden of ["score", "rank", "quality_score"]) {
      c.ensure(!c.has(forbidden), "INV-EXECR-02", forbidden, "executors carry no self-declared scores");
    }
  });
}
