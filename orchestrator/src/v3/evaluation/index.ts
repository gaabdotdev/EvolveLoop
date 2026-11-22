export { exploreRepository, type RepoExploration } from "./explore.js";
export { applyTaskSolution, type SolverResult } from "./solvers.js";
export {
  EvidenceStore,
  fingerprintWorkspace,
  type EvidenceRecord,
  type EvidenceKind,
} from "./evidence.js";
export {
  evaluateVerifiedTrueFullPass,
  type VerifiedPassContext,
  type VerifiedPassResult,
} from "./verified-pass.js";
export {
  IndependentReviewGate,
  IndependentReviewError,
  contractRequiresIndependentReview,
  type SubmitReviewInput,
  type IndependentReviewRecord,
  type IndependentReviewVerdict,
  type IndependentReviewPassTarget,
} from "./independent-review-gate.js";
export {
  SelectiveMutator,
  runMutationBattery,
  evaluateMutationGate,
  contractRequiresMutationGate,
  contractMutationThreshold,
  DEFAULT_SELECTIVE_PATHS,
  DEFAULT_MUTATION_SCORE_THRESHOLD,
  type MutationOperator,
  type Mutant,
  type SelectiveMutatorOptions,
  type MutationTestRunner,
  type MutationBatteryOptions,
  type MutationBatteryResult,
  type MutationBatteryStatus,
  type MutationGateEvaluation,
} from "./selective-mutation.js";
export { ProgressTracker, type ProgressVerdict, type ProgressSignal } from "./progress.js";
export {
  runEvaluationBattery,
  type BatteryReport,
  type TaskRunResult,
  type RunBatteryOptions,
} from "./runner.js";
export {
  probeLiveLlmReadiness,
  runLiveEngineeringCase,
  runLiveValidationSuite,
  type LiveReadinessReport,
  type LiveRunResult,
} from "./live/index.js";
export {
  METAMORPHIC_SCHEMA_VERSION,
  REQUIRED_PARAPHRASE_COUNT,
  normalizeObjectiveTokens,
  createStubDecomposer,
  createStubRouter,
  runMetamorphicHarness,
  evaluateMetamorphicGate,
  fixtureEquivalentParaphrases,
  type ParaphraseVariant,
  type DecompositionNode,
  type DecompositionFingerprint,
  type StubRouteDecision,
  type MetamorphicPassVerdict,
  type MetamorphicVariantResult,
  type MetamorphicGateStatus,
  type DifferentialModelRun,
  type DifferentialModelReport,
  type MetamorphicHarnessReport,
  type DecomposerStub,
  type ModelRouterStub,
  type MetamorphicHarnessOptions,
  type StubRouterOptions,
} from "./metamorphic.js";
export {
  DST_SCHEMA_VERSION,
  DST_DEFAULT_SEED,
  DST_MIN_SCENARIOS,
  SimulationWorld,
  runScenarios,
  assertDstGate,
  assertSeedReproducibility,
  type SimEvent,
  type SimEventKind,
  type ScenarioResult,
  type SimStats,
  type RunScenariosOptions,
  type VirtualProc,
  type VirtualNetMessage,
  type FencingLease,
} from "./deterministic-sim.js";
