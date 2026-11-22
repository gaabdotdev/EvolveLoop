/**
 * DecisionEngine interface (V0-ADAPT-03) — Laya plugs in at V2; V0 ships typed stubs only.
 * V1-TOK-12: ModelLayerPolicyEngine maps tasks → layer 0/1/2 via selectModelLayer.
 * V2-INT-01: StrictRuntimeDecisionEngine — runtime-provided candidates only + abstain policy.
 * V2-INT-02: PluggableDecisionEngineHost + LayaDecisionEngine + offline benchmark
 *            (see pluggable-host.ts, laya-decision-engine.ts, decision-engine-benchmark.ts).
 */

import {
  selectModelLayer,
  type ModelLayerSelection,
  type ModelTask,
} from "./model-layers.js";

export type DecisionAbstainReason =
  | "NO_CANDIDATES"
  | "POLICY_ABSTAIN"
  | "ENGINE_STUB"
  | "INSUFFICIENT_EVIDENCE";

export interface DecisionCandidate {
  candidate_id: string;
  label: string;
  score?: number;
  payload?: Record<string, unknown>;
}

export interface DecisionRequest {
  decision_id: string;
  context: string;
  candidates: DecisionCandidate[];
  /** Soft budget — engines may abstain rather than spend tokens. */
  max_candidates?: number;
}

export interface DecisionResult {
  kind: "DecisionResult";
  engine_id: string;
  decision_id: string;
  status: "selected" | "abstain" | "blocked";
  selected_candidate_id?: string;
  reason: string;
  abstain_reason?: DecisionAbstainReason;
  limitations: string[];
}

/**
 * Decoupled decision port — MSO / Scheduler / MemoryBroker consumers.
 * V0 must not depend on Laya; stubs return honest ENGINE_STUB abstain.
 */
export interface DecisionEngine {
  readonly engine_id: string;
  readonly maturity: "stub" | "experimental" | "stable";
  evaluate(req: DecisionRequest): Promise<DecisionResult>;
}

/**
 * Honest deferred stub for V0 createDeferredProviderStubs().
 * V2 ships LayaDecisionEngine (live client / offline heuristic / ENGINE_STUB) —
 * this class must never pretend a selection succeeded.
 */
export class LayaDecisionEngineStub implements DecisionEngine {
  readonly engine_id = "laya";
  readonly maturity = "stub" as const;

  async evaluate(req: DecisionRequest): Promise<DecisionResult> {
    return {
      kind: "DecisionResult",
      engine_id: this.engine_id,
      decision_id: req.decision_id,
      status: "abstain",
      reason:
        "LayaDecisionEngineStub — typed deferred slot only (ENGINE_STUB); use LayaDecisionEngine for V2 adapter",
      abstain_reason: "ENGINE_STUB",
      limitations: [
        "V0-ADAPT-03 stub — not a live classifier",
        "V2 adapter: LayaDecisionEngine (offline abstain/heuristic or injected client)",
        "Do not treat abstain as a selected action",
      ],
    };
  }
}

/**
 * V1-TOK-12 — Deterministic policy engine: select model layer for a task.
 * Not an LLM; exposes DecisionEngine shape for MSO wiring.
 */
export class ModelLayerPolicyEngine implements DecisionEngine {
  readonly engine_id = "model-layer-policy";
  readonly maturity = "experimental" as const;

  select(task: ModelTask): ModelLayerSelection {
    return selectModelLayer(task);
  }

  async evaluate(req: DecisionRequest): Promise<DecisionResult> {
    const task = (req.candidates[0]?.payload?.task ?? {
      kind: "reason",
      complexity: 0.5,
    }) as ModelTask;
    const sel = selectModelLayer(task);
    const candidateId =
      req.candidates.find((c) => c.payload?.layer === sel.layer)?.candidate_id ??
      `layer_${sel.layer}`;
    return {
      kind: "DecisionResult",
      engine_id: this.engine_id,
      decision_id: req.decision_id,
      status: "selected",
      selected_candidate_id: candidateId,
      reason: sel.reason,
      limitations: [
        `layer=${sel.layer}`,
        `kind=${sel.descriptor.kind}`,
        `cost_band=${sel.descriptor.cost_band}`,
      ],
    };
  }
}

/** V2-INT-01 — configurable abstention for StrictRuntimeDecisionEngine. */
export interface StrictRuntimeAbstainPolicy {
  /** Minimum score required to select (default 0). Below → INSUFFICIENT_EVIDENCE. */
  minScore?: number;
  /** When true (default), equal top scores → POLICY_ABSTAIN. */
  requireUniqueTop?: boolean;
  /**
   * When false (default), a top candidate with payload.blocked === true
   * yields status "blocked" instead of selection.
   */
  allowBlocked?: boolean;
}

export interface ScoredCandidateId {
  candidate_id: string;
  score: number;
}

/**
 * Optional external scorer. May return ids outside the allow-list —
 * StrictRuntimeDecisionEngine MUST ignore those (never invent/select them).
 */
export type RuntimeCandidateScorer = (
  candidates: readonly DecisionCandidate[],
  req: DecisionRequest,
) => ScoredCandidateId[] | Promise<ScoredCandidateId[]>;

export interface StrictRuntimeDecisionEngineOptions {
  engine_id?: string;
  policy?: StrictRuntimeAbstainPolicy;
  scorer?: RuntimeCandidateScorer;
}

const DEFAULT_POLICY: Required<StrictRuntimeAbstainPolicy> = {
  minScore: 0,
  requireUniqueTop: true,
  allowBlocked: false,
};

function defaultScoreCandidates(
  candidates: readonly DecisionCandidate[],
): ScoredCandidateId[] {
  return candidates.map((c) => ({
    candidate_id: c.candidate_id,
    score: typeof c.score === "number" && Number.isFinite(c.score) ? c.score : 0,
  }));
}

function isBlockedCandidate(c: DecisionCandidate | undefined): boolean {
  return c?.payload?.blocked === true;
}

/**
 * V2-INT-01 — Transversal DecisionEngine reusable by MSO / Scheduler / MemoryBroker.
 * Selects only among runtime-provided candidates; never invents ids.
 */
export class StrictRuntimeDecisionEngine implements DecisionEngine {
  readonly engine_id: string;
  readonly maturity = "experimental" as const;
  private readonly policy: Required<StrictRuntimeAbstainPolicy>;
  private readonly scorer: RuntimeCandidateScorer;

  constructor(opts: StrictRuntimeDecisionEngineOptions = {}) {
    this.engine_id = opts.engine_id ?? "strict-runtime";
    this.policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.scorer = opts.scorer ?? ((cands) => defaultScoreCandidates(cands));
  }

  get abstainPolicy(): Readonly<Required<StrictRuntimeAbstainPolicy>> {
    return this.policy;
  }

  async evaluate(req: DecisionRequest): Promise<DecisionResult> {
    const limitations: string[] = [
      "V2-INT-01 strict runtime — selection only from req.candidates",
    ];

    if (!req.candidates.length) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: "No candidates provided by runtime",
        abstain_reason: "NO_CANDIDATES",
        limitations,
      };
    }

    const max =
      typeof req.max_candidates === "number" && req.max_candidates > 0
        ? Math.floor(req.max_candidates)
        : req.candidates.length;
    const pool = req.candidates.slice(0, max);
    const allowIds = new Set(pool.map((c) => c.candidate_id));
    limitations.push(`evaluated=${pool.length}`, `max_candidates=${max}`);

    const rawScores = await this.scorer(pool, req);
    // Drop any id not in the truncated runtime list (0% invention).
    const scored = rawScores.filter((s) => allowIds.has(s.candidate_id));
    const rejected = rawScores.length - scored.length;
    if (rejected > 0) {
      limitations.push(`rejected_out_of_list=${rejected}`);
    }

    if (!scored.length) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: "Scorer produced no in-list candidates",
        abstain_reason: "INSUFFICIENT_EVIDENCE",
        limitations,
      };
    }

    const ranked = [...scored].sort((a, b) => b.score - a.score);
    const top = ranked[0]!;
    const tied = ranked.filter((s) => s.score === top.score);

    if (this.policy.requireUniqueTop && tied.length > 1) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: `Ambiguous top score tie among ${tied.length} candidates`,
        abstain_reason: "POLICY_ABSTAIN",
        limitations: [
          ...limitations,
          `tied_ids=${tied.map((t) => t.candidate_id).join(",")}`,
        ],
      };
    }

    if (top.score < this.policy.minScore) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: `Top score ${top.score} below minScore ${this.policy.minScore}`,
        abstain_reason: "INSUFFICIENT_EVIDENCE",
        limitations: [...limitations, `top_score=${top.score}`],
      };
    }

    const selected = pool.find((c) => c.candidate_id === top.candidate_id);
    // Defense in depth — should be impossible after allowIds filter.
    if (!selected || !allowIds.has(top.candidate_id)) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: "Selected id not present in runtime candidate list",
        abstain_reason: "POLICY_ABSTAIN",
        limitations,
      };
    }

    if (!this.policy.allowBlocked && isBlockedCandidate(selected)) {
      return {
        kind: "DecisionResult",
        engine_id: this.engine_id,
        decision_id: req.decision_id,
        status: "blocked",
        reason: "Top candidate is blocked by policy (allowBlocked=false)",
        limitations: [...limitations, `blocked_id=${selected.candidate_id}`],
      };
    }

    return {
      kind: "DecisionResult",
      engine_id: this.engine_id,
      decision_id: req.decision_id,
      status: "selected",
      selected_candidate_id: selected.candidate_id,
      reason: `Selected ${selected.candidate_id} with score ${top.score}`,
      limitations: [...limitations, `score=${top.score}`],
    };
  }
}

/** Consumer context tags for typed thin wrappers (same engine instance). */
export type DecisionConsumerKind = "scheduler" | "mso" | "memory_broker";

export interface ConsumerDecisionRequest extends DecisionRequest {
  consumer: DecisionConsumerKind;
}

async function decideForConsumer(
  engine: DecisionEngine,
  consumer: DecisionConsumerKind,
  req: DecisionRequest,
): Promise<DecisionResult> {
  const result = await engine.evaluate(req);
  return {
    ...result,
    limitations: [...result.limitations, `consumer=${consumer}`],
  };
}

/** Thin typed wrapper — Scheduler → shared DecisionEngine. */
export function decideForScheduler(
  engine: DecisionEngine,
  req: DecisionRequest,
): Promise<DecisionResult> {
  return decideForConsumer(engine, "scheduler", req);
}

/** Thin typed wrapper — MSO → shared DecisionEngine. */
export function decideForMso(
  engine: DecisionEngine,
  req: DecisionRequest,
): Promise<DecisionResult> {
  return decideForConsumer(engine, "mso", req);
}

/** Thin typed wrapper — MemoryBroker → shared DecisionEngine. */
export function decideForMemoryBroker(
  engine: DecisionEngine,
  req: DecisionRequest,
): Promise<DecisionResult> {
  return decideForConsumer(engine, "memory_broker", req);
}
