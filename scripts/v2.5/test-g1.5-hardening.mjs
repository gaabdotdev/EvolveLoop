#!/usr/bin/env -S node --experimental-transform-types
/**
 * Standalone Deterministic Test Suite for Phase G1.5:
 * Hardening of Policy Precedence, Transport Cancellation & DNS Rebinding Defense
 * 
 * Verifies:
 * G1.5-A: Policy vs Contract integrity, precedence (Math.min), negative/invalid handling
 * G1.5-B: Effective HTTP transport cancellation via AbortSignal, timeout handling, external cancellation
 * G1.5-C: Default-closed endpoint allowlist, DNS rebinding prevention, IPv4/IPv6 address inspection
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";
import * as os from "node:os";
import { register } from "node:module";

if (!process.execArgv.includes("--experimental-transform-types")) {
  const child = cp.spawnSync(
    process.execPath,
    ["--experimental-transform-types", ...process.argv.slice(1)],
    { stdio: "inherit", env: process.env }
  );
  process.exit(child.status ?? 0);
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

register(path.join(__dirname, "ts-loader.mjs"), import.meta.url);

const { ExecutionEngine } = await import(
  path.join(workspaceRoot, "orchestrator/src/engine/execution-engine.js")
);
const { ProviderRouter, createMockProvider } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/mock-provider.js")
);
const { ObservableInferenceProvider } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/observable-inference-provider.js")
);
const {
  ObservableLlmProviderAdapter,
  validateTargetUrl,
  validateTargetUrlAndResolve,
  DEFAULT_ALLOWLIST,
} = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/observable-llm-adapter.js")
);
const { PolicyEngine, parseTimeoutMs } = await import(
  path.join(workspaceRoot, "orchestrator/src/policies/policy-engine.js")
);
const { ContractRegistry, loadContractsFromDir } = await import(
  path.join(workspaceRoot, "orchestrator/src/contracts/contract-registry.js")
);
const { readInferenceSpans } = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/inference-ledger.js")
);

console.log("================================================================================");
console.log("UKS G1.5 HARDENING SUITE: POLICY PRECEDENCE, CANCELLATION & DNS DEFENSE");
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
    testResults.push({ name, status: "FAIL", durationMs: parseFloat(duration), error: err.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

const scratchDir = path.join(os.tmpdir(), "g1.5-test-" + Date.now());
fs.mkdirSync(scratchDir, { recursive: true });

function cleanScratch(sub) {
  const p = path.join(scratchDir, sub);
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ================================================================================================
// GROUP A: G1.5-A — Policy & Contract Precedence Integrity
// ================================================================================================

await runTest("G1.5-A: parseTimeoutMs accurately converts units (ms, s, m, h) and handles invalid formats", async () => {
  assert(parseTimeoutMs("500ms") === 500, "500ms failed");
  assert(parseTimeoutMs("30s") === 30000, "30s failed");
  assert(parseTimeoutMs("15m") === 900000, "15m failed");
  assert(parseTimeoutMs("2h") === 7200000, "2h failed");
  assert(parseTimeoutMs("1000") === 1000, "unitless failed");
  assert(parseTimeoutMs(undefined) === undefined, "undefined should be undefined");
  assert(parseTimeoutMs("invalid") === undefined, "invalid should be undefined");
  assert(parseTimeoutMs("-10s") === undefined, "negative should be undefined");
});

await runTest("G1.5-A: PolicyEngine retriesFor respects tighter ceiling between policy and contract (Math.min)", async () => {
  const policyEngine = new PolicyEngine();
  const highRelPolicy = policyEngine.resolve("high-reliability"); // worker: 3
  const rapidPolicy = policyEngine.resolve("rapid-prototype"); // default: 1

  const fakeNode = { id: "n1", capability: "llm.complete", type: "worker", dependencies: [] };

  // 1. Contract has max: 1, policy has worker: 3 -> effective is 1 (contract ceiling)
  const contractC1 = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker", retry_policy: { max: 1 } },
  };
  assert(policyEngine.retriesFor(highRelPolicy, fakeNode, contractC1) === 1, "Expected 1 retry ceiling from contract");

  // 2. Contract has max: 5, policy has worker: 3 -> effective is 3 (policy cannot be relaxed)
  const contractC5 = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker", retry_policy: { max: 5 } },
  };
  assert(policyEngine.retriesFor(highRelPolicy, fakeNode, contractC5) === 3, "Policy ceiling of 3 was relaxed");

  // 3. Contract has no retry_policy -> uses policy
  const contractNoRetry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker" },
  };
  assert(policyEngine.retriesFor(rapidPolicy, fakeNode, contractNoRetry) === 1, "Expected policy default of 1");

  // 4. Contract has negative or invalid retry_policy -> clamps to 0
  const contractInvalid = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker", retry_policy: { max: -3 } },
  };
  assert(policyEngine.retriesFor(highRelPolicy, fakeNode, contractInvalid) === 0, "Expected 0 for negative contract retries");
});

await runTest("G1.5-A: PolicyEngine resolveTimeoutMs takes the tighter bound between policy step_timeout and contract timeout", async () => {
  const policyEngine = new PolicyEngine();
  const highRelPolicy = policyEngine.resolve("high-reliability"); // step_timeout: "30m" (1800000ms)
  const rapidPolicy = policyEngine.resolve("rapid-prototype"); // step_timeout: undefined

  const fakeNode = { id: "n1", capability: "llm.complete", type: "worker", dependencies: [] };

  // 1. Policy 30m, Contract 30s -> effective is 30s (30000ms)
  const contract30s = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker", timeout: "30s" },
  };
  assert(policyEngine.resolveTimeoutMs(highRelPolicy, fakeNode, contract30s) === 30000, "Expected 30000ms from contract");

  // 2. Policy has no timeout, Contract has 10s -> effective is 10000ms
  const contract10s = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: { capability: "llm.complete", type: "worker", timeout: "10s" },
  };
  assert(policyEngine.resolveTimeoutMs(rapidPolicy, fakeNode, contract10s) === 10000, "Expected 10000ms from contract");

  // 3. Custom policy 5s, Contract 30s -> effective is 5000ms (policy tighter)
  const tightPolicy = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "tight", version: "1.0.0" },
    spec: { ...rapidPolicy.spec, timeouts: { step_timeout: "5s" } },
  };
  assert(policyEngine.resolveTimeoutMs(tightPolicy, fakeNode, contract30s) === 5000, "Expected 5000ms from tighter policy");
});

await runTest("G1.5-A: ExecutionEngine enforces contract retry ceiling in actual DAG execution with persistent failure", async () => {
  const tmpDir = cleanScratch("t-g15a-engine-retries");
  const featureId = "feat-g15a-ceiling";

  // Under high-reliability, policy allows worker: 3 (4 total calls).
  // But contract for llm.complete declares retry_policy.max: 1.
  // Effective retries MUST BE 1 (exactly 2 total calls), NOT 4!
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "Persistent 500" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  const provider = new ObservableInferenceProvider({ id: "obs-inf", adapter, memoryRoot: tmpDir });
  const router = new ProviderRouter();
  router.register(provider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [{ id: "obs-inf", name: "Obs Inf", plugin: "observable-inference" }],
      },
    },
  };

  // Register contract with retry_policy.max: 1
  const contractRegistry = new ContractRegistry([
    {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "Contract",
      metadata: { id: "llm.complete", version: "1.0.0" },
      spec: {
        capability: "llm.complete",
        type: "worker",
        retry_policy: { max: 1 },
      },
    },
  ]);

  const engine = new ExecutionEngine({
    registry,
    providers: router,
    contracts: contractRegistry,
  });

  const ir = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: { id: featureId, feature: "Ceiling Test", ir_version: "2.0.0", policy_ref: "high-reliability" },
    spec: {
      nodes: [
        {
          id: "step-1",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [{ prompt: "test ceiling" }],
          definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({ ir, policy_id: "high-reliability", feature_id: featureId });

  assert(result.success === false, "Run should fail");
  assert(result.blocked_reason === "unrecoverable_failure", "Expected unrecoverable_failure");
  assert(calls === 2, `Contract retry ceiling failed! Expected 2 calls (1 initial + 1 retry), got ${calls}`);

  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 2, `Expected 2 spans in ledger, found ${spans.length}`);
});

// ================================================================================================
// GROUP B: G1.5-B — Timeout & Effective Transport Cancellation
// ================================================================================================

await runTest("G1.5-B: Timeout cancels underlying HTTP transport via AbortSignal and records error span", async () => {
  const tmpDir = cleanScratch("t-g15b-timeout");
  const featureId = "feat-timeout-test";

  let signalReceived = null;
  let signalAbortedOnExit = false;

  const hangingFetch = async (url, init) => {
    signalReceived = init?.signal;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {}, 2000);
      // If signal aborts, reject immediately
      if (init?.signal) {
        init.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          signalAbortedOnExit = true;
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          reject(err);
        });
      }
      // Otherwise simulate hanging server
    });
  };

  const adapter = new ObservableLlmProviderAdapter(hangingFetch);
  const provider = new ObservableInferenceProvider({
    id: "obs-inf-timeout",
    adapter,
    memoryRoot: tmpDir,
  });

  const request = {
    run_id: "run-timeout-01",
    node_id: "node-llm-timeout",
    capability: "llm.complete",
    inputs: [{ prompt: "Hanging prompt" }],
    definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
    policy: {
      retries_remaining: 0,
      timeout_ms: 50, // 50ms fast timeout
    },
    provider_id: "obs-inf-timeout",
    executor_type: "observable-inference",
    memory_scope: featureId,
    knowledge_hits: [],
    briefing: "Timeout test",
    node: {
      id: "node-llm-timeout",
      capability: "llm.complete",
      type: "worker",
      dependencies: [],
      definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
      inputs: [{ prompt: "Hanging prompt" }],
      retry_count: 0,
      status: "pending",
    },
  };

  const start = performance.now();
  const result = await provider.execute(request);
  const duration = performance.now() - start;

  assert(result.success === false, "Execution should report failure on timeout");
  assert(result.error?.code === "TIMEOUT", `Expected error.code 'TIMEOUT', got '${result.error?.code}'`);
  assert(duration < 500, `Execution took too long (${duration}ms), timeout was not enforced promptly`);
  assert(signalReceived !== null, "AbortSignal was not passed to fetchImpl");
  assert(signalAbortedOnExit === true, "AbortSignal was not triggered on timeout");

  // Ledger span recording
  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 1, `Expected 1 error span in ledger, found ${spans.length}`);
  assert(spans[0].outcome === "error", "Span outcome should be 'error'");
});

await runTest("G1.5-B: External cancellation via provider.cancel(runId) aborts in-flight HTTP request", async () => {
  const tmpDir = cleanScratch("t-g15b-cancel");
  const featureId = "feat-cancel-test";

  let abortedByExternal = false;
  const longFetch = async (url, init) => {
    return new Promise((resolve, reject) => {
      const failAbort = () => {
        abortedByExternal = true;
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      // Node 22 does not dispatch "abort" if the signal is already aborted
      // when the listener is added. cancel() can win the race against DNS,
      // so fetch is entered with signal.aborted === true (reason CANCELLED).
      if (init?.signal?.aborted) {
        failAbort();
        return;
      }
      init?.signal?.addEventListener("abort", failAbort);
    });
  };

  const adapter = new ObservableLlmProviderAdapter(longFetch);
  const provider = new ObservableInferenceProvider({ id: "obs-inf-cancel", adapter, memoryRoot: tmpDir });

  const runId = "run-cancel-target-001";
  const request = {
    run_id: runId,
    node_id: "node-llm-cancel",
    capability: "llm.complete",
    inputs: [{ prompt: "Long running" }],
    definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
    policy: { retries_remaining: 0, timeout_ms: 10000 },
    provider_id: "obs-inf-cancel",
    executor_type: "observable-inference",
    memory_scope: featureId,
    knowledge_hits: [],
    briefing: "Cancel test",
    node: {
      id: "node-llm-cancel",
      capability: "llm.complete",
      type: "worker",
      dependencies: [],
      definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
      inputs: [{ prompt: "Long running" }],
      retry_count: 0,
      status: "pending",
    },
  };

  // Launch in background, then cancel after 30ms
  const execPromise = provider.execute(request);
  setTimeout(() => {
    provider.cancel(runId);
  }, 30);

  const result = await execPromise;

  assert(result.success === false, "Execution should report failure on cancellation");
  assert(result.error?.code === "CANCELLED", `Expected code 'CANCELLED', got '${result.error?.code}'`);
  assert(abortedByExternal === true, "Underlying transport was not aborted by external cancel");
});

await runTest("G1.5-B: Timeout recovery on retry: attempt 1 times out, attempt 2 responds in time", async () => {
  const tmpDir = cleanScratch("t-g15b-timeout-retry");
  const featureId = "feat-timeout-retry";

  let calls = 0;
  const mockFetch = async (url, init) => {
    calls++;
    if (calls === 1) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {}, 2000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const err = new Error("TimeoutError");
          err.name = "TimeoutError";
          reject(err);
        });
      });
    }
    // Attempt 2 succeeds quickly
    return new Response(
      JSON.stringify({
        id: "msg_ok",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Success on retry after timeout" }],
        usage: { input_tokens: 20, output_tokens: 40 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  const provider = new ObservableInferenceProvider({ id: "obs-inf-tr", adapter, memoryRoot: tmpDir });
  const router = new ProviderRouter();
  router.register(provider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [{ id: "obs-inf-tr", name: "Obs Inf", plugin: "observable-inference" }],
      },
    },
  };

  const customPolicy = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "custom-timeout-policy", version: "1.0.0" },
    spec: {
      retries: { default: 1 },
      gates: { required: [], skipped: [] },
      provider_strategy: "fastest",
      parallelism: { max_parallel: 1, mode: "async" },
      timeouts: { step_timeout: "50ms" }, // 50ms timeout
      on_gate_reject: "orchestrator",
      on_evidence_missing: "fail",
      fail_fast: true,
      execution_order: "topological",
    },
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
    customPolicies: [customPolicy],
  });

  const ir = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: { id: featureId, feature: "Timeout Retry", ir_version: "2.0.0", policy_ref: "custom-timeout-policy" },
    spec: {
      nodes: [
        {
          id: "step-timeout-recover",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [{ prompt: "test recovery" }],
          definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({ ir, policy_id: "custom-timeout-policy", feature_id: featureId });

  assert(result.success === true, `Execution failed: ${result.blocked_reason}`);
  assert(calls === 2, `Expected exactly 2 calls, got ${calls}`);
  assert(result.graph.nodes[0].status === "satisfied", "Node should be satisfied on retry");

  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 2, `Expected 2 spans (1 error, 1 success), found ${spans.length}`);
  assert(spans[0].outcome === "error", "First span must be error");
  assert(spans[1].outcome === "success", "Second span must be success");
});

// ================================================================================================
// GROUP C: G1.5-C — DNS Rebinding Defense & Endpoint Allowlist
// ================================================================================================

await runTest("G1.5-C: Approved provider endpoints in DEFAULT_ALLOWLIST are accepted", async () => {
  const parsedAnthropic = await validateTargetUrlAndResolve("https://api.anthropic.com/v1/messages");
  assert(parsedAnthropic.hostname === "api.anthropic.com", "api.anthropic.com should be accepted");

  const parsedOpenAi = await validateTargetUrlAndResolve("https://api.openai.com/v1/chat/completions");
  assert(parsedOpenAi.hostname === "api.openai.com", "api.openai.com should be accepted");
});

await runTest("G1.5-C: Unapproved custom gateway is rejected by default (Default-Closed allowlist)", async () => {
  let threw = false;
  try {
    await validateTargetUrlAndResolve("https://unapproved-gateway.company.com/v1/chat");
  } catch (err) {
    threw = true;
    assert(err.message.includes("not in the approved endpoint allowlist"), `Unexpected error: ${err.message}`);
  }
  assert(threw, "Unapproved custom gateway was not rejected!");
});

await runTest("G1.5-C: Custom gateway with allowCustomGateway: true checks DNS and rejects private IPv4 (RFC 1918 / Loopback)", async () => {
  // Mock DNS resolver returning private IP (e.g. 10.0.0.1 or 127.0.0.1)
  const mockDnsPrivate = async (hostname) => {
    return [{ address: "10.0.0.1", family: 4 }];
  };

  let threwPrivate = false;
  try {
    await validateTargetUrlAndResolve("https://custom-proxy.internal.net/v1", {
      allowCustomGateway: true,
      dnsLookup: mockDnsPrivate,
    });
  } catch (err) {
    threwPrivate = true;
    assert(err.message.includes("returned forbidden IP '10.0.0.1'"), `Unexpected error: ${err.message}`);
  }
  assert(threwPrivate, "Custom gateway resolving to 10.0.0.1 was not blocked!");

  // Mock DNS resolver returning loopback 127.0.0.1 without allowLoopback
  const mockDnsLoopback = async (hostname) => {
    return [{ address: "127.0.0.1", family: 4 }];
  };

  let threwLoopback = false;
  try {
    await validateTargetUrlAndResolve("https://127.0.0.1.nip.io/v1", {
      allowCustomGateway: true,
      dnsLookup: mockDnsLoopback,
    });
  } catch (err) {
    threwLoopback = true;
    assert(err.message.includes("returned forbidden IP '127.0.0.1'"), `Unexpected error: ${err.message}`);
  }
  assert(threwLoopback, "DNS rebinding domain (127.0.0.1.nip.io) was not blocked!");
});

await runTest("G1.5-C: DNS resolution returning cloud metadata IP (169.254.169.254) is rejected even with allowLoopback: true", async () => {
  const mockDnsMetadata = async () => [{ address: "169.254.169.254", family: 4 }];

  let threw = false;
  try {
    await validateTargetUrlAndResolve("https://metadata-rebinding.evil.com/latest", {
      allowCustomGateway: true,
      allowLoopback: true, // Loopback is allowed, but metadata IP must still be blocked!
      dnsLookup: mockDnsMetadata,
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("returned forbidden IP '169.254.169.254'"), `Unexpected error: ${err.message}`);
  }
  assert(threw, "Metadata IP from DNS was not blocked!");
});

await runTest("G1.5-C: Custom gateway with allowCustomGateway: true and public IP is accepted", async () => {
  const mockDnsPublic = async () => [{ address: "93.184.216.34", family: 4 }];

  const parsed = await validateTargetUrlAndResolve("https://authorized-partner-gateway.com/v1/chat", {
    allowCustomGateway: true,
    dnsLookup: mockDnsPublic,
  });
  assert(parsed.hostname === "authorized-partner-gateway.com", "Valid public custom gateway was not accepted");
});

await runTest("G1.5-C: DNS resolution failure throws explicit SSRF violation", async () => {
  const mockDnsFail = async () => {
    throw new Error("getaddrinfo ENOTFOUND invalid-domain.test");
  };

  let threw = false;
  try {
    await validateTargetUrlAndResolve("https://invalid-domain.test/v1", {
      allowCustomGateway: true,
      dnsLookup: mockDnsFail,
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("DNS resolution failed"), `Unexpected error: ${err.message}`);
  }
  assert(threw, "DNS failure did not throw SSRF violation");
});

console.log("================================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("================================================================================");

const evidenceDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.join(evidenceDir, "phase-g1.5-hardening.json");

const evidencePayload = {
  timestamp: new Date().toISOString(),
  phase: "G1.5",
  total_tests: passed + failed,
  passed,
  failed,
  verdict: failed === 0 ? "APROVADO" : "REPROVADO",
  test_results: testResults,
};

fs.writeFileSync(evidencePath, JSON.stringify(evidencePayload, null, 2), "utf-8");
console.log(`\n[+] Evidence written to: ${evidencePath}`);

try {
  fs.rmSync(scratchDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nVERDICT: TODAS AS VERIFICAÇÕES G1.5 (A, B, C) HOMOLOGADAS COM SUCESSO!\n");
  process.exit(0);
}
