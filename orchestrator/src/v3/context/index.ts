export type { ContextView, ContextViewRole, ContextViewSection } from "./types.js";
export { roleFromAgentRole } from "./types.js";
export { buildContextView, type BuildContextViewInput } from "./views.js";
export {
  compactContextView,
  reinjectCompactedView,
  DEFAULT_LOSS_CRITERIA,
  type CompactedContextView,
  type CompactionLossCriteria,
  type ReinjectResult,
} from "./compaction.js";
export { measureCompactionSavings, type CompactionSavingsReport } from "./savings.js";
