/**
 * V5-M07 — Unified Experience (CLI/TUI Work-centric slice).
 */

export {
  EXPERIENCE_HELP_LAYERS,
  resolveExperienceMode,
  writeWorkspaceExperienceMode,
  workspaceConfigPath,
  type ExperienceMode,
  type ExperienceModePreference,
} from "./mode-preference.js";

export {
  readSharedWorkState,
  workStatusForTui,
  type WorkStateBridgeOpts,
  type WorkStateSnapshot,
} from "./work-state-bridge.js";
