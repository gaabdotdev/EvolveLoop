export type {
  EngineeringStageId,
  StageStatus,
  StageRecord,
  EngineeringRun,
  EngineeringLoopResult,
} from "./types.js";
export { EngineeringWorkspace, walkRelFiles, WorkspaceError } from "./workspace.js";
export {
  EngineeringLoopService,
  type EngineeringLoopInput,
} from "./loop.js";
export {
  classifyHarness,
  buildHarnessMatrix,
  listDriverSummaries,
  type HarnessCapabilityClass,
  type HarnessMatrixEntry,
} from "./harness-matrix.js";
