/**
 * V2-INT-02 — Laya DecisionEngine adapter (optional live client + honest offline path).
 *
 * No mandatory Laya binary in CI. When the HTTP/local client is unavailable:
 * - offlineMode "abstain" (default) → maturity stub/experimental + ENGINE_STUB
 * - offlineMode "heuristic" → typed in-list scoring only (documented below; never invents ids)
 *
 * Offline heuristic (documented, deterministic):
 * 1. Normalize context + each candidate label/id to lowercase tokens (split on non-letters).
 * 2. Score = |tokens(context) ∩ tokens(label∪id)| / max(1, |tokens(label∪id)|).
 * 3. Feed scores into StrictRuntimeDecisionEngine (0% invention / allow-list filter).
 */

import {
  StrictRuntimeDecisionEngine,
  type DecisionCandidate,
  type DecisionEngine,
  type DecisionRequest,
  type DecisionResult,
  type RuntimeCandidateScorer,
  type ScoredCandidateId,
} from "./decision-engine.js";

/** Optional remote/local Laya probe + classify. Injected for tests; never required in CI. */
export interface LayaClient {
  /** True when a live Laya endpoint/binary can serve classify. */
  available(): Promise<boolean>;
  /**
   * Optional classify. Must return an id from req.candidates or abstain.
   * Out-of-list ids are ignored by the adapter (never selected).
   */
  classify?(
    req: DecisionRequest,
  ): Promise<
    | { status: "selected"; candidate_id: string; score?: number }
    | { status: "abstain"; reason?: string }
  >;
}

export type LayaOfflineMode = "abstain" | "heuristic";

export interface LayaDecisionEngineOptions {
  engine_id?: string;
  client?: LayaClient;
  /**
   * Behavior when client is missing/unavailable.
   * Default "abstain" keeps CI offline honest (ENGINE_STUB).
   */
  offlineMode?: LayaOfflineMode;
  /** minScore for heuristic path (default 0.15). */
  heuristicMinScore?: number;
}

function tokenize(text: string): Set<string> {
  const parts = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9àáâãäåæçèéêëìíîïñòóôõöùúûüýÿß]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return new Set(parts);
}

/** Documented offline scorer — only emits scores for ids present in `candidates`. */
export function layaHeuristicScore(
  candidates: readonly DecisionCandidate[],
  req: DecisionRequest,
): ScoredCandidateId[] {
  const ctx = tokenize(req.context);
  return candidates.map((c) => {
    const bag = tokenize(`${c.label} ${c.candidate_id}`);
    let hits = 0;
    for (const t of bag) {
      if (ctx.has(t)) hits += 1;
    }
    const denom = Math.max(1, bag.size);
    const score = hits / denom;
    return { candidate_id: c.candidate_id, score };
  });
}

/**
 * Realistic Laya adapter. Swap-compatible with DecisionEngine — MSO/Scheduler unchanged.
 */
export class LayaDecisionEngine implements DecisionEngine {
  readonly engine_id: string;
  private _maturity: "stub" | "experimental" | "stable" = "stub";
  private readonly client: LayaClient | undefined;
  private readonly offlineMode: LayaOfflineMode;
  private readonly heuristicEngine: StrictRuntimeDecisionEngine;
  private availabilityKnown = false;
  private lastAvailable = false;

  constructor(opts: LayaDecisionEngineOptions = {}) {
    this.engine_id = opts.engine_id ?? "laya";
    this.client = opts.client;
    this.offlineMode = opts.offlineMode ?? "abstain";
    this.heuristicEngine = new StrictRuntimeDecisionEngine({
      engine_id: `${this.engine_id}-heuristic`,
      policy: {
        minScore: opts.heuristicMinScore ?? 0.15,
        requireUniqueTop: true,
        allowBlocked: false,
      },
      scorer: layaHeuristicScore as RuntimeCandidateScorer,
    });
    this._maturity =
      this.client === undefined && this.offlineMode === "abstain"
        ? "stub"
        : "experimental";
  }

  get maturity(): "stub" | "experimental" | "stable" {
    return this._maturity;
  }

  /** Probe client once per evaluate (cached within call). */
  async probeAvailable(): Promise<boolean> {
    if (!this.client) {
      this.availabilityKnown = true;
      this.lastAvailable = false;
      return false;
    }
    try {
      this.lastAvailable = await this.client.available();
    } catch {
      this.lastAvailable = false;
    }
    this.availabilityKnown = true;
    return this.lastAvailable;
  }

  async evaluate(req: DecisionRequest): Promise<DecisionResult> {
    const available = await this.probeAvailable();

    if (available && this.client?.classify) {
      this._maturity = "experimental";
      try {
        const raw = await this.client.classify(req);
        const allow = new Set(req.candidates.map((c) => c.candidate_id));
        if (raw.status === "selected" && allow.has(raw.candidate_id)) {
          return {
            kind: "DecisionResult",
            engine_id: this.engine_id,
            decision_id: req.decision_id,
            status: "selected",
            selected_candidate_id: raw.candidate_id,
            reason: `Laya client selected ${raw.candidate_id}`,
            limitations: [
              "V2-INT-02 Laya live client",
              `availability_known=${this.availabilityKnown}`,
            ],
          };
        }
        if (raw.status === "selected" && !allow.has(raw.candidate_id)) {
          return {
            kind: "DecisionResult",
            engine_id: this.engine_id,
            decision_id: req.decision_id,
            status: "abstain",
            reason: "Laya client returned out-of-list id — rejected (0% invention)",
            abstain_reason: "POLICY_ABSTAIN",
            limitations: [
              "V2-INT-02 Laya live client",
              `rejected_id=${raw.candidate_id}`,
            ],
          };
        }
        const abstainReason =
          raw.status === "abstain" ? raw.reason : undefined;
        return {
          kind: "DecisionResult",
          engine_id: this.engine_id,
          decision_id: req.decision_id,
          status: "abstain",
          reason: abstainReason ?? "Laya client abstained",
          abstain_reason: "INSUFFICIENT_EVIDENCE",
          limitations: ["V2-INT-02 Laya live client"],
        };
      } catch (err) {
        // Fall through to offline path.
        const msg = err instanceof Error ? err.message : String(err);
        if (this.offlineMode === "heuristic") {
          const result = await this.heuristicEngine.evaluate(req);
          return {
            ...result,
            engine_id: this.engine_id,
            limitations: [
              ...result.limitations,
              "V2-INT-02 Laya client error → heuristic offline",
              `client_error=${msg}`,
            ],
          };
        }
        this._maturity = "stub";
        return {
          kind: "DecisionResult",
          engine_id: this.engine_id,
          decision_id: req.decision_id,
          status: "abstain",
          reason: `Laya client error: ${msg}`,
          abstain_reason: "ENGINE_STUB",
          limitations: [
            "V2-INT-02 Laya unavailable — honest ENGINE_STUB",
            "No mandatory Laya binary in CI offline",
          ],
        };
      }
    }

    if (this.offlineMode === "heuristic") {
      this._maturity = "experimental";
      const result = await this.heuristicEngine.evaluate(req);
      return {
        ...result,
        engine_id: this.engine_id,
        limitations: [
          ...result.limitations,
          "V2-INT-02 Laya offline heuristic (token overlap; never invents candidates)",
          "client_unavailable=true",
        ],
      };
    }

    this._maturity = "stub";
    return {
      kind: "DecisionResult",
      engine_id: this.engine_id,
      decision_id: req.decision_id,
      status: "abstain",
      reason:
        "Laya DecisionEngine client unavailable — offline abstain (ENGINE_STUB)",
      abstain_reason: "ENGINE_STUB",
      limitations: [
        "V2-INT-02 Laya adapter — no live endpoint/binary",
        "Set offlineMode=heuristic for typed offline scoring without invention",
        "Do not treat abstain as a selected action",
      ],
    };
  }
}
