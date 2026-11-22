export {
  MEMORY_DB_SCHEMA_SQL,
  MEMORY_DB_SCHEMA_VERSION,
  MEMORY_COLD_V2_COLUMNS,
} from "./schema.js";
export {
  MemoryBroker,
  MemoryBrokerError,
  defaultMemoryDbPath,
  buildFtsQuery,
} from "./broker.js";
export {
  ColdStorage,
  ColdStorageError,
  defaultColdStorageRoot,
  sha256Hex,
  formatCasHash,
  parseCasHash,
  CAS_HASH_PREFIX,
  COLD_STORAGE_BLOB_EXT,
  COLD_SCALE_100K_THIS_SESSION,
} from "./cold-storage.js";
export type {
  ColdStorageOptions,
  ColdPutResult,
  ColdMigrateSqliteRecord,
  ColdMigrateResult,
} from "./cold-storage.js";
export {
  assertPromotionGate,
  promotionGateAllowed,
  MemoryPromotionError,
} from "./promotion-gate.js";
export type { PromotionGateOptions } from "./promotion-gate.js";
export {
  hybridSearch,
  reciprocalRankFusion,
  lightRerank,
  tryLoadSqliteVec,
  UnavailableVectorSearch,
  SqliteVecSearch,
  hashEmbedText,
  getSqliteVecLoadError,
  SQLITE_VEC_GAP,
  DEFAULT_MEMORY_VEC_DIMS,
} from "./hybrid-search.js";
export type {
  HybridSearchHit,
  VectorSearchPort,
  RrfChannelHit,
  SqliteVecDb,
} from "./hybrid-search.js";
export { engineerContext } from "./context-engineering.js";
export type {
  ContractRequirement,
  ContextEngineeringInput,
  EngineeredContext,
  ContextMemorySlice,
} from "./context-engineering.js";
export {
  detectContradiction,
  dispositionForContradiction,
} from "./contradiction.js";
export type { ContradictionSignal, ContradictionDisposition } from "./contradiction.js";
export {
  ConsolidationEngine,
  ConsolidationBackgroundRunner,
  StubLessonExtractor,
  extractRulesHeuristic,
  lessonDedupeKey,
  lessonSimilarity,
  createOfflineConsolidationEngine,
  newConsolidationId,
} from "./consolidation.js";
export type {
  VerifiedEpisode,
  ConsolidationAction,
  ConsolidationProposal,
  ConsolidationProposalStatus,
  LessonExtractorPort,
  ConsolidationEngineOptions,
  ConsolidationRunnerOptions,
} from "./consolidation.js";
export { OllamaLessonAdapter } from "./ollama-lesson-adapter.js";
export type { OllamaLessonAdapterOptions } from "./ollama-lesson-adapter.js";
export {
  HybridGraphStore,
  HybridGraphError,
  HYBRID_GRAPH_SCHEMA_SQL,
  HYBRID_GRAPH_SCHEMA_VERSION,
  HYBRID_GRAPH_NODE_KINDS,
  HYBRID_GRAPH_EDGE_TYPES,
  normalizeGraphPath,
  fileNodeId,
  testNodeId,
  decisionNodeId,
  symbolNodeId,
  extractImportsFromSource,
  resolveRelativeImport,
  defaultHybridGraphDbPath,
  hashHybridGraphSnapshot,
} from "./hybrid-graph.js";
export type {
  HybridGraphNodeKind,
  HybridGraphEdgeType,
  HybridGraphNode,
  HybridGraphEdge,
  TwoHopHit,
  TwoHopExpansion,
  IngestCodeDepsResult,
  LinkDecisionResult,
} from "./hybrid-graph.js";
export type {
  MemoryStatus,
  MemoryType,
  EdgeNodeKind,
  MemoryRecord,
  ProposeMemoryInput,
  MemorySearchFilters,
  MemorySearchHit,
  MemoryEdge,
  LinkEdgeInput,
  PromotionGateDecision,
} from "./types.js";
export { MEMORY_STATUSES, MEMORY_TYPES, EDGE_NODE_KINDS } from "./types.js";
export {
  runMemoryEvalSuite,
  recallAtK,
  precisionAtK,
  countNonCurrentHits,
  createFixtureRetriever,
  DEFAULT_GOLDEN_QUERIES,
  DEFAULT_FIXTURE_CORPUS,
  DEFAULT_MEMORY_EVAL_GATES,
  NON_CURRENT_MEMORY_STATUSES,
} from "./memory-eval.js";
export type {
  MemoryEvalHonesty,
  HonestMetric,
  GoldenQuery,
  MemoryEvalHit,
  MemoryRetrieveFn,
  MemoryEvalGates,
  MemoryEvalQueryResult,
  MemoryEvalSuiteReport,
  RunMemoryEvalSuiteInput,
  FixtureMemoryDoc,
  NonCurrentMemoryStatus,
} from "./memory-eval.js";
export {
  InMemoryPyramidIndex,
  PyramidIndexError,
  buildPyramid,
  searchCoarseToFine,
  tokenizePyramidText,
  percentileNearest,
  PYRAMID_SCHEMA_VERSION,
  PYRAMID_DISK_PERSISTENCE,
  PYRAMID_SCHEMA_SQL,
  PYRAMID_LEVELS,
  PYRAMID_LEVEL_LABELS,
} from "./pyramid-index.js";
export type {
  PyramidLevel,
  PyramidEvent,
  PyramidNode,
  PyramidIndex,
  PyramidBuildStats,
  PyramidIndexSnapshot,
  BuildPyramidOptions,
  CoarseToFineOptions,
  CoarseToFinePathStep,
  CoarseToFineHit,
  CoarseToFineResult,
} from "./pyramid-index.js";
export {
  VirtualMemory,
  VirtualMemoryError,
  estimateVirtualMemoryTokens,
  memoryTombstoneMarker,
  MEMORY_TOMBSTONE_MARKER_PREFIX,
} from "./virtual-memory.js";
export type {
  RamPageState,
  MemorySearchRef,
  RamPage,
  VirtualMemoryOptions,
  RamBudgetSnapshot,
  PageOutResult,
  ExpandResult,
} from "./virtual-memory.js";
export {
  MULTI_HOP_SYNTHESIS_SCHEMA_VERSION,
  SYNTHESIS_STATUSES,
  MultiHopSynthesisError,
  expandGraph,
  fingerprintEvidence,
  synthesizeDeterministicStub,
  synthesizeLocal,
  probeOllama,
  runMultiHopSynthesis,
} from "./multi-hop-synthesis.js";
export type {
  SynthesisStatus,
  GraphEvidence,
  GraphExpansion,
  DossierCitation,
  ClosedDossier,
  OllamaSynthesisOptions,
  SynthesizeLocalInput,
  MultiHopSynthesisInput,
  OllamaProbeResult,
} from "./multi-hop-synthesis.js";
export {
  BitemporalGraph,
  BitemporalGraphError,
  BITEMPORAL_SCHEMA_VERSION,
  BITEMPORAL_SCHEMA_SQL,
  BITEMPORAL_FACT_STATUSES,
  isValidAt,
  isKnownAsOf,
  defaultBitemporalDbPath,
} from "./bitemporal-graph.js";
export type {
  BitemporalFactStatus,
  BitemporalFact,
  AssertFactInput,
  SupersedeInput,
  PointInTimeQuery,
  BitemporalGraphOptions,
} from "./bitemporal-graph.js";
export {
  UTILITY_DECAY_SCHEMA_VERSION,
  DEFAULT_UTILITY_WEIGHTS,
  DEFAULT_UTILITY_THRESHOLD,
  UtilityDecayError,
  scoreUtility,
  decayPass,
  recencyFromTimestamp,
} from "./utility-decay.js";
export type {
  UtilitySignals,
  UtilityWeights,
  UtilityMemoryRef,
  UtilityScoreBreakdown,
  DecayAuditEntry,
  DecayCandidate,
  DecayPassOptions,
  DecayPassResult,
} from "./utility-decay.js";
export {
  FEDERATED_SANITIZE_SCHEMA_VERSION,
  GLOBAL_FEDERATION_SCOPE,
  REDACTION_TOKENS,
  FederatedSanitizeError,
  sanitizeForFederation,
  detectFederationResiduals,
  promoteToGlobal,
  assertLeakFree,
  fingerprintMatched,
  toSafeRemovals,
} from "./federated-sanitize.js";
export type {
  FederationSanitizePolicy,
  FederationRedactionKind,
  FederationRemoval,
  FederationResidual,
  SanitizeForFederationResult,
  FederatedMemoryInput,
  GlobalFederatedMemory,
  PromoteToGlobalResult,
} from "./federated-sanitize.js";
