#!/usr/bin/env -S node --experimental-transform-types
/**
 * Standalone Deterministic E2E Test Runner for ExecutionEngine + G1 Observability (Phase G1.4)
 * Comprehensive regression and verification test suite:
 * - AUD-G1.3-01: Prevention of retry storm on persistent HTTP failure (exact call/span accounting)
 * - AUD-G1.3-02: Complete SSRF defense (IPv6 brackets, IPv4-mapped IPv6, RFC 1918, 3xx redirect error)
 * - AUD-G1.3-03: Canonical provider manifest (`provider.yaml`) and runtime discovery via ExecutionEngine
 * - AUD-G1.3-04: YAML contract loader in pure ESM (`parseYaml` ESM compatibility)
 * - AUD-G1.3-05: OpenAI Chat Completion E2E via ExecutionEngine.run(...)
 * - Transient error recovery (HTTP 429 -> HTTP 200 on retry)
 * - Anthropic completion E2E with secret redaction and single-span ledger persistence
 * - Best-effort persistence resiliency
 * - Heterogeneous multi-node DAG execution
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";
import * as os from "node:os";
import { register } from "node:module";

// Ensure --experimental-transform-types is present
if (!process.execArgv.includes("--experimental-transform-types")) {
  const child = cp.spawnSync(
    process.execPath,
    ["--experimental-transform-types", ...process.argv.slice(1)],
    {
      stdio: "inherit",
      env: process.env,
    }
  );
  process.exit(child.status ?? 0);
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

// Register custom module loader for relative TS imports and yaml package
register(path.join(__dirname, "ts-loader.mjs"), import.meta.url);

// Import orchestrator components
const { ExecutionEngine } = await import(
  path.join(workspaceRoot, "orchestrator/src/engine/execution-engine.js")
);
const { ProviderRouter, createMockProvider } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/mock-provider.js")
);
const { ObservableInferenceProvider } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/observable-inference-provider.js")
);
const { ObservableLlmProviderAdapter } = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/observable-llm-adapter.js")
);
const { readInferenceSpans, resolveInferenceSpansPath } = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/inference-ledger.js")
);
const { NOT_MEASURED } = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/inference-usage.js")
);
const { loadContractsFromDir } = await import(
  path.join(workspaceRoot, "orchestrator/src/contracts/contract-registry.js")
);
const { loadYamlFile } = await import(
  path.join(workspaceRoot, "orchestrator/src/registry/manifest-loader.js")
);
const { CapabilityRegistryImpl } = await import(
  path.join(workspaceRoot, "orchestrator/src/registry/registry-client.js")
);

console.log("================================================================================");
console.log("UKS G1.4 EXECUTION ENGINE + LLM.COMPLETE COMPREHENSIVE SUITE (V2.5 Integration)");
console.log("================================================================================");

let passed = 0;
let failed = 0;
const testResults = [];

async function runTest(name, fn) {
  const start = performance.now();
  try {
    await fn();
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[✓ PASS] ${name} (${duration}ms)`);
    testResults.push({ name, status: "PASS", durationMs: parseFloat(duration) });
    passed++;
  } catch (err) {
    const duration = (performance.now() - start).toFixed(2);
    console.error(`[✗ FAIL] ${name} (${duration}ms)`);
    console.error(`        Error: ${err.message}`);
    if (err.stack) {
      console.error(
        err.stack
          .split("\n")
          .slice(1, 4)
          .map((l) => `        ${l.trim()}`)
          .join("\n")
      );
    }
    testResults.push({
      name,
      status: "FAIL",
      durationMs: parseFloat(duration),
      error: err.message,
    });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

// Scratch directory for test ledger
const scratchDir = path.join(os.tmpdir(), "g1.4-e2e-" + Date.now());
fs.mkdirSync(scratchDir, { recursive: true });

function cleanScratch(subdir) {
  const p = path.join(scratchDir, subdir);
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ------------------------------------------------------------------------------------------------
// TEST 1: AUD-G1.3-04 Verification — Pure ESM Contract Registry Loader
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-04: loadContractsFromDir loads all contracts cleanly in pure ESM without parseYaml error", async () => {
  const contractsDir = path.join(workspaceRoot, "orchestrator/contracts");
  const contractRegistry = loadContractsFromDir(contractsDir);
  const contracts = contractRegistry.list();
  assert(Array.isArray(contracts), "Expected contractRegistry.list() to return an array");
  assert(contracts.length >= 40, `Expected at least 40 contracts loaded, got ${contracts.length}`);

  const llmContract = contracts.find((c) => c.metadata.id === "llm.complete");
  assert(llmContract !== undefined, "Contract llm.complete was not found in registry");
  assert(llmContract.metadata.version === "1.0.0", `Expected version 1.0.0, got ${llmContract.metadata.version}`);
  assert(llmContract.spec.capability === "llm.complete", `Expected capability llm.complete, got ${llmContract.spec.capability}`);
  assert(Array.isArray(llmContract.spec.inputs), "Expected inputs to be an array");
  assert(llmContract.spec.inputs.some((i) => i.name === "prompt" && i.required === true), "Input 'prompt' required in contract spec");

  // Verify getByRef also resolves correctly
  const byRef = contractRegistry.getByRef("contracts/llm.complete@1.0.0");
  assert(byRef !== undefined, "getByRef('contracts/llm.complete@1.0.0') returned undefined");
});

// ------------------------------------------------------------------------------------------------
// TEST 2: AUD-G1.3-03 Verification — Canonical Provider Manifest Specification
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-03: Canonical provider.yaml for observable-inference exists and validates against schema", async () => {
  const manifestPath = path.join(workspaceRoot, "orchestrator/providers/observable-inference/provider.yaml");
  assert(fs.existsSync(manifestPath), `Manifest missing at ${manifestPath}`);

  const manifest = loadYamlFile(manifestPath);
  assert(manifest.apiVersion === "capability-orchestrator.io/v2", `Invalid apiVersion: ${manifest.apiVersion}`);
  assert(manifest.kind === "Provider", `Invalid kind: ${manifest.kind}`);
  assert(manifest.metadata.name === "observable-inference", `Invalid metadata.name: ${manifest.metadata.name}`);
  assert(manifest.spec.plugin?.type === "observable-inference", `Invalid plugin.type: ${manifest.spec.plugin?.type}`);

  const cap = manifest.spec.capabilities.find((c) => c.id === "llm.complete");
  assert(cap !== undefined, "Capability 'llm.complete' not found in provider.yaml");
  assert(cap.contract === "contracts/llm.complete@1.0.0", `Expected contract contracts/llm.complete@1.0.0, got ${cap.contract}`);
});

// ------------------------------------------------------------------------------------------------
// TEST 3: AUD-G1.3-03 Verification — ExecutionEngine Dynamic Runtime Provider Discovery
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-03: ExecutionEngine discovers and registers observable-inference dynamically at runtime", async () => {
  const tmpDir = cleanScratch("t3-dynamic-discovery");
  const featureId = "feat-discovery-e2e";

  // Mock global fetch for dynamic discovery test
  const originalFetch = globalThis.fetch;
  let mockFetchCalled = false;
  globalThis.fetch = async () => {
    mockFetchCalled = true;
    return new Response(
      JSON.stringify({
        id: "msg_discovery_ok",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet",
        content: [{ type: "text", text: "Discovered provider successfully" }],
        usage: { input_tokens: 30, output_tokens: 60 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const emptyRegistry = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "CapabilityRegistry",
      metadata: { generated_at: new Date().toISOString() },
      capabilities: {},
    };
    const router = new ProviderRouter();

    const engine = new ExecutionEngine({
      registry: emptyRegistry,
      providers: router,
      discovery: {
        orchestratorProvidersDir: path.join(workspaceRoot, "orchestrator/providers"),
      },
    });

    const dag = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "CapabilityGraph",
      metadata: {
        id: featureId,
        feature: "Dynamic Discovery Test",
        ir_version: "2.0.0",
        policy_ref: "rapid-prototype",
      },
      spec: {
        nodes: [
          {
            id: "step-discover-llm",
            capability: "llm.complete",
            type: "worker",
            dependencies: [],
            inputs: [
              { prompt: "Test dynamic discovery of observable-inference provider" },
              { memoryRoot: tmpDir },
            ],
            definition_of_done: [{ id: "dod-disc", check: "Discovered and executed", verification: "evidence" }],
          },
        ],
      },
    };

    const result = await engine.run({
      ir: dag,
      policy_id: "rapid-prototype",
      feature_id: featureId,
    });

    assert(result.success === true, `Execution failed with dynamic discovery: ${result.blocked_reason}`);
    assert(mockFetchCalled === true, "Mock fetch was not invoked by discovered provider");
    assert(result.graph.nodes[0].status === "satisfied", "Node was not marked satisfied");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ------------------------------------------------------------------------------------------------
// TEST 4: Anthropic Inference E2E with Context Propagation, Ledger, and Redaction
// ------------------------------------------------------------------------------------------------
await runTest("ExecutionEngine executes Anthropic completion DAG propagating context, persisting single span, and redacting apiKey", async () => {
  const tmpDir = cleanScratch("t4-anthropic-dag");
  const featureId = "feature-anthropic-001";

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    const anthropicResponse = {
      id: "msg_anthropic_test_01",
      type: "message",
      role: "assistant",
      model: "claude-3-5-sonnet",
      content: [
        {
          type: "text",
          text: "export interface AuthConfig { secretKey: string; timeoutMs: number; }",
        },
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 64,
        output_tokens: 180,
      },
    };
    return new Response(JSON.stringify(anthropicResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  const inferenceProvider = new ObservableInferenceProvider({
    id: "llm-obs-provider",
    adapter,
    memoryRoot: tmpDir,
    apiKey: "canary-secret-token-xyz-123",
  });

  const router = new ProviderRouter();
  router.register(inferenceProvider);
  router.register(createMockProvider("contract-generator"));

  const testRegistry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "api-contract": {
        providers: [
          {
            id: "contract-generator",
            name: "Contract Generator",
            plugin: "mock",
            telemetry: { success_rate: 1.0, average_duration_ms: 10 },
          },
        ],
      },
      "llm.complete": {
        providers: [
          {
            id: "llm-obs-provider",
            name: "Observable LLM Provider",
            plugin: "observable-inference",
            telemetry: { success_rate: 1.0, average_duration_ms: 50 },
          },
        ],
      },
    },
  };

  const engine = new ExecutionEngine({
    registry: testRegistry,
    providers: router,
  });

  const testIR = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: featureId,
      feature: "E2E LLM Complete Verification",
      ir_version: "2.0.0",
      policy_ref: "rapid-prototype",
    },
    spec: {
      nodes: [
        {
          id: "step-1-contract",
          capability: "api-contract",
          type: "worker",
          dependencies: [],
          inputs: [{ ref: "global.feature-request" }],
          definition_of_done: [{ id: "dod-1", check: "Contract drafted", verification: "evidence" }],
        },
        {
          id: "step-2-inference",
          capability: "llm.complete",
          type: "worker",
          dependencies: ["step-1-contract"],
          inputs: [{ prompt: "Generate TypeScript authentication interface" }],
          definition_of_done: [{ id: "dod-2", check: "LLM completion generated", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({
    ir: testIR,
    policy_id: "rapid-prototype",
    feature_id: featureId,
  });

  assert(result.success === true, `Engine execution failed: ${result.blocked_reason}`);
  assert(fetchCalled === true, "mockFetch was not called during execution");
  assert(result.graph.nodes.every((n) => n.status === "satisfied"), "Not all nodes reached 'satisfied' status");

  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 1, `Expected exactly 1 span in ledger, found ${spans.length}`);

  const span = spans[0];
  assert(span.task_id === "step-2-inference", `Task ID mismatch: ${span.task_id}`);
  assert(typeof span.run_id === "string" && span.run_id.length > 0, "run_id missing in span");
  assert(span.provider === "anthropic", `Expected provider anthropic, got ${span.provider}`);
  assert(span.model === "claude-3-5-sonnet", `Expected model claude-3-5-sonnet, got ${span.model}`);
  assert(span.input_tokens === 64, `Expected input_tokens=64, got ${span.input_tokens}`);
  assert(span.output_tokens === 180, `Expected output_tokens=180, got ${span.output_tokens}`);
  assert(span.usage_source === "dado_provider", `Expected usage_source 'dado_provider', got ${span.usage_source}`);
  assert(span.estimated_cost === NOT_MEASURED, `Expected estimated_cost=NOT_MEASURED, got ${span.estimated_cost}`);
  assert(span.actual_cost === NOT_MEASURED, `Expected actual_cost=NOT_MEASURED, got ${span.actual_cost}`);
  assert(span.outcome === "success", `Expected outcome 'success', got ${span.outcome}`);

  // Confirm single-span write and no secret leakage
  const ledgerPath = resolveInferenceSpansPath(tmpDir, featureId);
  const rawContent = fs.readFileSync(ledgerPath, "utf-8").trim();
  const lineCount = rawContent.split("\n").filter((l) => l.trim().length > 0).length;
  assert(lineCount === 1, `Expected exactly 1 line in JSONL file, found ${lineCount}`);
  assert(rawContent.includes("canary-secret-token-xyz-123") === false, "Security breach: API key found in span JSONL");
});

// ------------------------------------------------------------------------------------------------
// TEST 5: AUD-G1.3-05 Verification — OpenAI Chat Completion E2E via ExecutionEngine.run(...)
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-05: ExecutionEngine executes authentic OpenAI Chat Completion DAG and records OpenAI tokens in ledger", async () => {
  const tmpDir = cleanScratch("t5-openai-dag");
  const featureId = "feature-openai-001";

  let openAiFetched = false;
  let receivedHeaders = {};
  let receivedBody = null;

  const mockOpenAiFetch = async (input, init) => {
    openAiFetched = true;
    receivedHeaders = init?.headers || {};
    receivedBody = JSON.parse(init?.body || "{}");

    const openAiResponse = {
      id: "chatcmpl-9abcdef123456789",
      object: "chat.completion",
      created: 1729800000,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Polymorphism in TypeScript enables objects of different types to be treated through a unified interface.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 42,
        completion_tokens: 88,
        total_tokens: 130,
      },
    };
    return new Response(JSON.stringify(openAiResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = new ObservableLlmProviderAdapter(mockOpenAiFetch);
  const inferenceProvider = new ObservableInferenceProvider({
    id: "llm-openai-provider",
    adapter,
    memoryRoot: tmpDir,
    defaultProvider: "openai",
    defaultModel: "gpt-4o",
    apiKey: "sk-openai-mock-key-888",
  });

  const router = new ProviderRouter();
  router.register(inferenceProvider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [
          {
            id: "llm-openai-provider",
            name: "OpenAI LLM Provider",
            plugin: "observable-inference",
            telemetry: { success_rate: 1.0, average_duration_ms: 35 },
          },
        ],
      },
    },
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
  });

  const openAiDag = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: featureId,
      feature: "OpenAI E2E Completion Verification",
      ir_version: "2.0.0",
      policy_ref: "rapid-prototype",
    },
    spec: {
      nodes: [
        {
          id: "step-openai-completion",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [
            { prompt: "Explain polymorphism in TypeScript" },
            { provider: "openai" },
            { model: "gpt-4o" },
          ],
          definition_of_done: [
            { id: "dod-openai", check: "OpenAI output generated", verification: "evidence" },
          ],
        },
      ],
    },
  };

  const result = await engine.run({
    ir: openAiDag,
    policy_id: "rapid-prototype",
    feature_id: featureId,
  });

  assert(result.success === true, `OpenAI DAG run failed: ${result.blocked_reason}`);
  assert(openAiFetched === true, "mockOpenAiFetch was not called");
  assert(result.graph.nodes[0].status === "satisfied", "Node step-openai-completion was not satisfied");

  // Verify headers and request payload
  const authHeader = receivedHeaders["authorization"] || receivedHeaders["Authorization"];
  assert(authHeader === "Bearer sk-openai-mock-key-888", `Missing or wrong Authorization header for OpenAI: got ${authHeader}`);
  assert(receivedBody.model === "gpt-4o", `Expected model gpt-4o in request body, got ${receivedBody.model}`);
  assert(Array.isArray(receivedBody.messages), "Expected messages array in OpenAI request body");

  // Verify ledger span
  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 1, `Expected exactly 1 span in ledger, found ${spans.length}`);

  const span = spans[0];
  assert(span.task_id === "step-openai-completion", `Task ID mismatch: ${span.task_id}`);
  assert(span.provider === "openai", `Expected provider 'openai', got ${span.provider}`);
  assert(span.model === "gpt-4o", `Expected model 'gpt-4o', got ${span.model}`);
  assert(span.input_tokens === 42, `Expected input_tokens=42, got ${span.input_tokens}`);
  assert(span.output_tokens === 88, `Expected output_tokens=88, got ${span.output_tokens}`);
  assert(span.usage_source === "dado_provider", `Expected usage_source 'dado_provider', got ${span.usage_source}`);
  assert(span.outcome === "success", `Expected outcome 'success', got ${span.outcome}`);
});

// ------------------------------------------------------------------------------------------------
// TEST 6: AUD-G1.3-01 Verification — Prevention of Retry Storm on Persistent HTTP Failure
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-01: Persistent HTTP 500 cleanly halts ExecutionEngine after policy retry budget without retry storm", async () => {
  const tmpDir = cleanScratch("t6-persistent-failure");
  const featureId = "feat-persistent-500";

  let callCount = 0;
  const mockPersistentFailFetch = async () => {
    callCount++;
    return new Response(
      JSON.stringify({
        error: {
          type: "server_error",
          message: "Internal server error from mock inference provider",
        },
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockPersistentFailFetch);
  const inferenceProvider = new ObservableInferenceProvider({
    id: "llm-failing-provider",
    adapter,
    memoryRoot: tmpDir,
  });

  const router = new ProviderRouter();
  router.register(inferenceProvider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [
          {
            id: "llm-failing-provider",
            name: "Failing Provider",
            plugin: "observable-inference",
            telemetry: { success_rate: 0.0, average_duration_ms: 10 },
          },
        ],
      },
    },
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
  });

  // Policy rapid-prototype has max_retries = 1.
  // Therefore, exact expected calls = 1 initial + 1 retry = 2 calls.
  const failDag = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: featureId,
      feature: "Persistent Failure Test",
      ir_version: "2.0.0",
      policy_ref: "rapid-prototype",
    },
    spec: {
      nodes: [
        {
          id: "step-persist-fail",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [{ prompt: "Prompt that triggers persistent 500" }],
          definition_of_done: [{ id: "dod-fail", check: "Check failure handling", verification: "evidence" }],
        },
      ],
    },
  };

  const startTime = performance.now();
  const result = await engine.run({
    ir: failDag,
    policy_id: "rapid-prototype",
    feature_id: featureId,
  });
  const elapsed = performance.now() - startTime;

  // Execution must fail cleanly
  assert(result.success === false, "Engine should report success: false on persistent HTTP 500");
  assert(
    result.blocked_reason === "unrecoverable_failure",
    `Expected blocked_reason 'unrecoverable_failure', got '${result.blocked_reason}'`
  );

  // Exact call accounting: exactly 2 calls (1 initial + 1 retry). NOT 168!
  assert(callCount === 2, `AUD-G1.3-01 RETRY STORM DETECTED! Expected exactly 2 calls, got ${callCount}`);
  assert(elapsed < 1000, `Execution took too long (${elapsed}ms), possible spin loop`);

  // Verify exactly 2 error spans in ledger
  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 2, `Expected exactly 2 spans in ledger, found ${spans.length}`);
  assert(spans.every((s) => s.outcome === "error"), "All recorded spans must have outcome: 'error'");
  assert(spans.every((s) => s.input_tokens === null && s.output_tokens === null), "Error spans must have null tokens");
});

// ------------------------------------------------------------------------------------------------
// TEST 7: Transient Error Recovery on Retry (HTTP 429 -> HTTP 200)
// ------------------------------------------------------------------------------------------------
await runTest("Transient HTTP 429 followed by HTTP 200 succeeds on retry with exact call/span accounting", async () => {
  const tmpDir = cleanScratch("t7-transient-recovery");
  const featureId = "feat-transient-recovery";

  let callCount = 0;
  const mockTransientFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({ error: { type: "rate_limit_error", message: "Too many requests" } }),
        { status: 429, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        id: "msg_transient_ok",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet",
        content: [{ type: "text", text: "Success on retry" }],
        usage: { input_tokens: 25, output_tokens: 50 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockTransientFetch);
  const inferenceProvider = new ObservableInferenceProvider({
    id: "llm-transient-provider",
    adapter,
    memoryRoot: tmpDir,
  });

  const router = new ProviderRouter();
  router.register(inferenceProvider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [
          {
            id: "llm-transient-provider",
            name: "Transient Provider",
            plugin: "observable-inference",
            telemetry: { success_rate: 0.9, average_duration_ms: 20 },
          },
        ],
      },
    },
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
  });

  const transientDag = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: featureId,
      feature: "Transient Recovery Test",
      ir_version: "2.0.0",
      policy_ref: "rapid-prototype",
    },
    spec: {
      nodes: [
        {
          id: "step-transient",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [{ prompt: "Prompt that recovers from 429" }],
          definition_of_done: [{ id: "dod-transient", check: "Check recovery", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({
    ir: transientDag,
    policy_id: "rapid-prototype",
    feature_id: featureId,
  });

  assert(result.success === true, `Execution failed despite recovery: ${result.blocked_reason}`);
  assert(callCount === 2, `Expected exactly 2 fetch calls, got ${callCount}`);
  assert(result.graph.nodes[0].status === "satisfied", "Node step-transient should be satisfied");

  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 2, `Expected 2 spans in ledger (1 error, 1 success), found ${spans.length}`);
  assert(spans[0].outcome === "error", "First span should be outcome: 'error'");
  assert(spans[1].outcome === "success", "Second span should be outcome: 'success'");
  assert(spans[1].input_tokens === 25, `Expected 25 input tokens on success span, got ${spans[1].input_tokens}`);
});

// ------------------------------------------------------------------------------------------------
// TEST 8: AUD-G1.3-02 Verification — Comprehensive SSRF & Security Guardrail Suite
// ------------------------------------------------------------------------------------------------
await runTest("AUD-G1.3-02: Comprehensive SSRF rejection (IPv6 brackets, IPv4-mapped, RFC 1918, 3xx redirect error, size limit)", async () => {
  let mockRedirectCalled = false;
  const mockFetchWithRedirect = async (input, init) => {
    // If redirect: "error" is passed in fetch options, compliant environments reject redirects
    if (init?.redirect === "error") {
      throw new TypeError("Failed to fetch: redirect mode is set to error");
    }
    mockRedirectCalled = true;
    return new Response(null, {
      status: 302,
      headers: { Location: "https://169.254.169.254/secret" },
    });
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetchWithRedirect);

  // Helper to assert rejection
  async function assertSsrfViolation(url, expectedSnippet, description) {
    let thrown = false;
    try {
      await adapter.complete({
        gatewayUrl: url,
        prompt: "test",
        featureId: "sec-e2e",
      });
    } catch (err) {
      thrown = true;
      assert(
        err.message.includes(expectedSnippet),
        `SSRF test [${description}] failed: expected '${expectedSnippet}', got '${err.message}'`
      );
    }
    assert(thrown, `SSRF test [${description}] failed: endpoint was NOT rejected!`);
  }

  // 1. IPv6 bracketed loopback
  await assertSsrfViolation("https://[::1]:8080/v1/chat", "SECURITY_SSRF_VIOLATION", "IPv6 loopback [::1]");

  // 2. IPv4-mapped IPv6 loopback
  await assertSsrfViolation("https://[::ffff:127.0.0.1]:8080/v1/chat", "SECURITY_SSRF_VIOLATION", "IPv4-mapped IPv6 loopback");

  // 3. IPv4-mapped IPv6 cloud metadata
  await assertSsrfViolation("https://[::ffff:169.254.169.254]/v1/chat", "SECURITY_SSRF_VIOLATION", "IPv4-mapped IPv6 metadata");

  // 4. RFC 1918 Private ranges
  await assertSsrfViolation("https://10.0.0.1/v1/chat", "SECURITY_SSRF_VIOLATION", "RFC 1918 10.0.0.0/8");
  await assertSsrfViolation("https://172.16.0.1/v1/chat", "SECURITY_SSRF_VIOLATION", "RFC 1918 172.16.0.0/12");
  await assertSsrfViolation("https://192.168.1.1/v1/chat", "SECURITY_SSRF_VIOLATION", "RFC 1918 192.168.0.0/16");

  // 5. Link-local IP
  await assertSsrfViolation("https://169.254.1.1/v1/chat", "SECURITY_SSRF_VIOLATION", "Link-local subnet");

  // 6. Cloud metadata standard IP
  await assertSsrfViolation("https://169.254.169.254/latest/meta-data/", "SECURITY_SSRF_VIOLATION", "AWS/GCP metadata IP");

  // 7. Cloud metadata DNS hostname
  await assertSsrfViolation("https://metadata.google.internal/computeMetadata/v1/", "SECURITY_SSRF_VIOLATION", "metadata.google.internal");

  // 8. Localhost domain alias
  await assertSsrfViolation("https://localhost.localdomain/v1/chat", "SECURITY_SSRF_VIOLATION", "localhost.localdomain");
  await assertSsrfViolation("https://api.internal/v1/chat", "SECURITY_SSRF_VIOLATION", ".internal domain");

  // 9. Plain unencrypted HTTP
  await assertSsrfViolation("http://api.anthropic.com/v1/messages", "Only HTTPS is permitted", "Plain HTTP scheme");

  // 10. HTTP 3xx redirect behavior (redirect: 'error')
  let redirectCaught = false;
  try {
    await adapter.complete({
      gatewayUrl: "https://api.anthropic.com/v1/messages",
      prompt: "test redirect",
      featureId: "sec-e2e",
    });
  } catch (err) {
    redirectCaught = true;
    assert(err.message.includes("redirect mode is set to error"), `Expected redirect error, got: ${err.message}`);
  }
  assert(redirectCaught, "HTTP 3xx redirect was not blocked by redirect: 'error'");

  // 11. Prompt size limit (exceeding 64KB)
  let oversizeCaught = false;
  try {
    const hugePrompt = "Z".repeat(70000);
    await adapter.complete({
      prompt: hugePrompt,
      featureId: "sec-e2e",
    });
  } catch (err) {
    oversizeCaught = true;
    assert(err.message.includes("Prompt exceeds maximum permitted size"), `Unexpected error: ${err.message}`);
  }
  assert(oversizeCaught, "Prompt exceeding 64KB was not rejected");
});

// ------------------------------------------------------------------------------------------------
// TEST 9: Best-Effort Persistence Resiliency
// ------------------------------------------------------------------------------------------------
await runTest("ObservableInferenceProvider does not fail inference if disk persistence fails (best-effort)", async () => {
  const unwritableMemoryRoot = "/dev/null/forbidden-root";

  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        id: "msg_ok",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet",
        content: [{ type: "text", text: "Inference succeeds regardless of ledger error" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  const provider = new ObservableInferenceProvider({
    id: "llm-resilient-provider",
    adapter,
    memoryRoot: unwritableMemoryRoot,
  });

  const request = {
    run_id: "run-resilience",
    node_id: "node-llm-resilient",
    capability: "llm.complete",
    inputs: [{ prompt: "Valid prompt" }],
    definition_of_done: [{ id: "dod-res", check: "Check resilient", verification: "evidence" }],
    policy: { retries_remaining: 0, timeout_ms: 5000 },
    provider_id: "llm-resilient-provider",
    executor_type: "observable-inference",
    memory_scope: "feat-resilient",
    knowledge_hits: [],
    briefing: "Execute best-effort test",
    node: {
      id: "node-llm-resilient",
      capability: "llm.complete",
      type: "worker",
      dependencies: [],
      definition_of_done: [{ id: "dod-res", check: "Check resilient", verification: "evidence" }],
      inputs: [{ prompt: "Valid prompt" }],
      retry_count: 0,
      status: "pending",
    },
  };

  const result = await provider.execute(request);
  assert(result.success === true, "Provider should succeed even if ledger write fails");
  assert(result.evidence !== undefined, "Evidence should be produced");
});

// ------------------------------------------------------------------------------------------------
// TEST 10: Multi-Node Heterogeneous DAG Execution
// ------------------------------------------------------------------------------------------------
await runTest("ExecutionEngine runs heterogeneous DAG with deterministic capabilities alongside llm.complete", async () => {
  const tmpDir = cleanScratch("t10-heterogeneous-dag");
  const featureId = "heterogeneous-feature-run";

  const mockFetch = async () => {
    return new Response(
      JSON.stringify({
        id: "msg_multi_node",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet",
        content: [{ type: "text", text: "Authentication schema created" }],
        usage: { input_tokens: 50, output_tokens: 100 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  const inferenceProvider = new ObservableInferenceProvider({
    id: "llm-obs-provider",
    adapter,
    memoryRoot: tmpDir,
  });

  const router = new ProviderRouter();
  router.register(inferenceProvider);
  router.register(createMockProvider("spec-planner"));
  router.register(createMockProvider("ui-developer"));

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "api-contract": {
        providers: [
          {
            id: "spec-planner",
            name: "Spec Planner",
            plugin: "mock",
            telemetry: { success_rate: 1.0, average_duration_ms: 10 },
          },
        ],
      },
      "llm.complete": {
        providers: [
          {
            id: "llm-obs-provider",
            name: "Observable LLM Provider",
            plugin: "observable-inference",
            telemetry: { success_rate: 1.0, average_duration_ms: 50 },
          },
        ],
      },
      "frontend-ui": {
        providers: [
          {
            id: "ui-developer",
            name: "UI Developer",
            plugin: "mock",
            telemetry: { success_rate: 1.0, average_duration_ms: 15 },
          },
        ],
      },
    },
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
  });

  const dag = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: featureId,
      feature: "Multi-Capability Execution",
      ir_version: "2.0.0",
      policy_ref: "rapid-prototype",
    },
    spec: {
      nodes: [
        {
          id: "node-1-contract",
          capability: "api-contract",
          type: "worker",
          dependencies: [],
          inputs: [{ ref: "global.feature-request" }],
          definition_of_done: [{ id: "dod-1", check: "Spec done", verification: "evidence" }],
        },
        {
          id: "node-2-llm",
          capability: "llm.complete",
          type: "worker",
          dependencies: ["node-1-contract"],
          inputs: [{ prompt: "Design Auth Logic" }],
          definition_of_done: [{ id: "dod-2", check: "Auth logic drafted", verification: "evidence" }],
        },
        {
          id: "node-3-ui",
          capability: "frontend-ui",
          type: "worker",
          dependencies: ["node-2-llm"],
          inputs: [{ ref: "node-2-llm.outputs" }],
          definition_of_done: [{ id: "dod-3", check: "UI rendered", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({
    ir: dag,
    policy_id: "rapid-prototype",
    feature_id: featureId,
  });

  assert(result.success === true, `Heterogeneous DAG execution failed: ${result.blocked_reason}`);
  assert(result.graph.nodes.length === 3, "Expected 3 nodes in graph");
  assert(result.graph.nodes.every((n) => n.status === "satisfied"), "All nodes should be satisfied");

  // Verify only 1 span in ledger (only node-2-llm emitted inference telemetry)
  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 1, `Expected exactly 1 inference span, found ${spans.length}`);
  assert(spans[0].task_id === "node-2-llm", `Expected span task_id 'node-2-llm', got ${spans[0].task_id}`);
  assert(spans[0].outcome === "success", `Expected outcome 'success', got ${spans[0].outcome}`);
  assert(spans[0].input_tokens === 50, `Expected input_tokens=50, got ${spans[0].input_tokens}`);
  assert(spans[0].output_tokens === 100, `Expected output_tokens=100, got ${spans[0].output_tokens}`);
});

console.log("================================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("================================================================================");

const evidenceDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.join(evidenceDir, "phase-g1.4-engine-observability-e2e.json");

const evidencePayload = {
  timestamp: new Date().toISOString(),
  phase: "G1.4",
  capability: "llm.complete",
  provider_runtime: "ObservableInferenceProvider",
  total_tests: passed + failed,
  passed,
  failed,
  verdict: failed === 0 ? "APROVADO" : "REPROVADO",
  test_results: testResults,
};

fs.writeFileSync(evidencePath, JSON.stringify(evidencePayload, null, 2), "utf-8");
console.log(`\n[+] Evidence written to: ${evidencePath}`);

// Clean up scratch dir
try {
  fs.rmSync(scratchDir, { recursive: true, force: true });
} catch {
  // ignore
}

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nVERDICT: TODAS AS CORREÇÕES G1.4 (AUD-G1.3-01 A 05) HOMOLOGADAS COM SUCESSO!\n");
  process.exit(0);
}
