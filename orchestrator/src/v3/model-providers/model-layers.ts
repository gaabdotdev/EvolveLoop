/**
 * V1-TOK-12 — 3-layer model hierarchy.
 *
 * Layer 0: local / Ollama (free, constrained)
 * Layer 1: cheap / fast remote
 * Layer 2: Frontier (paid, escalate only when needed)
 */

export type ModelLayerId = 0 | 1 | 2;

export type ModelLayerKind = "local" | "cheap_fast" | "frontier";

export interface ModelLayerDescriptor {
  layer: ModelLayerId;
  kind: ModelLayerKind;
  label: string;
  locality: "local" | "remote";
  /** Rough relative cost band for policy / ledger notes. */
  cost_band: "zero" | "low" | "high";
  default_provider_id: string;
  default_model?: string;
}

export const MODEL_LAYER_TABLE: Readonly<Record<ModelLayerId, ModelLayerDescriptor>> = {
  0: {
    layer: 0,
    kind: "local",
    label: "Local / Ollama",
    locality: "local",
    cost_band: "zero",
    default_provider_id: "ollama",
    default_model: "bonsai-64k:latest",
  },
  1: {
    layer: 1,
    kind: "cheap_fast",
    label: "Cheap / fast remote",
    locality: "remote",
    cost_band: "low",
    default_provider_id: "openrouter",
    default_model: "openrouter/auto-cheap",
  },
  2: {
    layer: 2,
    kind: "frontier",
    label: "Frontier",
    locality: "remote",
    cost_band: "high",
    default_provider_id: "openrouter",
    default_model: "openrouter/frontier",
  },
} as const;

export type ModelTaskKind =
  | "draft"
  | "lint_fix"
  | "mechanical"
  | "classify"
  | "apply"
  | "reason"
  | "frontier_only"
  | "escalate";

export interface ModelTask {
  kind: ModelTaskKind;
  /** Soft complexity 0..1; higher prefers higher layers when kind is ambiguous. */
  complexity?: number;
  /** When true, force at least layer 1 (no pure-local). */
  require_remote?: boolean;
  /** When true, allow / prefer frontier. */
  allow_frontier?: boolean;
  /** Explicit override — tests / operators. */
  force_layer?: ModelLayerId;
}

export interface ModelLayerSelection {
  kind: "ModelLayerSelection";
  layer: ModelLayerId;
  descriptor: ModelLayerDescriptor;
  reason: string;
}

/**
 * Policy: prefer cheapest capable layer.
 * - mechanical / lint_fix / apply / draft → 0
 * - classify → 0 unless require_remote or complexity ≥ 0.6 → 1
 * - reason → 1 unless allow_frontier and complexity ≥ 0.85 → 2
 * - frontier_only / escalate → 2
 */
export function selectModelLayer(task: ModelTask): ModelLayerSelection {
  if (task.force_layer != null) {
    const layer = task.force_layer;
    return {
      kind: "ModelLayerSelection",
      layer,
      descriptor: MODEL_LAYER_TABLE[layer],
      reason: `force_layer=${layer}`,
    };
  }

  const complexity = clamp01(task.complexity ?? 0.3);

  if (task.kind === "frontier_only" || task.kind === "escalate") {
    return select(2, `task.kind=${task.kind}`);
  }

  if (
    task.kind === "mechanical" ||
    task.kind === "lint_fix" ||
    task.kind === "apply" ||
    task.kind === "draft"
  ) {
    if (task.require_remote) {
      return select(1, `${task.kind} + require_remote`);
    }
    return select(0, `prefer local for ${task.kind}`);
  }

  if (task.kind === "classify") {
    if (task.require_remote || complexity >= 0.6) {
      return select(1, `classify complexity=${complexity}`);
    }
    return select(0, "classify local");
  }

  // reason (default)
  if (task.allow_frontier && complexity >= 0.85) {
    return select(2, `reason frontier complexity=${complexity}`);
  }
  if (task.require_remote || complexity >= 0.4) {
    return select(1, `reason cheap/fast complexity=${complexity}`);
  }
  return select(0, `reason local complexity=${complexity}`);
}

function select(layer: ModelLayerId, reason: string): ModelLayerSelection {
  return {
    kind: "ModelLayerSelection",
    layer,
    descriptor: MODEL_LAYER_TABLE[layer],
    reason,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function describeModelLayer(layer: ModelLayerId): ModelLayerDescriptor {
  return MODEL_LAYER_TABLE[layer];
}
