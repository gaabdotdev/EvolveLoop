/**
 * V5-M01 Persistent Work Runtime — Work-first projections over existing stores.
 */

export {
  PersistentWorkRuntime,
  WorkRuntimeError,
  attemptStatusFromRunnerResult,
  type PersistentWorkRuntimeOpts,
} from "./runtime.js";

export type {
  Work,
  WorkGraphView,
  WorkLiveness,
  WorkAgentRef,
  WorkUxDualLabel,
  WorkOpenInput,
  WorkPauseInput,
  WorkListItem,
  WorkStatusSummary,
  Attempt,
  AttemptCreateInput,
  AttemptBindSessionInput,
  AttemptBindRunnerResultInput,
  AttemptExecutionMode,
  AttemptStatus,
} from "./types.js";

/** V5-M06 — re-export criteria + delivery projection under work-runtime facade. */
export {
  evaluateWorkCriteria,
  WorkCriteriaError,
} from "../verification/criteria.js";
export {
  getWorkDelivery,
  WorkDeliveryError,
} from "../verification/delivery-projection.js";
export type {
  WorkCriteriaEvaluation,
  DeliveryProjection,
} from "../verification/types.js";
