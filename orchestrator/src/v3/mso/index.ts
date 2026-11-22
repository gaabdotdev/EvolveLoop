export { MSO_STATES, MSO_TRANSITIONS, canTransitionMso, isMsoState } from "./states.js";
export type { MsoState } from "./states.js";
export { MsoError } from "./errors.js";

/** V3-ORCH-05 — Seeded PBT / fuzz helpers for MSO transitions + fencing. */
export {
  PBT_FUZZ_SCHEMA_VERSION,
  PBT_DEFAULT_SEED,
  createSeededRng,
  pickIndex,
  pickOne,
  enumerateLegalEdges,
  enumerateIllegalEdges,
  sampleTransitionPair,
  sampleLegalWalk,
  sampleIllegalSuccessor,
  sampleFencingStealChain,
  transitionOracle,
  isStaleFencingToken,
} from "./pbt-fuzz.js";
export type {
  SeededRng,
  MsoEdge,
  TransitionSample,
  FencingScenario,
} from "./pbt-fuzz.js";

export {
  MSO_TASK_STATES,
  NO_AUTO_RETRY_STATES,
  isMsoTaskState,
  mayAutoRetryTask,
} from "./task-states.js";
export type { MsoTaskState } from "./task-states.js";

export {
  FAILURE_BUCKETS,
  CIRCUIT_BREAKER_MAX_ATTEMPTS,
  INFRA_COOLDOWN_MS_DEFAULT,
  classifyFailure,
  burnsTaskAttempt,
  createCircuitBreaker,
  recordCircuitFailure,
  applyCircuitFailure,
  isInfraCooldownActive,
  canAttempt,
} from "./failure.js";
export type { FailureBucket, ClassifiableFailure, CircuitBreakerState } from "./failure.js";

export { topologicalOrder, assertStrictlyDisjoint, pathsOverlap } from "./topo.js";
export type { TopoTask } from "./topo.js";

/** V3-ORCH-02 — Dynamic DAG mutation proposals + deterministic MSO validation. */
export {
  proposeDagMutation,
  validateMutationDeterministic,
  defaultBudgetPolicy,
  defaultPermissionPolicy,
  DYNAMIC_DAG_SCHEMA_VERSION,
  DynamicDagError,
} from "../task-graph/dynamic-dag.js";
export type {
  DagMutationProposal,
  DagMutationOp,
  DagMutationValidationResult,
  DagMutationBudgetPolicy,
  DagMutationPermissionPolicy,
  MutableDagNode,
  MutationRejectCode,
} from "../task-graph/dynamic-dag.js";

/** V3-ORCH-03 — Ephemeral Sub-MSOs with attenuated caps + inherited budget. */
export {
  spawnSubMso,
  spawnNestedSubMso,
  attenuateCapabilities,
  capabilitiesAreSubset,
  enforceCapability,
  enforceSpend,
  assertCapability,
  assertSpend,
  terminateSubMso,
  remainingTokens,
  SubMsoError,
  SUB_MSO_SCHEMA_VERSION,
} from "./sub-mso.js";
export type {
  MsoCapability,
  SubMsoBudget,
  SpawnSubMsoOptions,
  SubMsoHandle,
  SubMsoRejectCode,
  SubMsoEnforceResult,
} from "./sub-mso.js";

export {
  isPgidAlive,
  worktreeHasDiff,
  decideReconcile,
  reconcileWorkOnBoot,
  assertNotBlindRetry,
} from "./boot-reconciler.js";
export type {
  ReconcileTaskInput,
  ReconcileDecision,
  BootReconcileReport,
} from "./boot-reconciler.js";

/** V2-ORCH-03: UNKNOWN path → saga compensations (implemented under idempotency/). */
export {
  reconcileWorkOnBootWithSaga,
  applyUnknownSagaCompensations,
  Saga,
  SagaRegistry,
} from "../idempotency/saga.js";
export type {
  SagaStep,
  SagaCompensationReport,
  UnknownSagaApplyReport,
  BootReconcileWithSagaReport,
} from "../idempotency/saga.js";

export { ensureTaskWorktree, executeTaskGraph } from "./worktree-executor.js";
export type {
  ExecutionMode,
  ExecutableTask,
  TaskRunContext,
  TaskRunResult,
  TaskExecutionRecord,
  TaskGraphExecutionReport,
} from "./worktree-executor.js";

export { receiveInboxMessage, listInbox } from "./inbox-runtime.js";
export type { InboxKind, InboxReceiveInput } from "./inbox-runtime.js";

export {
  MSO_SYMBOL_MAP_STATES,
  isMsoSymbolMapState,
  requiresSymbolMap,
  buildMsoSymbolContext,
  serializeMsoSymbolContext,
  guardMsoContextAgainstFullFiles,
  assertNoFullFileInMsoContext,
  prepareMsoAnalyzingPayload,
} from "./analyzing-context.js";
export type {
  MsoSymbolMapState,
  MsoSymbolContext,
  BuildMsoSymbolContextInput,
  FullFileGuardMode,
  FullFileGuardResult,
} from "./analyzing-context.js";
