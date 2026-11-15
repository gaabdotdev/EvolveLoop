/**
 * M04 — Capsule, Handoff & Recovery (V4.1 Continuity).
 *
 * Public surface implements CapsuleServicePort. Import contracts only from
 * `orchestrator/src/v4/contracts/`. Wave 2 engines are composed via ports.
 */

export { CapsuleService } from "./service.js";
export { recoverAtVerifiedCheckpoint } from "./recovery.js";
export { handoffAccept } from "./handoff.js";
export { InMemoryReplayStore, FileReplayStore } from "./replay-store.js";
export type { ReplayStore, ReplayRecord } from "./replay-store.js";
export { signerFromHandle } from "./signing.js";
export { parseKnownFields, executorContextFromParsed, assertRefsNotMaterial } from "./context.js";
export { refsOnly, rederiveGrantRefs } from "./grants.js";
export { newCapsuleId, replayIdFor } from "./ids.js";
export { ContinuityError, CapsuleVerifyFailed, CONTINUITY_ERROR } from "./errors.js";
export {
  MAX_CAPSULE_BYTES,
  DEFAULT_NOT_PRESERVED,
  CONTINUITY_ACTOR_ID,
} from "./types.js";
export type {
  CapsuleSigner,
  CapsuleKeyLookup,
  CapsuleLeaseBindPort,
  CapsuleServiceOptions,
  DelegableGrantSource,
  TombstoneView,
  ConformanceLookup,
  BoundWorkState,
  ContinuityRecovery,
  HandoffResult,
} from "./types.js";
