/**
 * V5-M02 — Agent Orchestration contracts (foundation slice).
 * Capability honesty + deterministic scheduler + handoff/replace over Work/Attempt.
 * ACP server is deferred — see docs/v5/M02/LIMITATION-acp-deferred.md.
 */

export {
  discoverCapabilityProfile,
  listCapabilityProfiles,
  adapterSatisfiesCapabilities,
  toHonestyLevel,
  type AdapterCapabilityProfile,
  type CapabilityEntry,
  type CapabilityHonestyLevel,
} from "./capability-profile.js";

export {
  selectExecutor,
  type ExecutorCandidate,
  type ExecutorSelectionRequest,
  type ExecutorSelectionResult,
  type ExecutorRejection,
} from "./scheduler.js";

export {
  replaceAgentPreservingWork,
  type ReplaceViaHandoffInput,
  type ReplaceViaHandoffResult,
} from "./handoff-replace.js";
