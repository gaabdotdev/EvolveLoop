/**
 * V2-INT-03 — Agent Intelligence Profiles (observational routing).
 * Distinct from agent-registry (live instance lifecycle).
 */

export type {
  MetricHonesty,
  ObservedMetric,
  EvidenceHonesty,
  AgentRunEvidence,
  AgentIntelligenceProfile,
  ProfileStoreSnapshot,
  IntelligenceRouteMode,
  IntelligenceRouteRequest,
  ScoredAgentCandidate,
  IntelligenceRouteDecision,
  StaticRouteDelta,
} from "./types.js";

export {
  computeIntelligenceScore,
  observed,
  type ScoreComponents,
} from "./score.js";

export {
  AgentProfileStore,
  AgentProfileStoreError,
  recomputeProfileFromEvidence,
  reportedEvidence,
  unavailableFieldsEvidence,
} from "./store.js";

export {
  routeByIntelligence,
  compareToStaticRoute,
  staticRouteAgent,
} from "./router.js";
