/**
 * EvolveLoop V2.5 - Observable LLM Provider Adapter
 * Directly connects G1 Inference Ledger and classification to LLM completions in V2.5.
 * Strictly decoupled from OmniRoute (runs with direct provider fallback).
 * Enforces SSRF prevention, allowlisted providers, and rigorous input validation.
 */

import net from "node:net";
import dns from "node:dns/promises";
import {
  classifyHttpInferenceUsage,
  type InferenceSpanRecord,
} from "./inference-usage.ts";
import {
  appendInferenceSpan,
} from "./inference-ledger.ts";

export type FetchFn = typeof fetch;
export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const DEFAULT_ALLOWLIST = new Set(["api.anthropic.com", "api.openai.com"]);

export interface TargetUrlValidationOptions {
  allowLoopback?: boolean;
  allowCustomGateway?: boolean;
  allowedGateways?: string[];
  dnsLookup?: DnsLookupFn;
}

export const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  try {
    const res = await dns.lookup(hostname, { all: true });
    return Array.isArray(res) ? res : [res];
  } catch (err: unknown) {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: DNS resolution failed for '${hostname}': ${(err as Error).message}`);
  }
};

export interface ObservableLlmAdapterResult {
  text: string;
  raw: unknown;
  span?: InferenceSpanRecord;
  ledgerWritten: boolean;
  ledgerPath?: string;
}

export interface ObservableCompletionInput {
  provider?: "anthropic" | "openai" | string;
  model?: string;
  prompt?: string;
  system_prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  apiKey?: string;
  maxTokens?: number;
  max_tokens?: number;
  temperature?: number;
  featureId?: string;
  memoryRoot?: string;
  runId?: string;
  taskId?: string;
  agentId?: string;
  phase?: string;
  retryIndex?: number;
  gatewayUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const ALLOWED_PROVIDERS = new Set(["anthropic", "openai"]);

const DEFAULT_ENDPOINTS: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
};

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-3-5-sonnet",
  openai: "gpt-4o",
};

/**
 * Checks whether an IPv4 address belongs to a forbidden/private/internal range.
 */
export function isForbiddenIPv4(octets: number[]): { forbidden: boolean; reason?: string } {
  const [a, b, c, d] = octets;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return { forbidden: true, reason: "Current network (0.0.0.0/8)" };

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return { forbidden: true, reason: "Loopback (127.0.0.0/8)" };

  // 10.0.0.0/8 (RFC 1918 Private Class A)
  if (a === 10) return { forbidden: true, reason: "RFC 1918 Private Class A (10.0.0.0/8)" };

  // 172.16.0.0/12 (RFC 1918 Private Class B)
  if (a === 172 && b >= 16 && b <= 31) {
    return { forbidden: true, reason: "RFC 1918 Private Class B (172.16.0.0/12)" };
  }

  // 192.168.0.0/16 (RFC 1918 Private Class C)
  if (a === 192 && b === 168) {
    return { forbidden: true, reason: "RFC 1918 Private Class C (192.168.0.0/16)" };
  }

  // 169.254.0.0/16 (Link-Local & Cloud Metadata)
  if (a === 169 && b === 254) {
    return { forbidden: true, reason: "Link-Local / Cloud Metadata (169.254.0.0/16)" };
  }

  // 100.64.0.0/10 (Carrier-Grade NAT, RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) {
    return { forbidden: true, reason: "Carrier-Grade NAT (100.64.0.0/10)" };
  }

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return { forbidden: true, reason: "Multicast (224.0.0.0/4)" };

  // 240.0.0.0/4 (Reserved / Future Use & Broadcast)
  if (a >= 240) return { forbidden: true, reason: "Reserved / Broadcast (240.0.0.0/4)" };

  return { forbidden: false };
}

/**
 * Checks whether an IPv6 address string belongs to a forbidden range.
 */
export function isForbiddenIPv6(rawIpv6: string): { forbidden: boolean; reason?: string } {
  let ip = rawIpv6.startsWith("[") && rawIpv6.endsWith("]") ? rawIpv6.slice(1, -1) : rawIpv6;
  ip = ip.toLowerCase();

  // Loopback (::1)
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") {
    return { forbidden: true, reason: "IPv6 Loopback (::1)" };
  }

  // Unspecified (::)
  if (ip === "::" || ip === "0:0:0:0:0:0:0:0") {
    return { forbidden: true, reason: "IPv6 Unspecified (::)" };
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x or hex)
  if (ip.startsWith("::ffff:") || ip.includes(":ffff:")) {
    const lastColon = ip.lastIndexOf(":");
    const lastPart = ip.slice(lastColon + 1);
    if (net.isIPv4(lastPart)) {
      const octets = lastPart.split(".").map(Number);
      const res = isForbiddenIPv4(octets);
      if (res.forbidden) {
        return { forbidden: true, reason: `IPv4-mapped IPv6 -> ${res.reason}` };
      }
    } else {
      // Hex representation like ::ffff:a9fe:a9fe (169.254.169.254) or ::ffff:7f00:1 (127.0.0.1)
      const parts = ip.split(":").filter(Boolean);
      if (parts.length >= 2 && parts[parts.length - 2] === "ffff") {
        const hexVal = parts[parts.length - 1];
        if (hexVal === "a9fe" || hexVal.startsWith("7f") || hexVal === "0") {
          return { forbidden: true, reason: "IPv4-mapped IPv6 metadata/loopback address" };
        }
      }
      return { forbidden: true, reason: "IPv4-mapped IPv6 address" };
    }
  }

  // fe80::/10 (Link-Local)
  if (/^fe[89ab][0-9a-f]:/i.test(ip) || ip.startsWith("fe80:")) {
    return { forbidden: true, reason: "IPv6 Link-Local (fe80::/10)" };
  }

  // fc00::/7 (Unique Local Address, RFC 4193)
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || ip.startsWith("fc") || ip.startsWith("fd")) {
    return { forbidden: true, reason: "IPv6 Unique Local (fc00::/7)" };
  }

  // ff00::/8 (Multicast)
  if (/^ff[0-9a-f]{2}:/i.test(ip) || ip.startsWith("ff")) {
    return { forbidden: true, reason: "IPv6 Multicast (ff00::/8)" };
  }

  return { forbidden: false };
}

/**
 * Validates target endpoint against SSRF and unauthorized network destinations.
 */
export function validateTargetUrl(
  rawUrl: string,
  optionsOrAllowLoopback: boolean | TargetUrlValidationOptions = false,
): URL {
  const allowLoopback =
    typeof optionsOrAllowLoopback === "boolean"
      ? optionsOrAllowLoopback
      : (optionsOrAllowLoopback?.allowLoopback ?? false);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Invalid target URL '${rawUrl}'.`);
  }

  if (parsed.protocol !== "https:" && !(allowLoopback && parsed.protocol === "http:")) {
    throw new Error(
      `[-] SECURITY_SSRF_VIOLATION: Protocol '${parsed.protocol}' is forbidden. Only HTTPS is permitted.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error("[-] SECURITY_SSRF_VIOLATION: Embedded credentials in target URL are strictly prohibited.");
  }

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }

  // Cloud metadata endpoint protection (DNS / hostnames)
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".metadata.google.internal") ||
    hostname === "instance-data"
  ) {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Cloud metadata endpoint '${hostname}' is blocked.`);
  }

  // Loopback and internal DNS aliases
  const isLoopbackHost =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "localhost.localdomain" ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");

  if (isLoopbackHost && !allowLoopback) {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Loopback connection to '${hostname}' is not authorized.`);
  }

  // IP Address inspection
  const isV6Bracket = hostname.startsWith("[") && hostname.endsWith("]");
  const rawIpCandidate = isV6Bracket ? hostname.slice(1, -1) : hostname;

  if (net.isIPv6(rawIpCandidate)) {
    const v6Check = isForbiddenIPv6(hostname);
    if (v6Check.forbidden) {
      if (v6Check.reason?.includes("Loopback") && allowLoopback) {
        // authorized loopback
      } else {
        throw new Error(`[-] SECURITY_SSRF_VIOLATION: IPv6 '${hostname}' is blocked: ${v6Check.reason}`);
      }
    }
  } else if (net.isIPv4(rawIpCandidate)) {
    const octets = rawIpCandidate.split(".").map(Number);
    const v4Check = isForbiddenIPv4(octets);
    if (v4Check.forbidden) {
      if (v4Check.reason?.includes("Loopback") && allowLoopback) {
        // authorized loopback
      } else {
        throw new Error(`[-] SECURITY_SSRF_VIOLATION: IPv4 '${hostname}' is blocked: ${v4Check.reason}`);
      }
    }
  }

  return parsed;
}

/**
 * Performs full validation including async DNS resolution for custom gateways to prevent DNS rebinding.
 */
export async function validateTargetUrlAndResolve(
  rawUrl: string,
  options: TargetUrlValidationOptions = {},
): Promise<URL> {
  const parsed = validateTargetUrl(rawUrl, options);
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }

  const isV6Bracket = hostname.startsWith("[") && hostname.endsWith("]");
  const rawIpCandidate = isV6Bracket ? hostname.slice(1, -1) : hostname;

  // If already an IP address literal, no DNS lookup needed or possible
  if (net.isIP(rawIpCandidate)) {
    return parsed;
  }

  const allowLoopback = options.allowLoopback ?? false;
  const allowCustomGateway = options.allowCustomGateway ?? false;
  const allowedGateways = options.allowedGateways ?? [];
  const isAllowlisted = DEFAULT_ALLOWLIST.has(hostname) || allowedGateways.includes(hostname);

  if (!isAllowlisted && !allowCustomGateway) {
    throw new Error(
      `[-] SECURITY_SSRF_VIOLATION: Custom gateway host '${hostname}' is not in the approved endpoint allowlist. Custom gateways must be explicitly authorized.`,
    );
  }

  // For custom gateways (or non-default endpoints), resolve DNS to ensure resolved IPs are not in forbidden ranges
  if (!isAllowlisted || allowCustomGateway) {
    const lookupFn = options.dnsLookup ?? defaultDnsLookup;
    let records: { address: string; family: number }[];
    try {
      records = await lookupFn(hostname);
    } catch (dnsErr: any) {
      throw new Error(
        `[-] SECURITY_SSRF_VIOLATION: DNS resolution failed for '${hostname}': ${dnsErr?.message ?? dnsErr}`,
      );
    }
    if (!records || records.length === 0) {
      throw new Error(`[-] SECURITY_SSRF_VIOLATION: DNS resolution returned no records for '${hostname}'.`);
    }

    for (const record of records) {
      const addr = record.address;
      if (net.isIPv4(addr)) {
        const octets = addr.split(".").map(Number);
        const check = isForbiddenIPv4(octets);
        if (check.forbidden) {
          if (check.reason?.includes("Loopback") && allowLoopback) {
            // authorized loopback in dev/test
          } else {
            throw new Error(
              `[-] SECURITY_SSRF_VIOLATION: DNS resolution for '${hostname}' returned forbidden IP '${addr}': ${check.reason}`,
            );
          }
        }
      } else if (net.isIPv6(addr)) {
        const check = isForbiddenIPv6(addr);
        if (check.forbidden) {
          if (check.reason?.includes("Loopback") && allowLoopback) {
            // authorized loopback in dev/test
          } else {
            throw new Error(
              `[-] SECURITY_SSRF_VIOLATION: DNS resolution for '${hostname}' returned forbidden IPv6 '${addr}': ${check.reason}`,
            );
          }
        }
      }
    }
  }

  return parsed;
}

export interface ObservableLlmProviderAdapterOptions {
  allowLoopback?: boolean;
  allowCustomGateway?: boolean;
  allowedGateways?: string[];
  dnsLookup?: DnsLookupFn;
  defaultTimeoutMs?: number;
}

export class ObservableLlmProviderAdapter {
  private readonly fetchImpl: FetchFn;
  private readonly allowLoopback: boolean;
  private readonly allowCustomGateway: boolean;
  private readonly allowedGateways: string[];
  private readonly dnsLookup?: DnsLookupFn;
  private readonly defaultTimeoutMs?: number;

  constructor(
    fetchImpl: FetchFn = fetch,
    options: ObservableLlmProviderAdapterOptions | { allowLoopback?: boolean } = {},
  ) {
    this.fetchImpl = fetchImpl;
    this.allowLoopback = options.allowLoopback ?? false;
    this.allowCustomGateway = (options as ObservableLlmProviderAdapterOptions).allowCustomGateway ?? false;
    this.allowedGateways = (options as ObservableLlmProviderAdapterOptions).allowedGateways ?? [];
    this.dnsLookup = (options as ObservableLlmProviderAdapterOptions).dnsLookup;
    this.defaultTimeoutMs = (options as ObservableLlmProviderAdapterOptions).defaultTimeoutMs;
  }

  async complete(input: ObservableCompletionInput): Promise<ObservableLlmAdapterResult> {
    const startTime = performance.now();

    const provider = (input.provider || "anthropic").toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(`[-] UNSUPPORTED_PROVIDER: Provider '${provider}' is not in the authorized allowlist.`);
    }

    const model = input.model || DEFAULT_MODELS[provider] || "default-model";

    // Build structured messages from input.prompt / input.messages
    let messages: Array<{ role: string; content: string }> = [];
    if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
      messages = input.messages;
    } else if (input.prompt && typeof input.prompt === "string" && input.prompt.trim().length > 0) {
      if (input.prompt.length > 64000) {
        throw new Error("[-] PAYLOAD_LIMIT_EXCEEDED: Prompt exceeds maximum permitted size of 64,000 characters.");
      }
      messages = [{ role: "user", content: input.prompt.trim() }];
    } else {
      throw new Error("[-] INVALID_INPUT: 'prompt' or non-empty 'messages' array is required.");
    }

    const rawTargetUrl = input.gatewayUrl || DEFAULT_ENDPOINTS[provider];
    const validationOpts: TargetUrlValidationOptions = {
      allowLoopback: this.allowLoopback,
      allowCustomGateway: this.allowCustomGateway,
      allowedGateways: this.allowedGateways,
      dnsLookup: this.dnsLookup,
    };
    const validatedUrl = await validateTargetUrlAndResolve(rawTargetUrl, validationOpts);
    const targetUrl = validatedUrl.toString();

    // Resolving API credentials safely from parameter or environment
    const apiKey =
      input.apiKey ||
      (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ||
      undefined;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (apiKey) {
      if (provider === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["authorization"] = `Bearer ${apiKey}`;
      }
    }

    const maxTokens = Math.min(Math.max(input.maxTokens ?? input.max_tokens ?? 1024, 1), 4096);
    const temperature = typeof input.temperature === "number" ? Math.max(0, Math.min(input.temperature, 1)) : 0;

    let bodyPayload: Record<string, unknown>;
    if (provider === "anthropic") {
      bodyPayload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
      };
      if (input.system_prompt) {
        bodyPayload.system = input.system_prompt;
      }
    } else {
      const openAiMessages = input.system_prompt
        ? [{ role: "system", content: input.system_prompt }, ...messages]
        : messages;

      bodyPayload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: openAiMessages,
      };
    }

    // Configure timeout and cancellation abort signal
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;
    const signals: AbortSignal[] = [];
    if (input.signal) {
      signals.push(input.signal);
    }
    if (typeof timeoutMs === "number" && timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      signals.push(AbortSignal.timeout(timeoutMs));
    }
    const combinedSignal =
      signals.length === 1 ? signals[0] : signals.length > 1 ? AbortSignal.any(signals) : undefined;

    let res: Response;
    let durationMs: number;

    try {
      res = await this.fetchImpl(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        redirect: "error",
        signal: combinedSignal,
      });
      durationMs = Number((performance.now() - startTime).toFixed(2));
    } catch (fetchErr: unknown) {
      durationMs = Number((performance.now() - startTime).toFixed(2));
      let isTimeout = false;
      let isCancelled = false;

      const errObj = fetchErr as { name?: string; message?: string; code?: string };
      if (
        errObj?.name === "TimeoutError" ||
        combinedSignal?.reason?.name === "TimeoutError" ||
        errObj?.message?.toLowerCase().includes("timeout") ||
        errObj?.code === "ETIMEDOUT"
      ) {
        isTimeout = true;
      } else if (
        errObj?.name === "AbortError" ||
        errObj?.message?.toLowerCase().includes("abort") ||
        input.signal?.aborted
      ) {
        isCancelled = true;
      }

      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider,
          model,
          retryIndex: input.retryIndex,
          durationMs,
          outcome: "error",
        });
        appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
      }

      if (isTimeout) {
        const timeoutError = new Error(`Inference request timed out after ${timeoutMs}ms`);
        (timeoutError as any).code = "TIMEOUT";
        throw timeoutError;
      }
      if (isCancelled) {
        const cancelError = new Error("Inference request was cancelled");
        (cancelError as any).code = "CANCELLED";
        throw cancelError;
      }
      throw fetchErr;
    }

    if (!res.ok) {
      let ledgerWritten = false;
      let ledgerPath: string | undefined;

      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider,
          model,
          retryIndex: input.retryIndex,
          durationMs,
          outcome: "error",
        });
        const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
        ledgerWritten = ledgerResult.ok;
        ledgerPath = ledgerResult.path;
      }
      throw new Error(`${provider}_http_${res.status}`);
    }

    const raw = (await res.json()) as unknown;
    let span: InferenceSpanRecord | undefined;
    let ledgerWritten = false;
    let ledgerPath: string | undefined;

    if (input.memoryRoot && input.featureId) {
      span = classifyHttpInferenceUsage({
        httpOk: true,
        body: raw,
        runId: input.runId,
        taskId: input.taskId,
        agentId: input.agentId,
        phase: input.phase,
        provider,
        model,
        retryIndex: input.retryIndex,
        durationMs,
        outcome: "success",
      });
      const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, span);
      ledgerWritten = ledgerResult.ok;
      ledgerPath = ledgerResult.path;
    }

    let text = "";
    if (provider === "anthropic") {
      const content = (raw as { content?: Array<{ type?: string; text?: string }> })?.content;
      if (Array.isArray(content)) {
        text = content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text!)
          .join("");
      }
    } else {
      const choices = (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices;
      text = choices?.[0]?.message?.content ?? "";
    }

    return {
      text,
      raw,
      span,
      ledgerWritten,
      ledgerPath,
    };
  }
}
