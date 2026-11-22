/**
 * V1-TOK-13 — Speculative execution control flow.
 *
 * Local Draft → Deterministic Test → Cloud Escalation (layer 2)
 * only when local tests fail.
 */

import { selectModelLayer, type ModelLayerId } from "./model-layers.js";

export type SpeculativeStage = "local_draft" | "deterministic_test" | "cloud_escalation";

export interface SpeculativeDraftResult {
  ok: boolean;
  text?: string;
  layer: ModelLayerId;
  tokens_out?: number;
}

export interface SpeculativeTestResult {
  ok: boolean;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  reason?: string;
}

export interface SpeculativeEscalateResult {
  ok: boolean;
  text?: string;
  layer: ModelLayerId;
  tokens_out?: number;
  skipped?: boolean;
  reason?: string;
}

export interface SpeculativePipelineHooks {
  /** Layer-0 local draft. */
  draftLocal: () => Promise<SpeculativeDraftResult> | SpeculativeDraftResult;
  /** Deterministic tests against the draft (no LLM). */
  runTests: (draft: SpeculativeDraftResult) => Promise<SpeculativeTestResult> | SpeculativeTestResult;
  /** Layer-2 frontier escalation — must NOT be called on green local path. */
  escalateCloud: (draft: SpeculativeDraftResult) => Promise<SpeculativeEscalateResult> | SpeculativeEscalateResult;
}

export interface SpeculativePipelineReport {
  kind: "SpeculativePipelineReport";
  stages: SpeculativeStage[];
  draft: SpeculativeDraftResult;
  tests: SpeculativeTestResult;
  escalation: SpeculativeEscalateResult;
  /** True when layer-2 escalateCloud was invoked. */
  layer2_invoked: boolean;
  final_ok: boolean;
  tokens_proxy: number;
  reason: string;
}

/**
 * Run speculative pipeline with real control flow.
 * Green local tests → skip cloud; never call escalateCloud.
 */
export async function runSpeculativePipeline(
  hooks: SpeculativePipelineHooks,
): Promise<SpeculativePipelineReport> {
  const stages: SpeculativeStage[] = [];
  let layer2_invoked = false;
  let tokens_proxy = 0;

  // Prefer layer 0 for draft via policy (document intent; hooks own invoke).
  const layerSel = selectModelLayer({ kind: "draft" });
  stages.push("local_draft");
  const draft = await Promise.resolve(hooks.draftLocal());
  tokens_proxy += draft.tokens_out ?? 0;
  if (draft.layer !== 0 && draft.layer !== layerSel.layer) {
    // Soft note only — hooks may stamp their layer.
  }

  stages.push("deterministic_test");
  const tests = await Promise.resolve(hooks.runTests(draft));

  if (tests.ok) {
    const escalation: SpeculativeEscalateResult = {
      ok: true,
      skipped: true,
      layer: 2,
      reason: "local_tests_green — skip frontier",
    };
    return {
      kind: "SpeculativePipelineReport",
      stages,
      draft,
      tests,
      escalation,
      layer2_invoked: false,
      final_ok: draft.ok && tests.ok,
      tokens_proxy,
      reason: "green_local_path",
    };
  }

  stages.push("cloud_escalation");
  layer2_invoked = true;
  const escalation = await Promise.resolve(hooks.escalateCloud(draft));
  tokens_proxy += escalation.tokens_out ?? 0;

  return {
    kind: "SpeculativePipelineReport",
    stages,
    draft,
    tests,
    escalation,
    layer2_invoked,
    final_ok: Boolean(escalation.ok),
    tokens_proxy,
    reason: escalation.ok ? "escalated_ok" : "escalated_failed",
  };
}
