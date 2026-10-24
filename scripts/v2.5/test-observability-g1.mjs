#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for G1 Observability & Inference Ledger
 * Validates usage classification, token accounting, append-only persistence,
 * secret redaction/sanitization, and end-to-end telemetry emission.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";
import assert from "node:assert/strict";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = cp.spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(child.status ?? 0);
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const usageModule = path.join(workspaceRoot, "orchestrator/src/observability/inference-usage.ts");
const ledgerModule = path.join(workspaceRoot, "orchestrator/src/observability/inference-ledger.ts");
const adapterModule = path.join(workspaceRoot, "orchestrator/src/observability/observable-llm-adapter.ts");

const {
  classifyHttpInferenceUsage,
  assertSameMeasurementClass,
  NOT_MEASURED,
} = await import(usageModule);

const {
  appendInferenceSpan,
  readInferenceSpans,
  resolveInferenceSpansPath,
  sanitizeSpanRecord,
} = await import(ledgerModule);

const {
  ObservableLlmProviderAdapter,
} = await import(adapterModule);

console.log("================================================================================");
console.log("UKS G1 OBSERVABILITY & INFERENCE LEDGER SUITE (V2.5 Integration)");
console.log("================================================================================");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  const t0 = performance.now();
  try {
    fn();
    const dur = (performance.now() - t0).toFixed(2);
    console.log(`[✓ PASS] ${name} (${dur}ms)`);
    passed++;
  } catch (err) {
    const dur = (performance.now() - t0).toFixed(2);
    console.error(`[✗ FAIL] ${name} (${dur}ms):`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  const t0 = performance.now();
  try {
    await fn();
    const dur = (performance.now() - t0).toFixed(2);
    console.log(`[✓ PASS] ${name} (${dur}ms)`);
    passed++;
  } catch (err) {
    const dur = (performance.now() - t0).toFixed(2);
    console.error(`[✗ FAIL] ${name} (${dur}ms):`, err.message);
    failed++;
  }
}

// 1. Usage ausente não produz 0
runTest("usage ausente não produz 0 (input/output tokens null)", () => {
  const span = classifyHttpInferenceUsage({
    httpOk: true,
    body: { choices: [{ message: { content: "ok" } }] },
    provider: "openai",
    model: "gpt-4o",
  });
  assert.equal(span.input_tokens, null);
  assert.equal(span.output_tokens, null);
  assert.equal(span.usage_source, "desconhecido");
  assert.equal(span.usage_confidence, "NOT_MEASURED");
});

// 2. Campo não finito não produz 0
runTest("campo não finito (NaN / Infinity) não produz 0", () => {
  const span = classifyHttpInferenceUsage({
    httpOk: true,
    body: { usage: { prompt_tokens: NaN, completion_tokens: Infinity } },
    provider: "openai",
    model: "gpt-4o",
  });
  assert.equal(span.input_tokens, null);
  assert.equal(span.output_tokens, null);
});

// 3. Classificação correta de tokens informados pelo provedor
runTest("tokens informados pelo provedor são classificados como 'dado_provider'", () => {
  const span = classifyHttpInferenceUsage({
    httpOk: true,
    body: { usage: { prompt_tokens: 120, completion_tokens: 45 } },
    provider: "openai",
    model: "gpt-4o",
    runId: "run-123",
    taskId: "task-abc",
    agentId: "agent-01",
  });
  assert.equal(span.input_tokens, 120);
  assert.equal(span.output_tokens, 45);
  assert.equal(span.usage_source, "dado_provider");
  assert.equal(span.usage_confidence, "exact");
  assert.equal(span.outcome, "success");
  assert.equal(span.run_id, "run-123");
  assert.equal(span.task_id, "task-abc");
  assert.equal(span.agent_id, "agent-01");
});

// 4. Duas gravações deixam duas linhas append-only
runTest("duas gravações deixam duas linhas em JSONL (append-only)", () => {
  const tmpDir = path.join(workspaceRoot, ".test-harness/obs-tmp-ledger-1");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const span1 = {
      run_id: "r1",
      task_id: "t1",
      agent_id: "a1",
      phase: "exec",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      input_tokens: 100,
      output_tokens: 20,
      cached_input_tokens: null,
      usage_source: "dado_provider",
      usage_confidence: "exact",
      estimated_cost: NOT_MEASURED,
      actual_cost: NOT_MEASURED,
      retry_index: null,
      outcome: "success",
      duration_ms: 250,
    };
    const span2 = { ...span1, run_id: "r2", input_tokens: 200 };

    const res1 = appendInferenceSpan(tmpDir, "feature-alpha", span1);
    assert.equal(res1.ok, true);

    const res2 = appendInferenceSpan(tmpDir, "feature-alpha", span2);
    assert.equal(res2.ok, true);

    const records = readInferenceSpans(tmpDir, "feature-alpha");
    assert.equal(records.length, 2);
    assert.equal(records[0].run_id, "r1");
    assert.equal(records[0].input_tokens, 100);
    assert.equal(records[1].run_id, "r2");
    assert.equal(records[1].input_tokens, 200);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 5. Heterogeneidade rejeitada
runTest("assertSameMeasurementClass rejeita agregação entre 'dado_provider' e 'estimativa_local'", () => {
  assert.throws(
    () => {
      assertSameMeasurementClass("dado_provider", "estimativa_local");
    },
    /Cannot aggregate different measurement classes/,
  );
});

// 6. callIndex não preenche retry_index
runTest("callIndex não polui retry_index", () => {
  const span = classifyHttpInferenceUsage({
    httpOk: true,
    body: { usage: { input_tokens: 50, output_tokens: 10 } },
    callIndex: 3,
  });
  assert.equal(span.retry_index, null);
});

// 7. Custos são estritamente NOT_MEASURED
runTest("custos teóricos permanecem estritamente NOT_MEASURED (sem valores fictícios)", () => {
  const span = classifyHttpInferenceUsage({
    httpOk: true,
    body: { usage: { input_tokens: 50, output_tokens: 10 } },
  });
  assert.equal(span.estimated_cost, "NOT_MEASURED");
  assert.equal(span.actual_cost, "NOT_MEASURED");
});

// 8. Sanitização de segredos e canários
runTest("sanitização remove apiKey, authorization, headers e payloads de prompt/resposta", () => {
  const dirty = {
    apiKey: "sk-proj-SUPER_SECRET_123456789",
    authorization: "Bearer secret-token",
    headers: { "x-api-key": "secret" },
    prompt: "Canary prompt: SECRET_PASSWORD_999",
    response: "Confidential response",
    safe_meta: "allowed_value",
    input_tokens: 10,
  };
  const clean = sanitizeSpanRecord(dirty);
  assert.equal("apiKey" in clean, false);
  assert.equal("authorization" in clean, false);
  assert.equal("headers" in clean, false);
  assert.equal("prompt" in clean, false);
  assert.equal("response" in clean, false);
  assert.equal(clean.safe_meta, "allowed_value");
  assert.equal(clean.input_tokens, 10);
});

// 9. Resiliência a linhas corrompidas
runTest("readInferenceSpans ignora linhas corrompidas sem falhar o ledger", () => {
  const tmpDir = path.join(workspaceRoot, ".test-harness/obs-tmp-ledger-2");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const ledgerPath = resolveInferenceSpansPath(tmpDir, "feat-x");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      '{"run_id":"r1","input_tokens":50}\nNOT_VALID_JSON_LINE\n{"run_id":"r2","input_tokens":80}\n',
      "utf-8",
    );
    const records = readInferenceSpans(tmpDir, "feat-x");
    assert.equal(records.length, 2);
    assert.equal(records[0].run_id, "r1");
    assert.equal(records[1].run_id, "r2");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 10. Confinamento de escopo e proteção contra path traversal
runTest("assertFeatureIdConfined impede path traversal em featureId", () => {
  const tmpDir = path.join(workspaceRoot, ".test-harness/obs-tmp-ledger-3");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    assert.throws(
      () => {
        appendInferenceSpan(tmpDir, "../escape-dir", { input_tokens: 1 });
      },
      /escapes memory root/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 11. Best-effort em falha de I/O
runTest("best-effort: falha de escrita em disco não interrompe execução principal", () => {
  const res = appendInferenceSpan("/root/forbidden_memory_root", "feat", { input_tokens: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

// 12. Integração e validação do caminho real de execução com ObservableLlmProviderAdapter
await runAsyncTest("ObservableLlmProviderAdapter emite telemetria validada no caminho real", async () => {
  const tmpDir = path.join(workspaceRoot, ".test-harness/obs-tmp-adapter");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "UKS Core context synthesized." }],
          usage: { input_tokens: 420, output_tokens: 65 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const adapter = new ObservableLlmProviderAdapter(mockFetch);
    const result = await adapter.complete({
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "Synthesize architectural context" }],
      apiKey: "test-canary-key",
      memoryRoot: tmpDir,
      featureId: "feature-uks-e2e",
      runId: "run-e2e-001",
      taskId: "task-retrieve-01",
    });

    assert.equal(result.text, "UKS Core context synthesized.");
    assert.equal(result.ledgerWritten, true);
    assert.equal(result.span?.input_tokens, 420);
    assert.equal(result.span?.output_tokens, 65);
    assert.equal(result.span?.usage_source, "dado_provider");

    const records = readInferenceSpans(tmpDir, "feature-uks-e2e");
    assert.equal(records.length, 1);
    assert.equal(records[0].run_id, "run-e2e-001");
    assert.equal(records[0].input_tokens, 420);
    assert.equal(records[0].output_tokens, 65);
    assert.equal(records[0].model, "claude-3-5-sonnet");

    const fileContent = fs.readFileSync(resolveInferenceSpansPath(tmpDir, "feature-uks-e2e"), "utf-8");
    assert.equal(fileContent.includes("test-canary-key"), false);
    assert.equal(fileContent.includes("apiKey"), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 13. Resiliência a erro HTTP (500)
await runAsyncTest("ObservableLlmProviderAdapter trata HTTP 500 registrando falha e lançando", async () => {
  const tmpDir = path.join(workspaceRoot, ".test-harness/obs-tmp-error");
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const mockFetch = async () => {
      return new Response("Internal Server Error", { status: 500 });
    };

    const adapter = new ObservableLlmProviderAdapter(mockFetch);
    await assert.rejects(
      async () => {
        await adapter.complete({
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "user", content: "Query" }],
          memoryRoot: tmpDir,
          featureId: "feature-error-test",
          runId: "run-err-01",
        });
      },
      /openai_http_500/,
    );

    const records = readInferenceSpans(tmpDir, "feature-error-test");
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, "error");
    assert.equal(records[0].input_tokens, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log("================================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nVERDICT: OBSERVABILIDADE G1 INTEGRADA E VALIDADA COM SUCESSO NO UKS CORE V2.5");
}
