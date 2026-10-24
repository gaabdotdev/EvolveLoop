import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LlmHttpProviderAdapter,
  buildAnthropicMessagesBody,
  buildOpenAiChatBody,
} from "../../src/providers/llm/llm-http-provider-adapter.js";
import { resolveLlmGatewayUrl } from "../../src/providers/llm/llm-gateway-target.js";
import {
  readInferenceSpans,
  resolveInferenceSpansPath,
} from "../../src/observability/inference-ledger.js";

const GATEWAY_ENV = "EVOLVELOOP_LLM_GATEWAY_URL";
const ANTHROPIC_PUBLIC = "https://api.anthropic.com/v1/messages";
const OPENAI_PUBLIC = "https://api.openai.com/v1/chat/completions";
const LOCAL_BASE = "http://127.0.0.1:20128";

const parts = [{ role: "system" as const, content: "stable prefix" }];
const anthropicInput = {
  apiKey: "sk-ant-test-key-not-real",
  model: "claude-3-5-haiku-20241022",
  stablePrefixParts: parts,
  userMessage: "hello anthropic",
  maxTokens: 32,
};
const openaiInput = {
  apiKey: "sk-openai-test-key-not-real",
  model: "gpt-4o",
  stablePrefixParts: parts,
  userMessage: "hello openai",
  maxTokens: 32,
};

function okResponse(): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], choices: [] }), {
    status: 200,
  });
}

describe("resolveLlmGatewayUrl", () => {
  it("usa os URLs públicos quando a variável está ausente ou só tem espaços", () => {
    expect(resolveLlmGatewayUrl("anthropic", {})).toBe(ANTHROPIC_PUBLIC);
    expect(resolveLlmGatewayUrl("openai", {})).toBe(OPENAI_PUBLIC);
    expect(resolveLlmGatewayUrl("anthropic", { [GATEWAY_ENV]: "   \t" })).toBe(ANTHROPIC_PUBLIC);
    expect(resolveLlmGatewayUrl("openai", { [GATEWAY_ENV]: "" })).toBe(OPENAI_PUBLIC);
  });

  it("aceita as duas bases locais depois de trim e de remover uma barra final", () => {
    for (const base of [LOCAL_BASE, "http://localhost:20128"]) {
      expect(resolveLlmGatewayUrl("anthropic", { [GATEWAY_ENV]: `${base}/` })).toBe(
        `${base}/v1/messages`,
      );
      expect(resolveLlmGatewayUrl("openai", { [GATEWAY_ENV]: `  ${base}/  ` })).toBe(
        `${base}/v1/chat/completions`,
      );
    }
  });

  it("rejeita qualquer outro valor, incluindo barra final a mais", () => {
    const rejected = [
      "https://example.com",
      "http://127.0.0.1:20129",
      "http://0.0.0.0:20128",
      "https://127.0.0.1:20128",
      "http://127.0.0.1:20128//",
      "http://127.0.0.1:20128/v1/messages",
    ];
    for (const value of rejected) {
      expect(() => resolveLlmGatewayUrl("anthropic", { [GATEWAY_ENV]: value })).toThrowError(
        "llm_gateway_url_rejected",
      );
      expect(() => resolveLlmGatewayUrl("openai", { [GATEWAY_ENV]: value })).toThrowError(
        "llm_gateway_url_rejected",
      );
    }
  });
});

describe("LlmHttpProviderAdapter gateway target", () => {
  const previous = process.env[GATEWAY_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[GATEWAY_ENV];
    else process.env[GATEWAY_ENV] = previous;
  });

  it("com env ausente mantém URLs, corpo e headers públicos e não substitui a apiKey", async () => {
    delete process.env[GATEWAY_ENV];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return okResponse();
    };
    const adapter = new LlmHttpProviderAdapter(fetchMock);

    await adapter.completeAnthropic(anthropicInput);
    await adapter.completeOpenAi(openaiInput);

    expect(calls.map((call) => call.url)).toEqual([ANTHROPIC_PUBLIC, OPENAI_PUBLIC]);
    expect(calls[0]?.init?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": anthropicInput.apiKey,
      "anthropic-version": "2023-06-01",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(buildAnthropicMessagesBody(anthropicInput));
    expect(calls[1]?.init?.headers).toEqual({
      "content-type": "application/json",
      authorization: `Bearer ${openaiInput.apiKey}`,
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(buildOpenAiChatBody(openaiInput));
  });

  it("http://127.0.0.1:20128/ aponta para os paths locais e preserva corpo e headers", async () => {
    process.env[GATEWAY_ENV] = `${LOCAL_BASE}/`;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return okResponse();
    };
    const adapter = new LlmHttpProviderAdapter(fetchMock);

    await adapter.completeAnthropic(anthropicInput);
    await adapter.completeOpenAi(openaiInput);

    expect(calls.map((call) => call.url)).toEqual([
      `${LOCAL_BASE}/v1/messages`,
      `${LOCAL_BASE}/v1/chat/completions`,
    ]);
    expect(calls[0]?.init?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": anthropicInput.apiKey,
      "anthropic-version": "2023-06-01",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(buildAnthropicMessagesBody(anthropicInput));
    expect(calls[1]?.init?.headers).toEqual({
      "content-type": "application/json",
      authorization: `Bearer ${openaiInput.apiKey}`,
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(buildOpenAiChatBody(openaiInput));
  });

  it("rejeita bases não permitidas antes do fetch", async () => {
    const rejected = ["https://example.com", "http://127.0.0.1:20129", "http://0.0.0.0:20128"];
    for (const value of rejected) {
      process.env[GATEWAY_ENV] = value;
      let calls = 0;
      const fetchMock: typeof fetch = async () => {
        calls += 1;
        return okResponse();
      };
      const adapter = new LlmHttpProviderAdapter(fetchMock);
      await expect(adapter.completeAnthropic(anthropicInput)).rejects.toThrowError(
        "llm_gateway_url_rejected",
      );
      await expect(adapter.completeOpenAi(openaiInput)).rejects.toThrowError(
        "llm_gateway_url_rejected",
      );
      expect(calls).toBe(0);
    }
  });

  it("com env ausente, um fetch que lança continua a gravar o span de erro e a relançar", async () => {
    delete process.env[GATEWAY_ENV];
    const memoryRoot = mkdtempSync(join(tmpdir(), "gw-span-"));
    const featureId = "feature-gateway-absent";
    const secretApiKey = "sk-ant-span-secret-not-real";
    const secretOpenAiKey = "sk-openai-span-secret-not-real";
    const calls: string[] = [];

    const fetchAnthropic: typeof fetch = async (input) => {
      calls.push(String(input));
      throw new Error("connection_timeout");
    };
    const adapterAnthropic = new LlmHttpProviderAdapter(fetchAnthropic);
    await expect(
      adapterAnthropic.completeAnthropic({
        ...anthropicInput,
        apiKey: secretApiKey,
        memoryRoot,
        featureId,
        retryIndex: 2,
        durationMs: 50,
      }),
    ).rejects.toThrowError("connection_timeout");

    const spans1 = readInferenceSpans(memoryRoot, featureId);
    expect(calls).toEqual([ANTHROPIC_PUBLIC]);
    expect(spans1).toHaveLength(1);
    expect(spans1[0]?.outcome).toBe("error");
    expect(spans1[0]?.input_tokens).toBeNull();
    expect(spans1[0]?.output_tokens).toBeNull();
    expect(spans1[0]?.cached_input_tokens).toBeNull();
    expect(spans1[0]?.usage_source).toBe("desconhecido");
    expect(spans1[0]?.usage_confidence).toBe("NOT_MEASURED");
    expect(spans1[0]?.provider).toBe("anthropic");
    expect(spans1[0]?.model).toBe(anthropicInput.model);
    expect(spans1[0]?.retry_index).toBe(2);
    expect(spans1[0]?.duration_ms).toBe(50);

    const fetchOpenAi: typeof fetch = async (input) => {
      calls.push(String(input));
      throw new Error("dns_failure");
    };
    const adapterOpenAi = new LlmHttpProviderAdapter(fetchOpenAi);
    await expect(
      adapterOpenAi.completeOpenAi({
        ...openaiInput,
        apiKey: secretOpenAiKey,
        memoryRoot,
        featureId,
        retryIndex: 3,
        durationMs: 120,
      }),
    ).rejects.toThrowError("dns_failure");

    const spans2 = readInferenceSpans(memoryRoot, featureId);
    expect(calls).toEqual([ANTHROPIC_PUBLIC, OPENAI_PUBLIC]);
    expect(spans2).toHaveLength(2);
    expect(spans2[1]?.outcome).toBe("error");
    expect(spans2[1]?.input_tokens).toBeNull();
    expect(spans2[1]?.output_tokens).toBeNull();
    expect(spans2[1]?.cached_input_tokens).toBeNull();
    expect(spans2[1]?.usage_source).toBe("desconhecido");
    expect(spans2[1]?.usage_confidence).toBe("NOT_MEASURED");
    expect(spans2[1]?.provider).toBe("openai");
    expect(spans2[1]?.model).toBe(openaiInput.model);
    expect(spans2[1]?.retry_index).toBe(3);
    expect(spans2[1]?.duration_ms).toBe(120);

    const fileContent = readFileSync(resolveInferenceSpansPath(memoryRoot, featureId), "utf-8");
    expect(fileContent).not.toContain(secretApiKey);
    expect(fileContent).not.toContain(secretOpenAiKey);
  });

  it("lê process.env no momento da chamada", async () => {
    delete process.env[GATEWAY_ENV];
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      calls.push(String(input));
      return okResponse();
    };
    const adapter = new LlmHttpProviderAdapter(fetchMock);
    await adapter.completeAnthropic(anthropicInput);
    process.env[GATEWAY_ENV] = "http://localhost:20128";
    await adapter.completeAnthropic(anthropicInput);
    expect(calls).toEqual([ANTHROPIC_PUBLIC, "http://localhost:20128/v1/messages"]);
  });
});
