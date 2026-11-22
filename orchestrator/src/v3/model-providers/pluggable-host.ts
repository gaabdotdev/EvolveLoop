/**
 * V2-INT-02 — PluggableDecisionEngineHost
 * Registers DecisionEngine instances, swaps active engine, evaluates via active,
 * and falls back to baseline when Laya (or any active) fails / abstains ENGINE_STUB.
 * Consumers (MSO / Scheduler) keep using DecisionEngine.evaluate — no API change.
 */

import type {
  DecisionEngine,
  DecisionRequest,
  DecisionResult,
} from "./decision-engine.js";

export interface PluggableDecisionEngineHostOptions {
  /** Baseline engine (StrictRuntimeDecisionEngine or ModelLayerPolicyEngine). */
  baseline: DecisionEngine;
  /** Optional engines to register at construction (baseline is always registered). */
  engines?: DecisionEngine[];
  /** Start with this engine_id active (default: baseline.engine_id). */
  active?: string;
  /**
   * When active returns these abstain reasons, evaluate() re-runs baseline.
   * Default: ["ENGINE_STUB"].
   */
  fallbackAbstainReasons?: ReadonlyArray<NonNullable<DecisionResult["abstain_reason"]>>;
}

export class PluggableDecisionEngineHost implements DecisionEngine {
  readonly engine_id = "pluggable-host";
  readonly maturity = "experimental" as const;

  private readonly engines = new Map<string, DecisionEngine>();
  private readonly baselineId: string;
  private activeId: string;
  private readonly fallbackAbstainReasons: ReadonlySet<string>;

  constructor(opts: PluggableDecisionEngineHostOptions) {
    this.baselineId = opts.baseline.engine_id;
    this.engines.set(opts.baseline.engine_id, opts.baseline);
    for (const eng of opts.engines ?? []) {
      this.engines.set(eng.engine_id, eng);
    }
    const start = opts.active ?? opts.baseline.engine_id;
    if (!this.engines.has(start)) {
      throw new Error(`PluggableDecisionEngineHost: unknown active engine_id=${start}`);
    }
    this.activeId = start;
    this.fallbackAbstainReasons = new Set(
      opts.fallbackAbstainReasons ?? ["ENGINE_STUB"],
    );
  }

  registerEngine(engine: DecisionEngine): void {
    this.engines.set(engine.engine_id, engine);
  }

  setActive(engine_id: string): void {
    if (!this.engines.has(engine_id)) {
      throw new Error(
        `PluggableDecisionEngineHost: cannot setActive unknown engine_id=${engine_id}`,
      );
    }
    this.activeId = engine_id;
  }

  getActiveId(): string {
    return this.activeId;
  }

  getBaselineId(): string {
    return this.baselineId;
  }

  listEngineIds(): string[] {
    return [...this.engines.keys()];
  }

  getEngine(engine_id: string): DecisionEngine | undefined {
    return this.engines.get(engine_id);
  }

  async evaluate(req: DecisionRequest): Promise<DecisionResult> {
    const active = this.engines.get(this.activeId);
    if (!active) {
      throw new Error(
        `PluggableDecisionEngineHost: active engine missing id=${this.activeId}`,
      );
    }

    let primary: DecisionResult;
    try {
      primary = await active.evaluate(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.fallback(req, {
        kind: "DecisionResult",
        engine_id: active.engine_id,
        decision_id: req.decision_id,
        status: "abstain",
        reason: `Active engine threw: ${msg}`,
        abstain_reason: "ENGINE_STUB",
        limitations: ["V2-INT-02 host catch → baseline fallback"],
      });
    }

    const shouldFallback =
      this.activeId !== this.baselineId &&
      (primary.status === "abstain" || primary.status === "blocked") &&
      primary.abstain_reason !== undefined &&
      this.fallbackAbstainReasons.has(primary.abstain_reason);

    if (shouldFallback) {
      return this.fallback(req, primary);
    }

    return {
      ...primary,
      limitations: [
        ...primary.limitations,
        `pluggable_active=${this.activeId}`,
        `pluggable_baseline=${this.baselineId}`,
      ],
    };
  }

  private async fallback(
    req: DecisionRequest,
    primary: DecisionResult,
  ): Promise<DecisionResult> {
    const baseline = this.engines.get(this.baselineId);
    if (!baseline) {
      return {
        ...primary,
        limitations: [
          ...primary.limitations,
          "pluggable_fallback_failed=missing_baseline",
        ],
      };
    }
    const secondary = await baseline.evaluate(req);
    return {
      ...secondary,
      limitations: [
        ...secondary.limitations,
        `pluggable_fallback_from=${primary.engine_id}`,
        `pluggable_fallback_reason=${primary.abstain_reason ?? primary.status}`,
        `pluggable_active_was=${this.activeId}`,
        `pluggable_baseline=${this.baselineId}`,
        `primary_reason=${primary.reason}`,
      ],
    };
  }
}
