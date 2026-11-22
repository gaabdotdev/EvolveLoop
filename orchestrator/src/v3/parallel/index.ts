export {
  scheduleReadyTasks,
  listReadyTasks,
  type ParallelPolicy,
  type ParallelScheduleResult,
} from "./scheduler.js";

export {
  BackpressureController,
  applyBackpressure,
  computeBackpressureMax,
  rateLimitRatio,
  telemetryCritical,
  BACKPRESSURE_RATE_LOW,
  BACKPRESSURE_RATE_HIGH,
  BACKPRESSURE_VRAM_CRITICAL,
  BACKPRESSURE_CPU_CRITICAL,
  BACKPRESSURE_MEM_CRITICAL,
  BACKPRESSURE_STEP,
  type BackpressureBounds,
  type BackpressureSignal,
  type BackpressureDecision,
  type BackpressureAction,
  type BackpressureControllerState,
  type BackpressureControllerOptions,
  type LocalTelemetry,
} from "./backpressure.js";

export {
  tryReserveTaskScope,
  releaseTaskFileLocks,
  reconcileInProgressLocks,
  createOwnershipLedger,
  ownershipLedgerDir,
  taskScopePaths,
  pathsOverlap,
} from "./file-ownership-lock.js";

export {
  detectMergiraf,
  runMergirafMerge,
  type MergirafDetection,
  type MergirafMergeInput,
  type MergirafMergeResult,
} from "./mergiraf-adapter.js";

export {
  isAstMergeablePath,
  mergeDeclarationUnits,
  astAwareMerge,
  type AstMergeEngine,
  type AstMergeStatus,
  type AstMergeInput,
  type AstMergeResult,
} from "./ast-aware-merge.js";

export {
  MergeQueue,
  runIntegratedTests,
  type MergeQueueItemStatus,
  type MergeFileTriple,
  type MergeQueueEnqueueInput,
  type MergeQueueItem,
  type MergeMetrics,
  type IntegratedTestResult,
  type IntegratedTestRunner,
  type ProcessNextOptions,
  type ProcessNextResult,
} from "./merge-queue.js";

export {
  CRITICAL_PATH_SCHEMA_VERSION,
  computeCriticalPath,
  prefetchNext,
  prefetchArtifactPaths,
  isNodePrefetched,
  rankReadyNodes,
  simulateDagWallClock,
  readPrefetchStub,
  CriticalPathError,
  type CriticalPathPhase,
  type PrefetchArtifactKind,
  type CriticalPathNode,
  type CriticalPathDag,
  type CriticalPathResult,
  type PrefetchHookInput,
  type PrefetchArtifact,
  type PrefetchResult,
  type SchedulePolicy,
  type SimulateWallClockOptions,
  type SimulatedNodeTrace,
  type SimulateWallClockResult,
} from "./critical-path.js";

/** V3-ORCH-04 — Competitive Best-of-N (not V1 speculative-pipeline). */
export {
  BEST_OF_N_SCHEMA_VERSION,
  triggerBestOfN,
  admitBestOfN,
  assertBestOfNAdmission,
  isBlockedTask,
  isCriticallyBlocked,
  BestOfNError,
  type BlockedTask,
  type BlockedTaskCriticality,
  type BestOfNGate,
  type BestOfNHooks,
  type BestOfNExecutorContext,
  type BestOfNExecutorResult,
  type BestOfNValidator,
  type BestOfNValidateResult,
  type BestOfNExecutorTrace,
  type BestOfNReport,
  type BestOfNRejectCode,
  type BestOfNStatus,
  type BestOfNAdmission,
} from "./best-of-n.js";
