/**
 * V0-TOK-01..06 — Token economy foundation (ledger fields live in state-db).
 * V1-TOK-01 — Context slicing (outlineFile + readLines; no unrestricted read_file).
 * V1-TOK-02 — Symbol map (web-tree-sitter primary; AST-lite fallback) for MSO ANALYZING/DECOMPOSING.
 * V1-TOK-03 — Deterministic def/ref pre-resolution (tree-sitter; optional LSP stub).
 * V1-TOK-04 — Sentence-level RAG pruning (BM25-lite + symbol regex) before prompt injection.
 * V1-TOK-05 — Tombstone tool outputs older than 2 turns (~6-token lápide).
 * V1-TOK-06 — Stateless worker snapshot: Goal + Git Diff + Last Filtered Error (O(1)).
 * V1-TOK-07 — Lazy tool schemas (≤4 per MSO state).
 * V1-TOK-08 — Prefix pinning for KV-cache reuse.
 * V1-TOK-09 — TSV / positional compact format (path|line|symbol).
 * V1-TOK-10 — OperationalCallSpec (tool_choice required, stop, no free prose).
 * V1-TOK-11 — Surgical REPLACE/DELETE with hash/offset validation.
 * V1-TOK-14 — Deterministic mechanical fixes before LLM.
 * V1-TOK-15 — Microtask batching + semantic patch cache (SQLite).
 * V1-TOK-17 — Brain vs Hand (Fast-Apply) via surgical-edit.
 * V1-TOK-18 — NL-only perplexity compression (never compress code).
 * V1-TOK-19 — Skill-to-Code crystallizer (N≥3 → 0-token script).
 */

export {
  filterProcessOutput,
  stripAnsi,
  dedupeStackTraces,
  headTailTruncate,
  STDOUT_FILTER_HEAD_LINES,
  STDOUT_FILTER_TAIL_LINES,
  type StdoutFilterOptions,
  type StdoutFilterResult,
  type StdoutFilterStats,
} from "./stdout-filter.js";

export {
  READ_LINES_HARD_CAP,
  outlineFile,
  readLines,
  resolveConfinedPath,
  createAgentFileTools,
  denyUnrestrictedReadFile,
  readFile,
  ContextSlicingError,
  type OutlineEntry,
  type OutlineFileResult,
  type OutlineKind,
  type ReadLinesResult,
  type ContextSlicingOptions,
  type ContextSlicingErrorCode,
  type OversizedRangePolicy,
  type AgentFileTools,
} from "./context-slicing.js";

export {
  toTelegraphicEn,
  compressTelegraphicProse,
  compressRuntimeSkill,
  RUNTIME_SKILL_MAX_BYTES,
  RUNTIME_SKILL_TARGET_BYTES,
  type SkillCompressResult,
} from "./telegraphic.js";

export {
  runFailFastCascade,
  defaultFailFastCommands,
  FAIL_FAST_ORDER,
  type FailFastStageId,
  type FailFastStageResult,
  type FailFastCascadeReport,
  type FailFastRunner,
} from "./fail-fast.js";

export {
  evaluateNodeTokenBudget,
  slidingFailedAttempts,
  applyBudgetAbortToNodePayload,
  TOKEN_BUDGET_ALERT_RATIO,
  TOKEN_BUDGET_ABORT_RATIO,
  FAILED_ATTEMPT_CONTEXT_WINDOW,
  type NodeBudgetVerdict,
  type FailedAttemptRecord,
  type NodeTokenBudgetState,
  type NodeBudgetEvaluation,
} from "./node-budget.js";

export {
  matchLocalValidationIntent,
  mustSkipLlm,
  type LocalValidationKind,
  type LocalValidationMatch,
} from "./local-validation.js";

export {
  SYMBOL_MAP_ENGINE,
  resolveSymbolMapEngine,
  getSymbolMapTreeSitterInitError,
  buildFileSymbolMap,
  buildRepoSymbolMap,
  formatSymbolMapCompact,
  looksLikeFullFileDump,
  collectIdentifierOccurrences,
  extractDeclarationUnitsFromSource,
  type SymbolMapEngine,
  type SymbolKind,
  type SymbolEntry,
  type FileSymbolMap,
  type RepoSymbolMap,
  type IdentifierOccurrence,
  type DeclarationUnit,
  type DeclarationExtractResult,
} from "./symbol-map.js";

export {
  resolveDefinition,
  resolveDefinitionSync,
  resolveReferences,
  resolveReferencesSync,
  formatLocationCompact,
  preResolveForTurn1,
  symbolResolveUsesShellGrep,
  NullLanguageServerClient,
  type SymbolResolveEngine,
  type SymbolLocation,
  type LanguageServerClient,
  type ResolveOptions,
  type Turn1SymbolResolve,
  type PreResolveTurn1Input,
} from "./symbol-resolve.js";

export {
  pruneRetrievedSnippets,
  pruneRetrievedSnippetsDetailed,
  splitIntoSentences,
  tokenizeForPrune,
  bm25ScoreSentence,
  countSymbolHits,
  estimateProxyTokens,
  type RetrievedSnippet,
  type PrunedSentence,
  type PruneRetrievedStats,
  type PruneRetrievedResult,
} from "./prune-retrieved.js";

export {
  TOOL_TOMBSTONE_AGE_TURNS,
  TOOL_TOMBSTONE_MARKER,
  tombstoneOldToolOutputs,
  tombstoneOldToolOutputsDetailed,
  flattenTurns,
  toolTombstoneMarkerProxyTokens,
  type ConversationRole,
  type ConversationMessage,
  type ConversationTurn,
  type TombstoneOptions,
  type TombstoneStats,
  type TombstoneResult,
} from "./tombstone.js";

export {
  buildStatelessWorkerSnapshot,
  buildStatelessWorkerPrompt,
  type StatelessWorkerSnapshotInput,
  type StatelessWorkerSnapshot,
} from "./stateless-snapshot.js";

export {
  LAZY_TOOLS_MAX,
  MSO_STATE_TOOL_NAMES,
  selectToolsForMsoState,
  selectToolNamesForMsoState,
  listLazyToolCatalogNames,
  lazyToolCoveredStates,
  type LazyToolSchema,
} from "./lazy-tools.js";

export {
  PIN_BOUNDARY,
  normalizePinnedBlock,
  buildPinnedPrefix,
  buildPromptWithPinnedPrefix,
  splitAtPinBoundary,
  type PinnedPrefixInput,
  type PinnedPromptResult,
} from "./prefix-pinning.js";

export {
  TSV_FIELD_SEP,
  escapeTsvField,
  unescapeTsvField,
  encodeTsvRow,
  decodeTsvRow,
  encodeSymbolTsv,
  decodeSymbolTsv,
} from "./tsv.js";

export {
  FREE_PROSE_PROP_NAMES,
  DEFAULT_OPERATIONAL_STOP_SEQUENCES,
  stripFreeProseProps,
  schemaHasNoFreeProse,
  buildOperationalCallSpec,
  type FreeProsePropName,
  type JsonSchemaObject,
  type OperationalCallSpec,
  type BuildOperationalCallSpecInput,
} from "./operational-call.js";

export {
  applySurgicalEdit,
  hashLineRange,
  type SurgicalOp,
  type SurgicalEditSpec,
  type SurgicalEditErrorCode,
  type SurgicalEditResult,
} from "./surgical-edit.js";

export {
  resolveMechanicalBinary,
  mechanicalFixBeforeLlm,
  type MechanicalFixToolId,
  type MechanicalFixHookResult,
  type MechanicalFixReport,
  type MechanicalBinaryResolver,
  type MechanicalHookRunner,
  type MechanicalFixOptions,
} from "./mechanical-fix.js";

export {
  normalizeErrorSignature,
  batchMicrotasksByModule,
  SemanticPatchCache,
  type Microtask,
  type MicrotaskBatch,
  type PatchCacheEntry,
  type PatchCacheLookup,
} from "./patch-cache.js";

export {
  estimatePlanTokensProxy,
  parseCompactEditPlan,
  splitPlanAndApply,
  planWithinSoftBudget,
  type CompactEditPlan,
  type SplitPlanAndApplyInput,
  type SplitPlanAndApplyResult,
} from "./brain-hand.js";

export {
  compressNaturalLanguage,
  type CompressNaturalLanguageResult,
} from "./nl-compress.js";

export {
  CRYSTALLIZE_THRESHOLD,
  CrystallizerRegistry,
  type CrystallizedScript,
  type PatternRunInput,
  type PatternRunOutcome,
} from "./crystallizer.js";
