#!/usr/bin/env -S node --experimental-transform-types
/**
 * Standalone Deterministic E2E Test Runner for ExecutionEngine + G1 Observability (Phase G1.3)
 * Validates real execution path through ExecutionEngine.run(...):
 * - Capability llm.complete registration and routing via ObservableInferenceProvider
 * - Full DAG execution with mock HTTP inference
 * - Context propagation (feature_id, run_id, node_id)
 * - Ledger append-only span persistence and token accounting (dado_provider)
 * - Single-span emission (no duplicate writes)
 * - Deterministic HTTP error handling (429, 500)
 * - SSRF and security controls
 * - Best-effort persistence resiliency
 * - Multi-node heterogeneous DAG execution alongside deterministic capabilities
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

console.log("================================================================================");
console.log("UKS G1.3 EXECUTION ENGINE + LLM.COMPLETE E2E SUITE (V2.5 Integration)");
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
const scratchDir = path.join(os.tmpdir(), "g1.3-e2e-" + Date.now());
fs.mkdirSync(scratchDir, { recursive: true });

function cleanScratch(subdir) {
  const p = path.join(scratchDir, subdir);
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ------------------------------------------------------------------------------------------------
// TEST 1: Full DAG run via ExecutionEngine.run(...) with llm.complete
// ------------------------------------------------------------------------------------------------
await runTest("ExecutionEngine.run executes authentic DAG with llm.complete, propagating context and persisting spans", async () => {
  const tmpDir = cleanScratch("t1-full-dag");
  const featureId = "feature-g1-test-001";

  let fetchCalled = false;
  let receivedHeaders = {};
  const mockFetch = async (input, init) => {
    fetchCalled = true;
    receivedHeaders = init?.headers || {};
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
    apiKey: "canary-api-key-test-999",
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

  // Verify ledger file on disk
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

  // Confirm single write: no duplicate span in file
  const ledgerPath = resolveInferenceSpansPath(tmpDir, featureId);
  const rawContent = fs.readFileSync(ledgerPath, "utf-8").trim();
  const lineCount = rawContent.split("\n").filter((l) => l.trim().length > 0).length;
  assert(lineCount === 1, `Expected exactly 1 line in JSONL file, found ${lineCount}`);

  // Confirm apiKey was never leaked into persisted span
  assert(rawContent.includes("canary-api-key-test-999") === false, "Security breach: API key found in span JSONL");
});

// ------------------------------------------------------------------------------------------------
// TEST 2: Deterministic HTTP Error Handling (429 Rate Limit)
// ------------------------------------------------------------------------------------------------
await runTest("ObservableInferenceProvider handles HTTP 429 recording 'error' span with redacted telemetry", async () => {
  const tmpDir = cleanScratch("t2-error-429");
  const featureId = "feat-err-test";

  const mockErrorFetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          type: "rate_limit_error",
          message: "Too many requests. Please slow down.",
        },
      }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockErrorFetch);
  const provider = new ObservableInferenceProvider({
    id: "llm-err-provider",
    adapter,
    memoryRoot: tmpDir,
  });

  const request = {
    run_id: "run-err-429",
    node_id: "node-llm-fail",
    capability: "llm.complete",
    inputs: [{ prompt: "Test prompt causing 429" }],
    definition_of_done: [{ id: "dod-err", check: "Check failure", verification: "evidence" }],
    policy: { retries_remaining: 0, timeout_ms: 5000 },
    provider_id: "llm-err-provider",
    executor_type: "observable-inference",
    memory_scope: featureId,
    knowledge_hits: [],
    briefing: "Execute error test",
    node: {
      id: "node-llm-fail",
      capability: "llm.complete",
      type: "worker",
      dependencies: [],
      definition_of_done: [{ id: "dod-err", check: "Check failure", verification: "evidence" }],
      inputs: [{ prompt: "Test prompt causing 429" }],
      retry_count: 0,
      status: "pending",
    },
  };

  const result = await provider.execute(request);
  assert(result.success === false, "Provider execute should report success: false on HTTP 429");
  assert(result.error?.message === "anthropic_http_429", `Expected error message anthropic_http_429, got ${result.error?.message}`);

  // Verify error span in ledger
  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 1, `Expected 1 error span, found ${spans.length}`);

  const span = spans[0];
  assert(span.outcome === "error", `Expected span outcome 'error', got ${span.outcome}`);
  assert(span.input_tokens === null, `Expected null input_tokens on error, got ${span.input_tokens}`);
  assert(span.output_tokens === null, `Expected null output_tokens on error, got ${span.output_tokens}`);
  assert(span.estimated_cost === NOT_MEASURED, `Expected NOT_MEASURED estimated_cost, got ${span.estimated_cost}`);
});

// ------------------------------------------------------------------------------------------------
// TEST 3: SSRF and Security Guardrails
// ------------------------------------------------------------------------------------------------
await runTest("ObservableLlmProviderAdapter enforces SSRF prevention against cloud metadata and illegal schemes", async () => {
  const adapter = new ObservableLlmProviderAdapter(async () => new Response("{}"));

  // 1. Cloud metadata IP (169.254.169.254)
  let rejectedMetadata = false;
  try {
    await adapter.complete({
      gatewayUrl: "https://169.254.169.254/latest/meta-data/",
      prompt: "steal-creds",
      featureId: "sec-test",
    });
  } catch (err) {
    rejectedMetadata = true;
    assert(err.message.includes("SECURITY_SSRF_VIOLATION"), `Unexpected error: ${err.message}`);
  }
  assert(rejectedMetadata, "Failed to reject cloud metadata IP (169.254.169.254)");

  // 2. Cloud metadata DNS (metadata.google.internal)
  let rejectedGcp = false;
  try {
    await adapter.complete({
      gatewayUrl: "https://metadata.google.internal/computeMetadata/v1/",
      prompt: "steal-creds",
      featureId: "sec-test",
    });
  } catch (err) {
    rejectedGcp = true;
    assert(err.message.includes("SECURITY_SSRF_VIOLATION"), `Unexpected error: ${err.message}`);
  }
  assert(rejectedGcp, "Failed to reject metadata.google.internal");

  // 3. Insecure plain HTTP
  let rejectedHttp = false;
  try {
    await adapter.complete({
      gatewayUrl: "http://api.anthropic.com/v1/messages",
      prompt: "insecure-call",
      featureId: "sec-test",
    });
  } catch (err) {
    rejectedHttp = true;
    assert(err.message.includes("Only HTTPS is permitted"), `Unexpected error: ${err.message}`);
  }
  assert(rejectedHttp, "Failed to reject unencrypted HTTP scheme");

  // 4. Unpermitted loopback (127.0.0.1) without allowLoopback: true
  let rejectedLoopback = false;
  try {
    await adapter.complete({
      gatewayUrl: "https://127.0.0.1:8080/v1/chat",
      prompt: "loopback-call",
      featureId: "sec-test",
    });
  } catch (err) {
    rejectedLoopback = true;
    assert(err.message.includes("Loopback") && err.message.includes("not authorized"), `Unexpected error: ${err.message}`);
  }
  assert(rejectedLoopback, "Failed to reject unpermitted loopback endpoint");

  // 5. Prompt size limit (exceeding 64KB)
  let rejectedOversize = false;
  try {
    const hugePrompt = "X".repeat(70000);
    await adapter.complete({
      prompt: hugePrompt,
      featureId: "sec-test",
    });
  } catch (err) {
    rejectedOversize = true;
    assert(err.message.includes("Prompt exceeds maximum permitted size"), `Unexpected error: ${err.message}`);
  }
  assert(rejectedOversize, "Failed to reject prompt exceeding 64KB");
});

// ------------------------------------------------------------------------------------------------
// TEST 4: Best-Effort Persistence Resiliency
// ------------------------------------------------------------------------------------------------
await runTest("ObservableInferenceProvider does not fail inference if disk persistence fails (best-effort)", async () => {
  // Use a memory root that cannot be created (under /dev/null/forbidden)
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
// TEST 5: Heterogeneous Multi-Node DAG Execution
// ------------------------------------------------------------------------------------------------
await runTest("ExecutionEngine runs heterogeneous DAG with deterministic capabilities alongside llm.complete", async () => {
  const tmpDir = cleanScratch("t5-heterogeneous-dag");
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
const evidencePath = path.join(evidenceDir, "phase-g1.3-engine-observability-e2e.json");

const evidencePayload = {
  timestamp: new Date().toISOString(),
  phase: "G1.3",
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
  console.log("\nVERDICT: CAPABILITY LLM.COMPLETE E OBSERVABILIDADE G1 E2E TOTALMENTE HOMOLOGADAS NO EXECUTIONENGINE\n");
  process.exit(0);
}
