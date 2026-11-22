/**
 * V2-EVOL-01 / V3-EVOL-01 — Evolution Pipeline (observation-first + Shadow Replay).
 *
 * Collects rework_signals / pass_events, proposes versioned skill candidates
 * linked to V1 Skill-to-Code crystallizer when the parent skill is crystallized.
 * Never auto-applies — candidates stay `proposed` until validateCandidate.
 *
 * V3-EVOL-01: shadowReplay(candidates, historicalEvents) is the production gate —
 * no candidate enters production without beating the baseline on historical replay,
 * and every promotion has a single-command rollback.
 */

import { createHash, randomUUID } from "node:crypto";
import type { CrystallizerRegistry, CrystallizedScript } from "../token-economy/crystallizer.js";

/** Observation: rework pressure on a skill / pattern. */
export interface ReworkSignal {
  kind: "rework_signal";
  /** Parent skill / crystallizer pattern id. */
  skill_id: string;
  /** Absolute or incremental rework count for this observation. */
  rework_count: number;
  task_id?: string;
  reason?: string;
  observed_at?: string;
}

/** Observation: a verified / true-full pass for a skill. */
export interface PassEvent {
  kind: "pass_event";
  skill_id: string;
  task_id?: string;
  true_full_pass?: boolean;
  observed_at?: string;
}

export type EvolutionObservation = ReworkSignal | PassEvent;

/** Proposal status before / after explicit validation — never silently applied. */
export type CandidateProposalStatus = "proposed" | "accepted" | "rejected";

export interface CandidateProposal {
  candidate_id: string;
  /** Monotonic skill-improvement version (e.g. v2, v3). */
  version: string;
  /** Diff text or opaque script/ref for the proposed improvement. */
  diff_or_script_ref: string;
  parent_skill_id: string;
  status: CandidateProposalStatus;
  /** Present when parent skill is crystallized in the V1 registry. */
  crystallizer_pattern_id?: string;
  /** Snapshot of crystallized script body at proposal time (audit link). */
  crystallizer_script_ref?: string;
  observation_ids: string[];
  rework_score: number;
  rationale: string;
  created_at: string;
}

export type ValidateDecision = "accept" | "reject";

export interface ValidateCandidateResult {
  decision: ValidateDecision;
  /** Always present — how to revert if accept later fails or reject keeps prior. */
  rollback_plan: string;
  candidate_id: string;
  /** Candidate after status update (still not applied to crystallizer). */
  candidate: CandidateProposal;
  battery: BatteryResult;
}

/** Mockable validation battery — beneficial vs regression. */
export interface BatteryResult {
  /** True when the candidate improves the skill under the battery. */
  beneficial: boolean;
  /** True when the candidate introduces a regression. */
  regression: boolean;
  details?: string;
}

export type RunBattery = (
  candidate: CandidateProposal,
) => BatteryResult | Promise<BatteryResult>;

/** Per-event metrics under baseline or a shadowed candidate. */
export interface ReplayMetrics {
  success: boolean;
  /** Token / compute cost attributed to this event. */
  cost_tokens: number;
  /** True when the outcome recorded a security incident. */
  security_incident: boolean;
}

/**
 * Historical event used by Shadow Replay.
 * `baseline` is the production outcome; `projections[candidate_id]` is the
 * shadowed outcome if that candidate were applied (absent → same as baseline).
 */
export interface HistoricalEvent {
  event_id: string;
  observed_at?: string;
  skill_id?: string;
  baseline: ReplayMetrics;
  projections?: Record<string, ReplayMetrics>;
}

/** Aggregate score over a historical corpus. */
export interface ShadowReplayScore {
  success_rate: number;
  avg_cost_tokens: number;
  security_incidents: number;
  events_scored: number;
}

export type ShadowReplayDecision = "pass" | "reject";

export interface ShadowReplayCandidateResult {
  candidate_id: string;
  score: ShadowReplayScore;
  /** Strictly better than baseline without security/cost regression. */
  beats_baseline: boolean;
  decision: ShadowReplayDecision;
  reject_reasons: string[];
  /** Only true when decision=pass — required before production promotion. */
  production_eligible: boolean;
  candidate: CandidateProposal;
}

export interface ShadowRollbackResult {
  rolled_back: boolean;
  /** The single rollback command (always the same string). */
  rollback_command: string;
  restored_candidate_id: string | null;
  cleared_candidate_id: string | null;
  detail: string;
}

export interface PromoteToProductionResult {
  promoted: boolean;
  candidate_id: string;
  previous_production_candidate_id: string | null;
  rollback_command: string;
  detail: string;
}

export interface ShadowReplayReport {
  kind: "ShadowReplayReport";
  schema_version: "1";
  baseline: ShadowReplayScore;
  results: ShadowReplayCandidateResult[];
  passed: ShadowReplayCandidateResult[];
  rejected: ShadowReplayCandidateResult[];
  /** Single-command rollback string — always present. */
  rollback_command: string;
  /** Execute production rollback in one call. */
  rollback: () => ShadowRollbackResult;
}

/** Canonical one-command rollback for Shadow Replay production promotions. */
export const SHADOW_REPLAY_ROLLBACK_COMMAND = "evolution.rollbackProduction()";

export const SHADOW_REPLAY_SCHEMA_VERSION = "1" as const;

export interface EvolutionPipelineOptions {
  /** Optional V1 crystallizer — used only for link metadata, never mutated by observe. */
  crystallizer?: CrystallizerRegistry;
  /**
   * Minimum total rework_count across rework_signals for a skill before proposing.
   * Default 3 ("rework alto").
   */
  reworkThreshold?: number;
  /**
   * Minimum number of observations (any kind) required for a skill.
   * Default 1 — empty observe() still yields zero proposals.
   */
  minObservations?: number;
  /** Clock / id hooks for tests. */
  now?: () => string;
  idFactory?: () => string;
}

interface SkillObservationBucket {
  skill_id: string;
  observations: EvolutionObservation[];
  observation_ids: string[];
  rework_score: number;
  pass_count: number;
}

const DEFAULT_REWORK_THRESHOLD = 3;
const DEFAULT_MIN_OBSERVATIONS = 1;

function observationId(obs: EvolutionObservation, index: number): string {
  const base = [
    obs.kind,
    obs.skill_id,
    obs.task_id ?? "",
    obs.kind === "rework_signal" ? String(obs.rework_count) : String(obs.true_full_pass ?? ""),
    obs.observed_at ?? "",
    String(index),
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}

function nextVersion(existing: CandidateProposal[]): string {
  let max = 1;
  for (const c of existing) {
    const m = /^v(\d+)$/i.exec(c.version);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `v${max + 1}`;
}

function rollbackPlan(candidate: CandidateProposal): string {
  return `revert_to_parent:${candidate.parent_skill_id}@prior_of_${candidate.version};drop_candidate:${candidate.candidate_id}`;
}

function scoreCorpus(
  events: HistoricalEvent[],
  candidateId: string | null,
): ShadowReplayScore {
  if (events.length === 0) {
    return {
      success_rate: 0,
      avg_cost_tokens: 0,
      security_incidents: 0,
      events_scored: 0,
    };
  }

  let successes = 0;
  let costSum = 0;
  let securityIncidents = 0;

  for (const ev of events) {
    const metrics =
      candidateId && ev.projections?.[candidateId]
        ? ev.projections[candidateId]!
        : ev.baseline;
    if (metrics.success) successes += 1;
    costSum += Number.isFinite(metrics.cost_tokens)
      ? Math.max(0, metrics.cost_tokens)
      : 0;
    if (metrics.security_incident) securityIncidents += 1;
  }

  const n = events.length;
  return {
    success_rate: successes / n,
    avg_cost_tokens: costSum / n,
    security_incidents: securityIncidents,
    events_scored: n,
  };
}

/**
 * Strict gate: candidate must *superar* baseline.
 * - Primary: higher success_rate, or equal success with strictly lower cost.
 * - No security regression (incidents must not increase).
 * - No cost regression when claiming a success improvement.
 * Neutral (identical score) → reject. Subtle security/cost regression → reject.
 */
export function evaluateAgainstBaseline(
  baseline: ShadowReplayScore,
  candidate: ShadowReplayScore,
): { beats_baseline: boolean; reject_reasons: string[] } {
  const reasons: string[] = [];

  if (candidate.events_scored === 0 || baseline.events_scored === 0) {
    reasons.push("empty_historical_corpus");
    return { beats_baseline: false, reject_reasons: reasons };
  }

  if (candidate.security_incidents > baseline.security_incidents) {
    reasons.push("security_regression");
  }
  if (candidate.avg_cost_tokens > baseline.avg_cost_tokens) {
    reasons.push("cost_regression");
  }

  const betterSuccess = candidate.success_rate > baseline.success_rate;
  const equalSuccess = candidate.success_rate === baseline.success_rate;
  const betterCost = candidate.avg_cost_tokens < baseline.avg_cost_tokens;

  if (!betterSuccess && !(equalSuccess && betterCost)) {
    if (equalSuccess && !betterCost) {
      reasons.push("does_not_superar_baseline");
    } else if (candidate.success_rate < baseline.success_rate) {
      reasons.push("success_regression");
    } else {
      reasons.push("does_not_superar_baseline");
    }
  }

  const beats =
    reasons.length === 0 &&
    (betterSuccess || (equalSuccess && betterCost));

  return { beats_baseline: beats, reject_reasons: reasons };
}

/**
 * Observation-first evolution pipeline.
 * Proposes versioned candidates; does not mutate CrystallizerRegistry scripts.
 * Production promotion requires Shadow Replay pass + explicit promote.
 */
export class EvolutionPipeline {
  private readonly crystallizer?: CrystallizerRegistry;
  private readonly reworkThreshold: number;
  private readonly minObservations: number;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  /** All proposals ever emitted (audit / version bump). */
  private readonly proposals = new Map<string, CandidateProposal>();
  /** Accumulated observations by skill (for multi-call observe). */
  private readonly buckets = new Map<string, SkillObservationBucket>();
  /** Candidate ids that passed the latest Shadow Replay gate. */
  private readonly shadowPassed = new Set<string>();
  /** Currently promoted production candidate (null = baseline parent skills). */
  private productionCandidateId: string | null = null;
  /** Prior production pointer for one-command rollback. */
  private priorProductionCandidateId: string | null = null;

  constructor(opts: EvolutionPipelineOptions = {}) {
    this.crystallizer = opts.crystallizer;
    this.reworkThreshold = opts.reworkThreshold ?? DEFAULT_REWORK_THRESHOLD;
    this.minObservations = opts.minObservations ?? DEFAULT_MIN_OBSERVATIONS;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.idFactory = opts.idFactory ?? (() => randomUUID());
  }

  /** Snapshot of proposals (including accepted/rejected). */
  listProposals(): CandidateProposal[] {
    return [...this.proposals.values()];
  }

  getProposal(candidateId: string): CandidateProposal | undefined {
    return this.proposals.get(candidateId);
  }

  /**
   * Ingest observations and return newly proposed candidates only.
   * Empty input or insufficient rework → [].
   * Status of every returned candidate is always `proposed` (no auto-apply).
   */
  observe(observations: EvolutionObservation[]): CandidateProposal[] {
    if (observations.length === 0) {
      return [];
    }

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i]!;
      this.ingestOne(obs, observationId(obs, this.totalObservationCount() + i));
    }

    const emitted: CandidateProposal[] = [];
    for (const bucket of this.buckets.values()) {
      const candidate = this.maybePropose(bucket);
      if (candidate) emitted.push(candidate);
    }
    return emitted;
  }

  /**
   * Explicit validation gate. Mockable battery decides accept vs reject.
   * Never writes into CrystallizerRegistry — caller must apply separately if desired.
   */
  async validateCandidate(
    candidate: CandidateProposal,
    runBattery: RunBattery,
  ): Promise<ValidateCandidateResult> {
    const stored = this.proposals.get(candidate.candidate_id) ?? candidate;
    if (stored.status !== "proposed") {
      return {
        decision: stored.status === "accepted" ? "accept" : "reject",
        rollback_plan: rollbackPlan(stored),
        candidate_id: stored.candidate_id,
        candidate: stored,
        battery: {
          beneficial: stored.status === "accepted",
          regression: stored.status === "rejected",
          details: "already_validated",
        },
      };
    }

    const battery = await Promise.resolve(runBattery(stored));
    const plan = rollbackPlan(stored);

    let decision: ValidateDecision;
    let status: CandidateProposalStatus;

    if (battery.regression || !battery.beneficial) {
      decision = "reject";
      status = "rejected";
    } else {
      decision = "accept";
      status = "accepted";
    }

    const updated: CandidateProposal = { ...stored, status };
    this.proposals.set(updated.candidate_id, updated);

    return {
      decision,
      rollback_plan: plan,
      candidate_id: updated.candidate_id,
      candidate: updated,
      battery,
    };
  }

  /**
   * V3-EVOL-01 Shadow Replay gate.
   * Replays historical events under baseline vs each candidate projection.
   * Only candidates that *superam* baseline (no security/cost regression) pass.
   * Does not auto-promote — use promoteToProduction after a pass.
   */
  shadowReplay(
    candidates: CandidateProposal[],
    historicalEvents: HistoricalEvent[],
  ): ShadowReplayReport {
    const baseline = scoreCorpus(historicalEvents, null);
    const results: ShadowReplayCandidateResult[] = [];

    // Refresh eligibility for this corpus evaluation (re-run is authoritative).
    for (const c of candidates) {
      this.shadowPassed.delete(c.candidate_id);
    }

    for (const candidate of candidates) {
      // Keep proposal book for promote/rollback audit without mutating status here.
      if (!this.proposals.has(candidate.candidate_id)) {
        this.proposals.set(candidate.candidate_id, { ...candidate });
      }

      const score = scoreCorpus(historicalEvents, candidate.candidate_id);
      const { beats_baseline, reject_reasons } = evaluateAgainstBaseline(
        baseline,
        score,
      );
      const decision: ShadowReplayDecision = beats_baseline ? "pass" : "reject";

      if (decision === "pass") {
        this.shadowPassed.add(candidate.candidate_id);
      }

      results.push({
        candidate_id: candidate.candidate_id,
        score,
        beats_baseline,
        decision,
        reject_reasons,
        production_eligible: decision === "pass",
        candidate: this.proposals.get(candidate.candidate_id) ?? candidate,
      });
    }

    const passed = results.filter((r) => r.decision === "pass");
    const rejected = results.filter((r) => r.decision === "reject");

    return {
      kind: "ShadowReplayReport",
      schema_version: SHADOW_REPLAY_SCHEMA_VERSION,
      baseline,
      results,
      passed,
      rejected,
      rollback_command: SHADOW_REPLAY_ROLLBACK_COMMAND,
      rollback: () => this.rollbackProduction(),
    };
  }

  /**
   * Explicit production promotion — refused unless Shadow Replay passed.
   * Never silently mutates CrystallizerRegistry.
   */
  promoteToProduction(candidateId: string): PromoteToProductionResult {
    const cmd = SHADOW_REPLAY_ROLLBACK_COMMAND;
    if (!this.shadowPassed.has(candidateId)) {
      return {
        promoted: false,
        candidate_id: candidateId,
        previous_production_candidate_id: this.productionCandidateId,
        rollback_command: cmd,
        detail: "shadow_replay_required",
      };
    }

    const prior = this.productionCandidateId;
    this.priorProductionCandidateId = prior;
    this.productionCandidateId = candidateId;

    return {
      promoted: true,
      candidate_id: candidateId,
      previous_production_candidate_id: prior,
      rollback_command: cmd,
      detail: "promoted_after_shadow_replay",
    };
  }

  /**
   * One-command rollback of the last Shadow Replay production promotion.
   * Restores the prior production pointer (or clears to baseline).
   */
  rollbackProduction(): ShadowRollbackResult {
    const cmd = SHADOW_REPLAY_ROLLBACK_COMMAND;
    if (this.productionCandidateId === null) {
      return {
        rolled_back: false,
        rollback_command: cmd,
        restored_candidate_id: this.priorProductionCandidateId,
        cleared_candidate_id: null,
        detail: "nothing_in_production",
      };
    }

    const cleared = this.productionCandidateId;
    const restored = this.priorProductionCandidateId;
    this.productionCandidateId = restored;
    this.priorProductionCandidateId = null;

    return {
      rolled_back: true,
      rollback_command: cmd,
      restored_candidate_id: restored,
      cleared_candidate_id: cleared,
      detail: restored
        ? `restored:${restored};cleared:${cleared}`
        : `restored:baseline;cleared:${cleared}`,
    };
  }

  getProductionCandidateId(): string | null {
    return this.productionCandidateId;
  }

  hasShadowReplayPass(candidateId: string): boolean {
    return this.shadowPassed.has(candidateId);
  }

  /**
   * Record that a recurrent task was crystallized — observation only.
   * Does not propose by itself; subsequent observe() with high rework may propose.
   */
  recordCrystallizerObservation(
    patternId: string,
    script?: CrystallizedScript,
  ): { recorded: true; crystallized: boolean; pattern_id: string } {
    const fromReg = this.crystallizer?.get(patternId)?.script;
    const crystallized = Boolean(script?.validated ?? fromReg?.validated);
    // Seed a pass_event so the skill appears in buckets without proposing.
    this.ingestOne(
      {
        kind: "pass_event",
        skill_id: patternId,
        true_full_pass: crystallized,
        observed_at: this.now(),
      },
      observationId(
        {
          kind: "pass_event",
          skill_id: patternId,
          true_full_pass: crystallized,
        },
        this.totalObservationCount(),
      ),
    );
    return { recorded: true, crystallized, pattern_id: patternId };
  }

  private totalObservationCount(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.observations.length;
    return n;
  }

  private ingestOne(obs: EvolutionObservation, id: string): void {
    const bucket =
      this.buckets.get(obs.skill_id) ??
      ({
        skill_id: obs.skill_id,
        observations: [],
        observation_ids: [],
        rework_score: 0,
        pass_count: 0,
      } satisfies SkillObservationBucket);

    bucket.observations.push(obs);
    bucket.observation_ids.push(id);

    if (obs.kind === "rework_signal") {
      const count = Number.isFinite(obs.rework_count) ? Math.max(0, obs.rework_count) : 0;
      bucket.rework_score += count;
    } else {
      bucket.pass_count += 1;
    }

    this.buckets.set(obs.skill_id, bucket);
  }

  private maybePropose(bucket: SkillObservationBucket): CandidateProposal | null {
    // Observation-first: insufficient signal → no proposal.
    if (bucket.observations.length < this.minObservations) {
      return null;
    }
    if (bucket.rework_score < this.reworkThreshold) {
      return null;
    }

    // Avoid duplicate proposed candidates for the same skill+rework fingerprint.
    const fingerprint = createHash("sha256")
      .update(
        [
          bucket.skill_id,
          String(bucket.rework_score),
          bucket.observation_ids.join(","),
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 16);

    for (const existing of this.proposals.values()) {
      if (
        existing.parent_skill_id === bucket.skill_id &&
        existing.status === "proposed" &&
        existing.observation_ids.join(",") === bucket.observation_ids.join(",")
      ) {
        return null;
      }
    }

    const priorForSkill = [...this.proposals.values()].filter(
      (p) => p.parent_skill_id === bucket.skill_id,
    );
    const version = nextVersion(priorForSkill);

    const crystallized = this.crystallizer?.get(bucket.skill_id)?.script;
    const baseScript =
      crystallized?.script ?? `skill:${bucket.skill_id}:baseline`;
    const diff_or_script_ref = `${baseScript}#improve:${fingerprint}`;

    const candidate: CandidateProposal = {
      candidate_id: `evol-${this.idFactory()}`,
      version,
      diff_or_script_ref,
      parent_skill_id: bucket.skill_id,
      status: "proposed",
      crystallizer_pattern_id: crystallized ? bucket.skill_id : undefined,
      crystallizer_script_ref: crystallized?.script,
      observation_ids: [...bucket.observation_ids],
      rework_score: bucket.rework_score,
      rationale: `High rework (score=${bucket.rework_score} ≥ ${this.reworkThreshold}) on skill ${bucket.skill_id}; propose versioned improvement without auto-apply`,
      created_at: this.now(),
    };

    this.proposals.set(candidate.candidate_id, candidate);
    return candidate;
  }
}

/** Fixture helpers for tests / offline batteries. */
export function beneficialBattery(): BatteryResult {
  return { beneficial: true, regression: false, details: "fixture_beneficial" };
}

export function regressionBattery(): BatteryResult {
  return { beneficial: false, regression: true, details: "fixture_regression" };
}
