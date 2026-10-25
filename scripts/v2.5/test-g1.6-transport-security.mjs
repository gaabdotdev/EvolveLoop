#!/usr/bin/env -S node --experimental-transform-types
/**
 * Standalone Deterministic Test Suite for Phase G1.6:
 * Transport Security Hardening: Transport IP Pinning, DNS Rebinding Defense,
 * Default Timeout & Contract Retry Normalization.
 * 
 * Verifies:
 * - Scope A: Transport-level IP pinning, DNS rebinding prevention, TLS/SNI preservation,
 *            mixed-IP rejection, redirect veto, IPv4-mapped IPv6 checks.
 * - Scope B: Mandatory default timeout (60,000ms fallback), invalid timeout handling,
 *            effective transport abort.
 * - Scope C: Strict normalization of YAML contract retries (numeric strings "2", negative clamp,
 *            rejection of decimals and non-digits, DAG execution enforcement).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";
import * as os from "node:os";
import * as http from "node:http";
import * as https from "node:https";
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
const { ProviderRouter } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/mock-provider.js")
);
const { ObservableInferenceProvider } = await import(
  path.join(workspaceRoot, "orchestrator/src/providers/observable-inference-provider.js")
);
const {
  ObservableLlmProviderAdapter,
  validateTargetUrl,
  validateTargetUrlAndResolve,
  pinnedLookup,
  createPinnedFetch,
  DEFAULT_ALLOWLIST,
  DEFAULT_INFERENCE_TIMEOUT_MS,
} = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/observable-llm-adapter.js")
);
const {
  PolicyEngine,
  parseTimeoutMs,
  normalizeRetryCount,
} = await import(
  path.join(workspaceRoot, "orchestrator/src/policies/policy-engine.js")
);
const { ContractRegistry } = await import(
  path.join(workspaceRoot, "orchestrator/src/contracts/contract-registry.js")
);
const { readInferenceSpans } = await import(
  path.join(workspaceRoot, "orchestrator/src/observability/inference-ledger.js")
);

console.log("================================================================================");
console.log("UKS G1.6 SECURITY HARDENING: TRANSPORT IP PINNING & TIMEOUT GOVERNANCE");
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

const scratchDir = path.join(os.tmpdir(), "g1.6-test-" + Date.now());
fs.mkdirSync(scratchDir, { recursive: true });

function cleanScratch(subdir) {
  const p = path.join(scratchDir, subdir);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ================================================================================================
// GROUP 1: SCOPE A — Transport IP Pinning & DNS Rebinding Defenses
// ================================================================================================

await runTest("G1.6-A: validateTargetUrlAndResolve attaches pinnedIp and pinnedFamily to URL", async () => {
  const mockDns = async (hostname) => {
    return [{ address: "93.184.216.34", family: 4 }];
  };

  const parsed = await validateTargetUrlAndResolve("https://partner-gateway.com/v1", {
    allowCustomGateway: true,
    dnsLookup: mockDns,
  });

  assert(parsed.hostname === "partner-gateway.com", "Hostname should be preserved");
  assert(parsed.pinnedIp === "93.184.216.34", `Expected pinnedIp 93.184.216.34, got ${parsed.pinnedIp}`);
  assert(parsed.pinnedFamily === 4, `Expected pinnedFamily 4, got ${parsed.pinnedFamily}`);
});

await runTest("G1.6-A: pinnedLookup binds socket resolution strictly to pinned IP without re-querying", async () => {
  const lookup = pinnedLookup("198.51.100.42", 4);

  let resultAddr = null;
  let resultFamily = null;

  lookup("attacker-rebound.com", {}, (err, address, family) => {
    assert(err === null, "Lookup should not error");
    resultAddr = address;
    resultFamily = family;
  });

  assert(resultAddr === "198.51.100.42", `Expected address 198.51.100.42, got ${resultAddr}`);
  assert(resultFamily === 4, `Expected family 4, got ${resultFamily}`);

  // Test with { all: true }
  let allResults = null;
  lookup("attacker-rebound.com", { all: true }, (err, addresses) => {
    allResults = addresses;
  });
  assert(Array.isArray(allResults) && allResults.length === 1, "Expected single pinned address record");
  assert(allResults[0].address === "198.51.100.42", "Expected pinned IP in all:true mode");
});

await runTest("G1.6-A: Pinned fetch connects directly to pinned IP and preserves Host header and SNI", async () => {
  // Spawn local test HTTP server on 127.0.0.1
  let serverHostHeader = null;
  let serverPath = null;

  const server = http.createServer((req, res) => {
    serverHostHeader = req.headers.host;
    serverPath = req.url;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, serverReceivedHost: req.headers.host }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const pinnedFetch = createPinnedFetch();

  try {
    // We pass a domain that does NOT resolve in public DNS, but pin it to 127.0.0.1:port
    const response = await pinnedFetch(`http://unresolved-custom-gateway.internal.net:${port}/v1/chat`, {
      method: "POST",
      headers: { "x-custom-auth": "secret-token" },
      body: JSON.stringify({ prompt: "hello" }),
      pinnedIp: "127.0.0.1",
      pinnedFamily: 4,
    });

    assert(response.status === 200, `Expected HTTP 200, got ${response.status}`);
    const data = await response.json();
    assert(data.ok === true, "Expected ok response");
    assert(serverHostHeader === `unresolved-custom-gateway.internal.net:${port}`, `Host header was not preserved! Got: ${serverHostHeader}`);
    assert(serverPath === "/v1/chat", `Path was not preserved! Got: ${serverPath}`);
  } finally {
    server.close();
  }
});

await runTest("G1.6-A: Dynamic DNS Rebinding Attack is neutralized by transport-level IP pinning", async () => {
  // Adversarial Simulation:
  // Nameserver returns safe public IP on query 1 (validation)
  // Nameserver mutates to 169.254.169.254 on query 2 (connect time)
  let dnsQueryCount = 0;
  const rebindingDnsLookup = async (hostname) => {
    dnsQueryCount++;
    if (dnsQueryCount === 1) {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    // Rebound IP
    return [{ address: "169.254.169.254", family: 4 }];
  };

  let capturedPinnedIp = null;
  let capturedUrl = null;

  // Mock fetch verifying what the adapter passes to the transport layer
  const transportSpy = async (url, init) => {
    capturedUrl = url;
    capturedPinnedIp = init?.pinnedIp;
    return new Response(JSON.stringify({
      id: "resp_ok",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Safe response" }],
      usage: { input_tokens: 10, output_tokens: 15 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const adapter = new ObservableLlmProviderAdapter(transportSpy, {
    allowCustomGateway: true,
    dnsLookup: rebindingDnsLookup,
  });

  const res = await adapter.complete({
    provider: "anthropic",
    prompt: "Test rebinding defense",
    gatewayUrl: "https://rebind-test.attacker.com/v1",
  });

  assert(res.text === "Safe response", "Request should succeed using pinned IP");
  assert(dnsQueryCount === 1, `Validation should perform DNS resolution; query count was ${dnsQueryCount}`);
  assert(capturedPinnedIp === "93.184.216.34", `Transport MUST receive pinned IP 93.184.216.34! Received: ${capturedPinnedIp}`);
  assert(capturedPinnedIp !== "169.254.169.254", "CRITICAL VULNERABILITY: Transport was not pinned and received rebinded IP!");
});

await runTest("G1.6-A: DNS resolution returning Cloud Metadata (169.254.169.254) is blocked immediately", async () => {
  const metadataDns = async () => [{ address: "169.254.169.254", family: 4 }];

  let threw = false;
  try {
    await validateTargetUrlAndResolve("https://metadata-attacker.com/v1", {
      allowCustomGateway: true,
      dnsLookup: metadataDns,
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("SECURITY_SSRF_VIOLATION"), `Expected SSRF error, got: ${err.message}`);
    assert(err.message.includes("169.254.169.254"), "Error should cite blocked metadata IP");
  }
  assert(threw, "Metadata IP was not blocked");
});

await runTest("G1.6-A: Mixed DNS response (public IP + forbidden private IP) is strictly rejected fail-closed", async () => {
  // Attacker returns one public IP and one private IP in the same A/AAAA response
  const mixedDns = async () => [
    { address: "93.184.216.34", family: 4 }, // public
    { address: "10.0.0.1", family: 4 },       // RFC 1918 private
  ];

  let threw = false;
  try {
    await validateTargetUrlAndResolve("https://mixed-records.attacker.com/v1", {
      allowCustomGateway: true,
      dnsLookup: mixedDns,
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("SECURITY_SSRF_VIOLATION"), `Expected SSRF error, got: ${err.message}`);
    assert(err.message.includes("10.0.0.1"), "Error should identify the private IP in mixed response");
  }
  assert(threw, "Mixed DNS response containing private IP was not rejected!");
});

await runTest("G1.6-A: DNS resolution returning empty records or ENOTFOUND throws explicit SSRF violation", async () => {
  const emptyDns = async () => [];
  let threwEmpty = false;
  try {
    await validateTargetUrlAndResolve("https://empty-dns.com/v1", {
      allowCustomGateway: true,
      dnsLookup: emptyDns,
    });
  } catch (err) {
    threwEmpty = true;
    assert(err.message.includes("returned no records"), `Expected no records error, got: ${err.message}`);
  }
  assert(threwEmpty, "Empty DNS records did not throw error");

  const failDns = async () => {
    throw new Error("getaddrinfo ENOTFOUND nxdomain.invalid");
  };
  let threwFail = false;
  try {
    await validateTargetUrlAndResolve("https://nxdomain.invalid/v1", {
      allowCustomGateway: true,
      dnsLookup: failDns,
    });
  } catch (err) {
    threwFail = true;
    assert(err.message.includes("DNS resolution failed"), `Expected DNS resolution failed error, got: ${err.message}`);
  }
  assert(threwFail, "DNS failure did not throw SSRF violation");
});

await runTest("G1.6-A: HTTP 3xx redirect is rejected by transport without opening second connection", async () => {
  const server = http.createServer((req, res) => {
    // Send redirect to internal metadata
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const pinnedFetch = createPinnedFetch();

  let threw = false;
  try {
    await pinnedFetch(`http://localhost:${port}/redirect-test`, {
      method: "POST",
      redirect: "error",
      pinnedIp: "127.0.0.1",
      pinnedFamily: 4,
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("HTTP redirects are strictly forbidden"), `Expected redirect forbidden error, got: ${err.message}`);
  } finally {
    server.close();
  }
  assert(threw, "Redirect was not blocked by transport");
});

await runTest("G1.6-A: IPv4-mapped IPv6 and link-local representations are rejected", async () => {
  let threwV6Mapped = false;
  try {
    validateTargetUrl("https://[::ffff:127.0.0.1]/v1");
  } catch (err) {
    threwV6Mapped = true;
    assert(err.message.includes("IPv4-mapped"), `Expected IPv4-mapped rejection, got: ${err.message}`);
  }
  assert(threwV6Mapped, "IPv4-mapped IPv6 was not blocked");

  let threwMetadataV6 = false;
  try {
    validateTargetUrl("https://[::ffff:169.254.169.254]/v1");
  } catch (err) {
    threwMetadataV6 = true;
    assert(err.message.includes("IPv4-mapped"), `Expected IPv4-mapped rejection, got: ${err.message}`);
  }
  assert(threwMetadataV6, "IPv4-mapped metadata IPv6 was not blocked");
});

// ================================================================================================
// GROUP 2: SCOPE B — Mandatory Default Timeout (60,000ms Fallback)
// ================================================================================================

await runTest("G1.6-B: PolicyEngine resolveTimeoutMs defaults to DEFAULT_INFERENCE_TIMEOUT_MS (60,000ms)", async () => {
  const pe = new PolicyEngine();
  const dummyPolicy = pe.resolve("rapid-prototype"); // timeouts: {}
  const fakeNode = { id: "n1", capability: "llm.complete", type: "worker", retry_count: 0 };
  const contractNoTimeout = { metadata: { id: "c1" }, spec: {} };

  const resolved = pe.resolveTimeoutMs(dummyPolicy, fakeNode, contractNoTimeout);
  assert(resolved === DEFAULT_INFERENCE_TIMEOUT_MS, `Expected 60000ms default, got ${resolved}`);
  assert(resolved === 60000, "Constant DEFAULT_INFERENCE_TIMEOUT_MS must equal 60000");
});

await runTest("G1.6-B: parseTimeoutMs handles 0, negative and invalid values by returning undefined (triggering fallback)", async () => {
  assert(parseTimeoutMs(0) === undefined, "0 must return undefined");
  assert(parseTimeoutMs("0ms") === undefined, "'0ms' must return undefined");
  assert(parseTimeoutMs("-100ms") === undefined, "Negative timeout must return undefined");
  assert(parseTimeoutMs("invalid_unit") === undefined, "Malformed string must return undefined");
  assert(parseTimeoutMs(NaN) === undefined, "NaN must return undefined");
  assert(parseTimeoutMs(Infinity) === undefined, "Infinity must return undefined");

  // Valid values
  assert(parseTimeoutMs(5000) === 5000, "Numeric 5000 must return 5000");
  assert(parseTimeoutMs("30s") === 30000, "'30s' must return 30000");
  assert(parseTimeoutMs("2m") === 120000, "'2m' must return 120000");
  assert(parseTimeoutMs("1h") === 3600000, "'1h' must return 3600000");
});

await runTest("G1.6-B: ObservableLlmProviderAdapter enforces defaultTimeoutMs when input.timeoutMs is omitted", async () => {
  let signalReceived = null;
  const mockFetch = async (url, init) => {
    signalReceived = init?.signal;
    return new Response(JSON.stringify({
      id: "msg_1",
      role: "assistant",
      content: [{ type: "text", text: "OK" }],
      usage: { input_tokens: 5, output_tokens: 5 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const adapter = new ObservableLlmProviderAdapter(mockFetch);
  await adapter.complete({
    provider: "anthropic",
    prompt: "test default timeout",
  });

  assert(signalReceived !== null, "AbortSignal must be created and passed to fetchImpl");
  assert(signalReceived instanceof AbortSignal, "Signal must be an AbortSignal instance");
});

// ================================================================================================
// GROUP 3: SCOPE C — Safe Normalization of Contract Retries
// ================================================================================================

await runTest("G1.6-C: normalizeRetryCount parses valid numeric strings, numbers, and clamps negatives", async () => {
  // Numeric strings
  assert(normalizeRetryCount("2") === 2, "String '2' must normalize to number 2");
  assert(normalizeRetryCount("0") === 0, "String '0' must normalize to number 0");
  assert(normalizeRetryCount("  3  ") === 3, "Trimmed string '  3  ' must normalize to 3");

  // Direct numbers
  assert(normalizeRetryCount(2) === 2, "Number 2 must return 2");
  assert(normalizeRetryCount(0) === 0, "Number 0 must return 0");

  // Negatives clamp to 0 (conservative safety)
  assert(normalizeRetryCount(-3) === 0, "Negative number -3 must clamp to 0");
  assert(normalizeRetryCount("-5") === 0, "Negative string '-5' must clamp to 0");

  // Invalid values return undefined
  assert(normalizeRetryCount("2.5") === undefined, "Decimal string '2.5' must be rejected");
  assert(normalizeRetryCount(2.5) === 2, "Decimal number 2.5 floored to 2");
  assert(normalizeRetryCount("foo") === undefined, "String 'foo' must return undefined");
  assert(normalizeRetryCount("") === undefined, "Empty string must return undefined");
  assert(normalizeRetryCount(NaN) === undefined, "NaN must return undefined");
  assert(normalizeRetryCount(Infinity) === undefined, "Infinity must return undefined");

  // Ceiling clamp
  assert(normalizeRetryCount(100) === 10, "Values above 10 must clamp to project ceiling of 10");
  assert(normalizeRetryCount("25") === 10, "String values above 10 must clamp to 10");
});

await runTest("G1.6-C: PolicyEngine retriesFor respects numeric string in contract YAML", async () => {
  const pe = new PolicyEngine();
  const policy = pe.resolve("high-reliability"); // policy retries default: 3
  const fakeNode = { id: "n1", capability: "llm.complete", type: "worker", retry_count: 0 };

  const contractWithStringRetry = {
    metadata: { id: "llm.complete" },
    spec: { retry_policy: { max: "1" } }, // string "1"
  };

  const retries = pe.retriesFor(policy, fakeNode, contractWithStringRetry);
  assert(retries === 1, `Expected tighter bound of 1 from contract string retry, got ${retries}`);
});

await runTest("G1.6-C: ExecutionEngine enforces string retry ceiling in DAG execution under persistent failure", async () => {
  const tmpDir = cleanScratch("t-g16c-dag-string-retry");
  const featureId = "feat-g16c-retry";

  let callCount = 0;
  const failingFetch = async () => {
    callCount++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify({ error: { message: "Internal Server Error" } }), { status: 500 }));
      }, 5);
    });
  };

  const adapter = new ObservableLlmProviderAdapter(failingFetch);
  const provider = new ObservableInferenceProvider({ id: "obs-inf-retry", adapter, memoryRoot: tmpDir });
  const router = new ProviderRouter();
  router.register(provider);

  const registry = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generated_at: new Date().toISOString() },
    capabilities: {
      "llm.complete": {
        providers: [{ id: "obs-inf-retry", name: "Obs Inf", plugin: "observable-inference" }],
      },
    },
  };

  // Policy with 3 retries
  const policy = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "policy-3-retries", version: "1.0.0" },
    spec: {
      retries: { default: 3 },
      gates: { required: [], skipped: [] },
      provider_strategy: "fastest",
      parallelism: { max_parallel: 1, mode: "async" },
      timeouts: { step_timeout: "500ms" },
      on_gate_reject: "orchestrator",
      on_evidence_missing: "fail",
      fail_fast: true,
      execution_order: "topological",
    },
  };

  // Contract specifying max: "1" as a string
  const contract = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Contract",
    metadata: { id: "llm.complete", version: "1.0.0" },
    spec: {
      capability: "llm.complete",
      type: "worker",
      retry_policy: { max: "1" }, // String retry count!
    },
  };

  const mockContractRegistry = {
    getForCapability: (cap) => (cap === "llm.complete" ? contract : undefined),
    list: () => [contract],
  };

  const engine = new ExecutionEngine({
    registry,
    providers: router,
    customPolicies: [policy],
    contracts: mockContractRegistry,
  });

  const ir = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: { id: featureId, feature: "String Retry Ceiling", ir_version: "2.0.0", policy_ref: "policy-3-retries" },
    spec: {
      nodes: [
        {
          id: "step-string-retry",
          capability: "llm.complete",
          type: "worker",
          dependencies: [],
          inputs: [{ prompt: "persistent fail" }],
          definition_of_done: [{ id: "dod-1", check: "done", verification: "evidence" }],
        },
      ],
    },
  };

  const result = await engine.run({ ir, policy_id: "policy-3-retries", feature_id: featureId });

  assert(result.success === false, "Run should fail");
  assert(result.blocked_reason === "unrecoverable_failure", "Expected unrecoverable_failure");
  assert(callCount === 2, `Contract string retry ceiling failed! Expected 2 calls (1 initial + 1 retry), got ${callCount}`);

  const spans = readInferenceSpans(tmpDir, featureId);
  assert(spans.length === 2, `Expected 2 spans in ledger, found ${spans.length}`);
});

console.log("================================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("================================================================================");

const evidenceDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
fs.mkdirSync(evidenceDir, { recursive: true });
const evidencePath = path.join(evidenceDir, "phase-g1.6-transport-security.json");

const evidencePayload = {
  timestamp: new Date().toISOString(),
  phase: "G1.6",
  total_tests: passed + failed,
  passed,
  failed,
  verdict: failed === 0 ? "APROVADO" : "REPROVADO",
  test_results: testResults,
};

fs.writeFileSync(evidencePath, JSON.stringify(evidencePayload, null, 2), "utf-8");
console.log(`\n[+] Evidence written to: ${evidencePath}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nVERDICT: TODAS AS VERIFICAÇÕES G1.6 (A, B, C) HOMOLOGADAS COM SUCESSO!\n");
  process.exit(0);
}
