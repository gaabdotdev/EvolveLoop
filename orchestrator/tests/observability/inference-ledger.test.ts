import { describe, it } from "vitest";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classifyHttpInferenceUsage,
  assertSameMeasurementClass,
  type InferenceSpanRecord,
  NOT_MEASURED,
} from "../../src/observability/inference-usage.js";
import {
  appendInferenceSpan,
  readInferenceSpans,
  resolveInferenceSpansPath,
  sanitizeSpanRecord,
} from "../../src/observability/inference-ledger.js";
import {
  ObservableLlmProviderAdapter,
} from "../../src/observability/observable-llm-adapter.js";

describe("UKS G1 Observability & Inference Ledger Suite", () => {
  it("usage ausente não produz 0", () => {
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

  it("campo não finito não produz 0", () => {
    const span = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { prompt_tokens: NaN, completion_tokens: Infinity } },
      provider: "openai",
      model: "gpt-4o",
    });
    assert.equal(span.input_tokens, null);
    assert.equal(span.output_tokens, null);
  });

  it("classificação correta de tokens informados pelo provedor", () => {
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

  it("duas gravações deixam duas linhas append-only", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-ledger-test-"));
    try {
      const span1: InferenceSpanRecord = {
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

      const span2: InferenceSpanRecord = {
        ...span1,
        run_id: "r2",
        input_tokens: 200,
      };

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

  it("dado_provider não se soma com estimativa_local", () => {
    assert.throws(
      () => {
        assertSameMeasurementClass("dado_provider", "estimativa_local");
      },
      /Cannot aggregate different measurement classes/,
    );
  });

  it("callIndex não preenche retry_index", () => {
    const span = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 50, output_tokens: 10 } },
      callIndex: 3,
    });
    assert.equal(span.retry_index, null);
  });

  it("custos são estritamente NOT_MEASURED", () => {
    const span = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 50, output_tokens: 10 } },
    });
    assert.equal(span.estimated_cost, "NOT_MEASURED");
    assert.equal(span.actual_cost, "NOT_MEASURED");
  });

  it("sanitização remove apiKey, authorization, headers e canários", () => {
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

  it("readInferenceSpans ignora linhas corrompidas sem falhar", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-corrupt-test-"));
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

  it("assertFeatureIdConfined impede path traversal em featureId", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-escape-test-"));
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

  it("best-effort: falha de I/O no appendInferenceSpan não quebra a execução", () => {
    // Escrita em caminho protegido/inválido via arquivo bloqueante em tmpDir (evita loop recursivo em /proc)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-io-fail-test-"));
    const blockedRoot = path.join(tmpDir, "blocked_file");
    fs.writeFileSync(blockedRoot, "block");
    try {
      const res = appendInferenceSpan(blockedRoot, "feat", { input_tokens: 1 });
      assert.equal(res.ok, false);
      assert.ok(res.error);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ObservableLlmProviderAdapter executa completion e emite span gravado em disco", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-adapter-test-"));
    try {
      const mockFetch: typeof fetch = async (url, init) => {
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

      // Verificar que a chave da API nunca foi gravada no arquivo
      const fileContent = fs.readFileSync(records[0] ? resolveInferenceSpansPath(tmpDir, "feature-uks-e2e") : "", "utf-8");
      assert.equal(fileContent.includes("test-canary-key"), false);
      assert.equal(fileContent.includes("apiKey"), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ObservableLlmProviderAdapter trata HTTP 500 registrando falha e lançando", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uks-adapter-error-"));
    try {
      const mockFetch: typeof fetch = async () => {
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
});
