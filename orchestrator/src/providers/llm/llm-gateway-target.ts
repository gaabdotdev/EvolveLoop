/**
 * Pure URL selection for the HTTP LLM adapter.
 * No I/O: the caller supplies the env map at call time.
 *
 * EVOLVELOOP_LLM_GATEWAY_URL absent or whitespace-only keeps the public vendor URL.
 * After trim, one trailing slash is removed. The result must be exactly
 * http://127.0.0.1:20128 or http://localhost:20128; any other value throws
 * before the caller is allowed to fetch. There is no fallback to the public hosts.
 */

const GATEWAY_ENV = "EVOLVELOOP_LLM_GATEWAY_URL";

const PUBLIC_URL = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
} as const;

const LOCAL_PATH = {
  anthropic: "/v1/messages",
  openai: "/v1/chat/completions",
} as const;

const LOCAL_BASES = new Set<string>([
  "http://127.0.0.1:20128",
  "http://localhost:20128",
]);

export type LlmGatewayKind = keyof typeof PUBLIC_URL;

export function resolveLlmGatewayUrl(
  kind: LlmGatewayKind,
  env: Readonly<Record<string, string | undefined>>,
): string {
  const raw = env[GATEWAY_ENV];
  if (raw === undefined) return PUBLIC_URL[kind];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return PUBLIC_URL[kind];
  const base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (!LOCAL_BASES.has(base)) {
    throw new Error("llm_gateway_url_rejected");
  }
  return `${base}${LOCAL_PATH[kind]}`;
}
