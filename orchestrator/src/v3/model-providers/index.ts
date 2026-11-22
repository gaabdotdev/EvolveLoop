export type {
  CostProvenance,
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";
export type {
  DecisionAbstainReason,
  DecisionCandidate,
  DecisionEngine,
  DecisionRequest,
  DecisionResult,
  StrictRuntimeAbstainPolicy,
  ScoredCandidateId,
  RuntimeCandidateScorer,
  StrictRuntimeDecisionEngineOptions,
  DecisionConsumerKind,
  ConsumerDecisionRequest,
} from "./decision-engine.js";
export {
  LayaDecisionEngineStub,
  ModelLayerPolicyEngine,
  StrictRuntimeDecisionEngine,
  decideForScheduler,
  decideForMso,
  decideForMemoryBroker,
} from "./decision-engine.js";
export {
  LayaDecisionEngine,
  layaHeuristicScore,
  type LayaClient,
  type LayaOfflineMode,
  type LayaDecisionEngineOptions,
} from "./laya-decision-engine.js";
export {
  PluggableDecisionEngineHost,
  type PluggableDecisionEngineHostOptions,
} from "./pluggable-host.js";
export {
  runDecisionEngineBenchmark,
  createDefaultDecisionBenchmarkFixtures,
  type DecisionBenchmarkCase,
  type DecisionBenchmarkLocale,
  type DecisionBenchmarkGolden,
  type DecisionCaseRun,
  type DecisionEngineBenchmarkMetrics,
  type DecisionEngineBenchmarkReport,
  type PluggableSwapVerdict,
  type RunDecisionEngineBenchmarkOptions,
} from "./decision-engine-benchmark.js";
export { FreeLLMAPIModelProviderStub } from "./stubs.js";
export {
  FreeLLMAPIModelProvider,
  invokeWithFallback,
  type FreeLLMAPIState,
  type FreeLLMAPICatalog,
  type FreeLLMAPICatalogEntry,
  type FreeLLMAPIInvokeMeta,
  type FallbackChainResult,
} from "./freellmapi.js";
export {
  detectProviderFaultKind,
  classifyProviderFault,
  handleProviderFault,
  faultFromFreeLLMAPIResult,
  type ProviderFaultKind,
  type ProviderFaultReport,
  type HandleProviderFaultResult,
} from "./provider-fault.js";
export {
  createProtocolAdapters,
  listProtocolIds,
  OpenAICompatibleProtocol,
  AnthropicProtocol,
  ResponsesProtocol,
  GeminiProtocol,
  type ProtocolId,
  type ProtocolAdapter,
  type ProtocolChatRequest,
  type ProtocolChatResponse,
} from "./protocols/index.js";
export { OllamaModelProvider } from "./ollama.js";
export { OpenRouterModelProvider } from "./openrouter.js";
export {
  MODEL_LAYER_TABLE,
  selectModelLayer,
  describeModelLayer,
  type ModelLayerId,
  type ModelLayerKind,
  type ModelLayerDescriptor,
  type ModelTaskKind,
  type ModelTask,
  type ModelLayerSelection,
} from "./model-layers.js";
export {
  runSpeculativePipeline,
  type SpeculativeStage,
  type SpeculativeDraftResult,
  type SpeculativeTestResult,
  type SpeculativeEscalateResult,
  type SpeculativePipelineHooks,
  type SpeculativePipelineReport,
} from "./speculative-pipeline.js";
export {
  buildConstrainedLocalRequest,
  attachGrammarIfLayer0,
  type GrammarDialect,
  type ConstrainedGrammar,
  type LocalConstrainedOptions,
  type ConstrainedInvokeRequest,
  type BuiltLocalGenerateBody,
  type ConstrainedEnforcement,
} from "./constrained-decoding.js";

import { OllamaModelProvider } from "./ollama.js";
import { OpenRouterModelProvider } from "./openrouter.js";
import { FreeLLMAPIModelProviderStub } from "./stubs.js";
import { FreeLLMAPIModelProvider } from "./freellmapi.js";
import { LayaDecisionEngineStub, ModelLayerPolicyEngine } from "./decision-engine.js";
import type { ModelHealth, ModelProvider } from "./types.js";
import type { DecisionEngine } from "./decision-engine.js";
import type { CircuitAgentAdapter } from "../circuit/adapter-types.js";
import { selectV0AgentAdapter } from "../circuit/cursor-adapter.js";

/** V0 rule 1+1: local Ollama + remote OpenRouter (decoupled). */
export function createV0ModelProviders(): {
  local: ModelProvider;
  remote: ModelProvider;
} {
  return {
    local: new OllamaModelProvider(),
    remote: new OpenRouterModelProvider(),
  };
}

/** Typed V1/V2 slots — V0 deferred stubs stay fail-closed; V1 uses createV1FreeLLMAPI(). */
export function createDeferredProviderStubs(): {
  freellmapi: ModelProvider;
  laya: DecisionEngine;
  modelLayers: ModelLayerPolicyEngine;
} {
  return {
    freellmapi: new FreeLLMAPIModelProviderStub(),
    laya: new LayaDecisionEngineStub(),
    modelLayers: new ModelLayerPolicyEngine(),
  };
}

/** V1-PROD-02 — real FreeLLMAPI provider (may be unreachable; no SLA). */
export function createV1FreeLLMAPI(opts?: ConstructorParameters<typeof FreeLLMAPIModelProvider>[0]): FreeLLMAPIModelProvider {
  return new FreeLLMAPIModelProvider(opts);
}


/**
 * V0 rule 1+1+1 stack: local model + remote provider + real agent adapter.
 */
export async function createV0AdaptStack(): Promise<{
  local: ModelProvider;
  remote: ModelProvider;
  agent: CircuitAgentAdapter;
  deferred: {
    freellmapi: ModelProvider;
    laya: DecisionEngine;
    modelLayers: ModelLayerPolicyEngine;
  };
}> {
  const { local, remote } = createV0ModelProviders();
  const agent = await selectV0AgentAdapter();
  return {
    local,
    remote,
    agent,
    deferred: createDeferredProviderStubs(),
  };
}

export async function probeV0ModelProviders(): Promise<{
  local: ModelHealth;
  remote: ModelHealth;
}> {
  const { local, remote } = createV0ModelProviders();
  const [l, r] = await Promise.all([local.healthCheck(), remote.healthCheck()]);
  return { local: l, remote: r };
}
