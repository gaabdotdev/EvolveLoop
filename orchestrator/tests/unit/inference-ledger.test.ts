import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  classifyHttpInferenceUsage,
  assertSameMeasurementClass,
  NOT_MEASURED,
} from "../../src/observability/inference-usage.js";
import {
  appendInferenceSpan,
  readInferenceSpans,
  resolveInferenceSpansPath,
  sanitizeSpanRecord,
} from "../../src/observability/inference-ledger.js";
import { LlmHttpProviderAdapter } from "../../src/providers/llm/llm-http-provider-adapter.js";

describe("inference usage and ledger (G1 - Phase B)", () => {
  it("usage ausente não produz 0", () => {
    const span = classifyHttpInferenceUsage({
      httpOk: true,
      body: { choices: [] }, // No usage block
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
    });

    expect(span.input_tokens).toBeNull();
    expect(span.output_tokens).toBeNull();
    expect(span.cached_input_tokens).toBeNull();
    expect(span.input_tokens).not.toBe(0);
    expect(span.output_tokens).not.toBe(0);
    expect(span.cached_input_tokens).not.toBe(0);
    expect(span.usage_source).toBe("desconhecido");
    expect(span.usage_confidence).toBe("NOT_MEASURED");
    expect(span.outcome).toBe("error");
  });

  it("campo não finito não produz 0", () => {
    const spanNonFinite = classifyHttpInferenceUsage({
      httpOk: true,
      body: {
        usage: {
          input_tokens: NaN,
          output_tokens: null,
        },
      },
      provider: "openai",
      model: "gpt-4o-mini",
    });

    expect(spanNonFinite.input_tokens).toBeNull();
    expect(spanNonFinite.output_tokens).toBeNull();
    expect(spanNonFinite.input_tokens).not.toBe(0);
    expect(spanNonFinite.output_tokens).not.toBe(0);
    expect(spanNonFinite.usage_source).toBe("desconhecido");
    expect(spanNonFinite.usage_confidence).toBe("NOT_MEASURED");
    expect(spanNonFinite.outcome).toBe("error");

    // Partial non-finite: finite input, undefined output
    const spanPartial = classifyHttpInferenceUsage({
      httpOk: true,
      body: {
        usage: {
          input_tokens: 150,
          output_tokens: undefined,
        },
      },
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    });

    expect(spanPartial.input_tokens).toBe(150);
    expect(spanPartial.output_tokens).toBeNull();
    expect(spanPartial.output_tokens).not.toBe(0);
    expect(spanPartial.usage_source).toBe("dado_provider");
    expect(spanPartial.usage_confidence).toBe("exact");
    expect(spanPartial.outcome).toBe("success");
  });

  it("duas gravações deixam duas linhas", () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-ledger-test-"));
    const featureId = "feature-ledger-lines";

    const span1 = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 100, output_tokens: 50 } },
      provider: "anthropic",
      model: "claude-3-5-haiku",
    });
    const span2 = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 200, output_tokens: 80 } },
      provider: "anthropic",
      model: "claude-3-5-haiku",
    });

    appendInferenceSpan(memoryRoot, featureId, span1);
    appendInferenceSpan(memoryRoot, featureId, span2);

    const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
    const rawContent = readFileSync(filePath, "utf-8");
    const lines = rawContent.trim().split("\n").filter(Boolean);

    expect(lines.length).toBe(2);

    const records = readInferenceSpans(memoryRoot, featureId);
    expect(records.length).toBe(2);
    expect(records[0].input_tokens).toBe(100);
    expect(records[0].output_tokens).toBe(50);
    expect(records[1].input_tokens).toBe(200);
    expect(records[1].output_tokens).toBe(80);
  });

  it("dado_provider não se soma com estimativa_local", () => {
    expect(() => {
      assertSameMeasurementClass("dado_provider", "estimativa_local");
    }).toThrowError(/Cannot aggregate different measurement classes/);

    expect(() => {
      assertSameMeasurementClass("dado_provider", "proxy_experimental");
    }).toThrow();

    expect(() => {
      assertSameMeasurementClass("dado_provider", "desconhecido");
    }).toThrow();

    // Does not throw for the same class
    expect(() => {
      assertSameMeasurementClass("dado_provider", "dado_provider");
    }).not.toThrow();

    expect(() => {
      assertSameMeasurementClass("estimativa_local", "estimativa_local");
    }).not.toThrow();
  });

  it("callIndex não preenche retry_index", () => {
    const spanOnlyCallIndex = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 40, output_tokens: 20 } },
      callIndex: 3,
    });
    expect(spanOnlyCallIndex.retry_index).toBeNull();
    expect(spanOnlyCallIndex.retry_index).not.toBe(3);

    const spanWithRetry = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 40, output_tokens: 20 } },
      callIndex: 3,
      retryIndex: 1,
    });
    expect(spanWithRetry.retry_index).toBe(1);
  });

  it("custos são NOT_MEASURED", () => {
    const span = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 500, output_tokens: 100 } },
      provider: "openai",
      model: "gpt-4o",
    });

    expect(span.estimated_cost).toBe(NOT_MEASURED);
    expect(span.actual_cost).toBe(NOT_MEASURED);
    expect(span.estimated_cost).toBe("NOT_MEASURED");
    expect(span.actual_cost).toBe("NOT_MEASURED");
  });

  it("a chave não aparece no ficheiro", () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-ledger-key-"));
    const featureId = "feature-key-leak-test";
    const secretApiKey = "sk-ant-api03-abcdef123456789012345678-AAAAAA";

    const spanWithForbiddenFields = {
      ...classifyHttpInferenceUsage({
        httpOk: true,
        body: { usage: { input_tokens: 60, output_tokens: 30 } },
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      }),
      apiKey: secretApiKey,
      authorization: `Bearer ${secretApiKey}`,
      "x-api-key": secretApiKey,
      headers: { "x-api-key": secretApiKey },
      raw: { secret: secretApiKey },
    };

    appendInferenceSpan(memoryRoot, featureId, spanWithForbiddenFields);

    const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
    const content = readFileSync(filePath, "utf-8");

    expect(content).not.toContain(secretApiKey);
    expect(content).not.toContain("apiKey");
    expect(content).not.toContain("authorization");
    expect(content).not.toContain("x-api-key");
    expect(content).not.toContain("headers");
    expect(content).not.toContain("raw");
  });

  it("HTTP 401 grava outcome error e tokens null, e continua a lançar", async () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-401-"));
    const featureId = "feature-401-test";
    const fetchMockAnthropic: typeof fetch = async () => {
      return new Response("Unauthorized", { status: 401 });
    };
    const adapterAnthropic = new LlmHttpProviderAdapter(fetchMockAnthropic);

    await expect(
      adapterAnthropic.completeAnthropic({
        apiKey: "fake-key-1234567890123456",
        model: "claude-3-5-haiku-20241022",
        stablePrefixParts: [{ role: "system", content: "stable prefix" }],
        userMessage: "hello",
        memoryRoot,
        featureId,
        retryIndex: 0,
      }),
    ).rejects.toThrowError("anthropic_http_401");

    const spans1 = readInferenceSpans(memoryRoot, featureId);
    expect(spans1.length).toBe(1);
    expect(spans1[0].outcome).toBe("error");
    expect(spans1[0].input_tokens).toBeNull();
    expect(spans1[0].output_tokens).toBeNull();
    expect(spans1[0].cached_input_tokens).toBeNull();
    expect(spans1[0].usage_source).toBe("desconhecido");
    expect(spans1[0].usage_confidence).toBe("NOT_MEASURED");
    expect(spans1[0].provider).toBe("anthropic");
    expect(spans1[0].model).toBe("claude-3-5-haiku-20241022");
    expect(spans1[0].retry_index).toBe(0);
    expect(spans1[0].duration_ms).toBeNull();

    const fetchMockOpenAi: typeof fetch = async () => {
      return new Response("Unauthorized", { status: 401 });
    };
    const adapterOpenAi = new LlmHttpProviderAdapter(fetchMockOpenAi);

    await expect(
      adapterOpenAi.completeOpenAi({
        apiKey: "fake-key-1234567890123456",
        model: "gpt-4o",
        stablePrefixParts: [{ role: "system", content: "stable prefix" }],
        userMessage: "hello",
        memoryRoot,
        featureId,
        retryIndex: 1,
      }),
    ).rejects.toThrowError("openai_http_401");

    const spans2 = readInferenceSpans(memoryRoot, featureId);
    expect(spans2.length).toBe(2);
    expect(spans2[1].outcome).toBe("error");
    expect(spans2[1].input_tokens).toBeNull();
    expect(spans2[1].output_tokens).toBeNull();
    expect(spans2[1].provider).toBe("openai");
    expect(spans2[1].retry_index).toBe(1);
  });

  it("grava telemetria de snapshot único e spans cumulativos em 200 OK", async () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-ok-"));
    const featureId = "feature-ok-test";
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: "msg_1",
          content: [{ type: "text", text: "result" }],
          usage: { input_tokens: 80, output_tokens: 40 },
        }),
        { status: 200 },
      );
    };
    const adapter = new LlmHttpProviderAdapter(fetchMock);

    await adapter.completeAnthropic({
      apiKey: "fake-key-1234567890123456",
      model: "claude-3-5-haiku-20241022",
      stablePrefixParts: [{ role: "system", content: "test" }],
      userMessage: "hello 1",
      memoryRoot,
      featureId,
      callIndex: 1,
    });

    await adapter.completeAnthropic({
      apiKey: "fake-key-1234567890123456",
      model: "claude-3-5-haiku-20241022",
      stablePrefixParts: [{ role: "system", content: "test" }],
      userMessage: "hello 2",
      memoryRoot,
      featureId,
      callIndex: 2,
    });

    // vendor-cache-telemetry.json is a single snapshot JSON file
    const telemetryPath = join(memoryRoot, featureId, "evidence", "vendor-cache-telemetry.json");
    expect(existsSync(telemetryPath)).toBe(true);
    const telemetryJson = JSON.parse(readFileSync(telemetryPath, "utf-8")) as { call_index: number };
    expect(telemetryJson.call_index).toBe(2);

    // inference-spans.jsonl contains both calls
    const spans = readInferenceSpans(memoryRoot, featureId);
    expect(spans.length).toBe(2);
    expect(spans[0].outcome).toBe("success");
    expect(spans[0].input_tokens).toBe(80);
    expect(spans[0].output_tokens).toBe(40);
    expect(spans[1].outcome).toBe("success");
  });

  it("assertSameMeasurementClass lança se o argumento objecto não tiver usage_source string (dois objectos sem a chave não passam)", () => {
    expect(() => {
      assertSameMeasurementClass({} as any, {} as any);
    }).toThrow();

    expect(() => {
      assertSameMeasurementClass({ usage_source: 123 } as any, { usage_source: 123 } as any);
    }).toThrow();

    expect(() => {
      assertSameMeasurementClass({} as any, "dado_provider");
    }).toThrow();

    expect(() => {
      assertSameMeasurementClass("dado_provider", {} as any);
    }).toThrow();

    expect(() => {
      assertSameMeasurementClass(
        { usage_source: "dado_provider" },
        { usage_source: "dado_provider" },
      );
    }).not.toThrow();

    expect(() => {
      assertSameMeasurementClass(
        { usage_source: "dado_provider" },
        { usage_source: "estimativa_local" },
      );
    }).toThrowError(/Cannot aggregate different measurement classes/);
  });

  it("sanitizeSpanRecord desce arrays e remove chaves proibidas dentro dos elementos objecto", () => {
    const rawSpanWithArrays = {
      run_id: "test-run",
      provider: "anthropic",
      items: [
        {
          id: 1,
          apiKey: "secret-in-array-1",
          safeProp: "keep-me",
          nestedArray: [
            {
              authorization: "Bearer secret-in-nested-array",
              raw: { deep: "secret" },
              headers: { "x-api-key": "secret" },
              nestedSafe: 42,
            },
          ],
        },
        "primitive-element",
        100,
      ],
    };

    const sanitized = sanitizeSpanRecord(rawSpanWithArrays);
    const jsonStr = JSON.stringify(sanitized);

    expect(jsonStr).not.toContain("secret-in-array-1");
    expect(jsonStr).not.toContain("secret-in-nested-array");
    expect(jsonStr).not.toContain("apiKey");
    expect(jsonStr).not.toContain("authorization");
    expect(jsonStr).not.toContain("headers");
    expect(jsonStr).not.toContain("raw");

    const items = sanitized.items as Array<Record<string, unknown>>;
    expect(items[0].id).toBe(1);
    expect(items[0].safeProp).toBe("keep-me");
    expect(items[0].apiKey).toBeUndefined();

    const nested = items[0].nestedArray as Array<Record<string, unknown>>;
    expect(nested[0].nestedSafe).toBe(42);
    expect(nested[0].authorization).toBeUndefined();
    expect(nested[0].raw).toBeUndefined();
    expect(nested[0].headers).toBeUndefined();

    expect(items[1]).toBe("primitive-element");
    expect(items[2]).toBe(100);
  });

  it("readInferenceSpans não falha o ficheiro inteiro por uma linha JSON inválida: ignora essa linha", () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-corrupt-line-"));
    const featureId = "feature-corrupt-line-test";
    const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
    mkdirSync(dirname(filePath), { recursive: true });

    const span1 = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 111, output_tokens: 222 } },
      provider: "anthropic",
      model: "claude-3-5-haiku",
    });
    const span2 = classifyHttpInferenceUsage({
      httpOk: true,
      body: { usage: { input_tokens: 333, output_tokens: 444 } },
      provider: "openai",
      model: "gpt-4o",
    });

    const content = `${JSON.stringify(span1)}\n{INVALID_JSON_LINE\n${JSON.stringify(span2)}\n`;
    writeFileSync(filePath, content, "utf-8");

    const records = readInferenceSpans(memoryRoot, featureId);
    expect(records.length).toBe(2);
    expect(records[0].provider).toBe("anthropic");
    expect(records[0].input_tokens).toBe(111);
    expect(records[1].provider).toBe("openai");
    expect(records[1].input_tokens).toBe(333);
  });

  it("completeAnthropic e completeOpenAi: se fetchImpl lançar, grava span com httpOk false, tokens null, outcome error, e volta a lançar sem vazar a chave", async () => {
    const memoryRoot = mkdtempSync(join(tmpdir(), "inf-fetch-throw-"));
    const featureId = "feature-fetch-throw-test";
    const secretApiKey = "sk-ant-very-secret-key-9999999";

    const fetchMockAnthropic: typeof fetch = async () => {
      throw new Error(`Connection timeout reaching https://api.anthropic.com with key ${secretApiKey}`);
    };
    const adapterAnthropic = new LlmHttpProviderAdapter(fetchMockAnthropic);

    await expect(
      adapterAnthropic.completeAnthropic({
        apiKey: secretApiKey,
        model: "claude-3-5-haiku-20241022",
        stablePrefixParts: [{ role: "system", content: "stable prefix" }],
        userMessage: "hello error",
        memoryRoot,
        featureId,
        retryIndex: 2,
        durationMs: 50,
      }),
    ).rejects.toThrowError(`Connection timeout reaching https://api.anthropic.com with key ${secretApiKey}`);

    const spans1 = readInferenceSpans(memoryRoot, featureId);
    expect(spans1.length).toBe(1);
    expect(spans1[0].outcome).toBe("error");
    expect(spans1[0].input_tokens).toBeNull();
    expect(spans1[0].output_tokens).toBeNull();
    expect(spans1[0].cached_input_tokens).toBeNull();
    expect(spans1[0].usage_source).toBe("desconhecido");
    expect(spans1[0].usage_confidence).toBe("NOT_MEASURED");
    expect(spans1[0].provider).toBe("anthropic");
    expect(spans1[0].model).toBe("claude-3-5-haiku-20241022");
    expect(spans1[0].retry_index).toBe(2);
    expect(spans1[0].duration_ms).toBe(50);

    const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
    const fileContent1 = readFileSync(filePath, "utf-8");
    expect(fileContent1).not.toContain(secretApiKey);

    const secretOpenAiKey = "sk-openai-very-secret-key-8888888";
    const fetchMockOpenAi: typeof fetch = async () => {
      throw new Error(`DNS failure reaching api.openai.com with key ${secretOpenAiKey}`);
    };
    const adapterOpenAi = new LlmHttpProviderAdapter(fetchMockOpenAi);

    await expect(
      adapterOpenAi.completeOpenAi({
        apiKey: secretOpenAiKey,
        model: "gpt-4o",
        stablePrefixParts: [{ role: "system", content: "stable prefix" }],
        userMessage: "hello error openai",
        memoryRoot,
        featureId,
        retryIndex: 3,
        durationMs: 120,
      }),
    ).rejects.toThrowError(`DNS failure reaching api.openai.com with key ${secretOpenAiKey}`);

    const spans2 = readInferenceSpans(memoryRoot, featureId);
    expect(spans2.length).toBe(2);
    expect(spans2[1].outcome).toBe("error");
    expect(spans2[1].input_tokens).toBeNull();
    expect(spans2[1].output_tokens).toBeNull();
    expect(spans2[1].cached_input_tokens).toBeNull();
    expect(spans2[1].usage_source).toBe("desconhecido");
    expect(spans2[1].usage_confidence).toBe("NOT_MEASURED");
    expect(spans2[1].provider).toBe("openai");
    expect(spans2[1].model).toBe("gpt-4o");
    expect(spans2[1].retry_index).toBe(3);
    expect(spans2[1].duration_ms).toBe(120);

    const fileContent2 = readFileSync(filePath, "utf-8");
    expect(fileContent2).not.toContain(secretOpenAiKey);
  });
});
