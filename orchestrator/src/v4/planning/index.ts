/**
 * M07 Dynamic Planning Engine — public surface.
 * Import contracts only from `orchestrator/src/v4/contracts/`.
 * Compose M01 command paths + M02 EventLedgerPort; do not rewrite those trees.
 */

export { PlanningEngine, defaultPlanningActor } from "./engine.js";
export { PLANNING_ERROR } from "./errors.js";
export { draftM07Event } from "./events.js";
export {
  ROUTING_BY_CAPABILITY_SCORE,
  PLAN_IS_PROPOSAL_UNTIL_ACCEPTED,
  HASH_CHAIN_IS_NON_REPUDIATION,
  PLANNER_MAY_SET_VERIFIED,
} from "./guarantees.js";
export {
  criticalPath,
  independentTaskIds,
  liveTasks,
  remainingCost,
  transitiveDependents,
  uncoveredMandatoryCriteria,
  validateProposedGraph,
} from "./graph.js";
export {
  M07_EVENT_TYPES,
  M07_FORBIDDEN_PAYLOAD_CONTROL_NAMES,
  allowlistM07Payload,
  assertNoControlFields,
  controlFieldIssues,
  isM07EventType,
} from "./payloads.js";
export type {
  M07EventType,
  PlanRevisedPayload,
  PlanTriggerKind,
  RemainingCostRecord,
  ChangeImpactRecord,
} from "./payloads.js";
export { buildInitialProposal, buildReplanProposal, fromTaskPlanInput } from "./propose.js";
export type {
  Clock,
  PlanningOk,
  PlanningRejected,
  PlanningResult,
  PlanningWorkCommands,
  PlanningDeps,
  ReplanTrigger,
  ProposeOptions,
  ProposedTask,
  PlanAnalysis,
  PlanProposal,
  AcceptedPlan,
} from "./types.js";
