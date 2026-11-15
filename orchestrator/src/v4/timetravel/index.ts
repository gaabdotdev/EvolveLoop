/**
 * M05 Time Travel, Replay & Fork — public surface.
 * Import contracts only from `orchestrator/src/v4/contracts/`.
 */

export { TimeTravelService } from "./engine.js";
export { inspectWork } from "./inspect.js";
export { forkWork, inheritedRetry } from "./fork.js";
export { replayStep } from "./replay.js";
export { TimeTravelError, TIMETRAVEL_ERROR } from "./errors.js";
export {
  REPLAY_IS_ABSOLUTE_DETERMINISM,
  REPLAY_DETERMINISM_CLAIM,
  EXACTLY_ONCE_CLAIMED,
  HASH_CHAIN_IS_NON_REPUDIATION,
  FORK_INHERITS,
} from "./guarantees.js";
export { M05_EVENT_TYPES, allowlistM05Payload, assertNoControlFields } from "./payloads.js";
export type { M05EventType, WorkForkedPayload, ReplayStartedPayload } from "./payloads.js";
export { draftM05Event } from "./events.js";
export { cloneGoalForFork, rebuildForkSnapshot } from "./projection.js";
export { REPLAY_MODES } from "./types.js";
export type {
  Clock,
  ReplayMode,
  ForkEffectLedger,
  TimeTravelDeps,
  InspectQuery,
  InspectionView,
  TimelineEntry,
  ReferencedArtifact,
  ForkRequest,
  ForkResult,
  InheritedEffect,
  ForkAuthorizationIsolation,
  CapturedIO,
  ReplayRequest,
  ReplayResult,
  ForkCompare,
} from "./types.js";
