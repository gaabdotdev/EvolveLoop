/**
 * M01 Work State — public surface.
 * Import contracts only from `orchestrator/src/v4/contracts/`.
 */

export {
  M01_EVENT_TYPES,
  F12_PAYLOAD_NAMES,
  allowlistPayload,
  payloadHasIgnoredF12,
  parseM01Payload,
  type M01EventType,
  type M01Payload,
  type WorkCreatedPayload,
  type WorkStateChangedPayload,
  type GoalContractVersionedPayload,
  type GoalContractAcceptedPayload,
  type TaskPlannedPayload,
  type TaskStateChangedPayload,
} from "./payloads.js";
export { draftM01Event } from "./drafts.js";
export { applyEvent, applyEvents, emptyProjection, type ProjectionIssue, type WorkProjection } from "./projector.js";
export { InMemoryWorkRepository, type WorkSnapshot } from "./repository.js";
export { writeWorkSnapshot, readWorkSnapshot } from "./persist.js";
export { IsolatedEventBuffer, type IsolatedClock } from "./isolated-buffer.js";
export {
  GoalWorkEngine,
  createIsolatedWorkEngine,
  type Clock,
  type CommandOk,
  type CommandRejected,
  type CommandResult,
  type TaskPlanInput,
  type GoalWorkEngineOptions,
} from "./engine.js";
export { progressForTaskState, executorMaySetTaskState, taskTransitionAllowed } from "./progress.js";
