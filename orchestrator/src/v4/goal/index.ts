/**
 * M01 Goal Compiler — public surface.
 * Import contracts only from `orchestrator/src/v4/contracts/`.
 */

export { allocateId } from "./ids.js";
export {
  UNTRUSTED_INTENT_SOURCES,
  fieldClassForSource,
  markText,
  isUntrusted,
  type IntentSourceKind,
  type IntakeFieldClass,
  type MarkedText,
  type IntentConstraintDraft,
  type IntentCriterionDraft,
  type IntentIngest,
} from "./intent.js";
export { detectIntentIssues, constraintKindConflict, type Contradiction, type Detection } from "./detect.js";
export { compileIntent, blockingQuestions, type CompileInput, type CompileResult, type ClarifyingQuestion } from "./compiler.js";
export {
  actorMayVersionGoal,
  autonomyRaised,
  mandatoryCriteriaWeakened,
  policyGateRequired,
  assertRevisionChain,
  authorizeGoalVersion,
  type VersioningRejection,
  type VersioningAllowance,
} from "./versioning.js";
