/**
 * V2-EVOL-01 / V3-EVOL-01 — Evolution Pipeline (observation-first + Shadow Replay).
 */

export {
  EvolutionPipeline,
  beneficialBattery,
  regressionBattery,
  evaluateAgainstBaseline,
  SHADOW_REPLAY_ROLLBACK_COMMAND,
  SHADOW_REPLAY_SCHEMA_VERSION,
  type ReworkSignal,
  type PassEvent,
  type EvolutionObservation,
  type CandidateProposalStatus,
  type CandidateProposal,
  type ValidateDecision,
  type ValidateCandidateResult,
  type BatteryResult,
  type RunBattery,
  type ReplayMetrics,
  type HistoricalEvent,
  type ShadowReplayScore,
  type ShadowReplayDecision,
  type ShadowReplayCandidateResult,
  type ShadowRollbackResult,
  type PromoteToProductionResult,
  type ShadowReplayReport,
  type EvolutionPipelineOptions,
} from "./pipeline.js";
