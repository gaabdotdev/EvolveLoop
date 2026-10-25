/**
 * EvolveLoop V2.5 - Observable LLM Provider Adapter
 * Directly connects G1 Inference Ledger and classification to LLM completions in V2.5.
 * Strictly decoupled from OmniRoute (runs with direct provider fallback).
 * Enforces SSRF prevention, allowlisted providers, and rigorous input validation.
 */

import net from "node:net";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
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
export const DEFAULT_INFERENCE_TIMEOUT_MS = 60000; // 60s fallback

export function pinnedLookup(pinnedIp: string, pinnedFamily = 4) {
  return function lookup(
    hostname: string,
    options: any,
    callback: (err: Error | null, address: any, family?: number) => void,
  ) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "object" ? options : {};
    if (opts.all) {
      cb(null, [{ address: pinnedIp, family: pinnedFamily }]);
    } else {
      cb(null, pinnedIp, pinnedFamily);
    }
  };
}

export interface PinnedFetchOptions {
  defaultTimeoutMs?: number;
}

export function createPinnedFetch(options: PinnedFetchOptions = {}): FetchFn {
  return async function pinnedFetch(
    input: string | URL | Request,
    init?: RequestInit & { pinnedIp?: string; pinnedFamily?: number },
  ): Promise<Response> {
    const rawUrl = typeof input === "object" && "url" in input ? input.url : String(input);
    const url = new URL(rawUrl);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const pinnedIp = init?.pinnedIp;
    const pinnedFamily = init?.pinnedFamily || 4;

    // Timeout fallback when init.signal is not provided
    let fallbackTimeoutSignal: AbortSignal | undefined;
    let fallbackTimer: NodeJS.Timeout | undefined;
    if (!init?.signal && options.defaultTimeoutMs && options.defaultTimeoutMs > 0) {
      const ctrl = new AbortController();
      fallbackTimer = setTimeout(() => {
        const timeoutErr = new Error(`Request timed out after ${options.defaultTimeoutMs}ms`);
        (timeoutErr as any).code = "TIMEOUT";
        ctrl.abort(timeoutErr);
      }, options.defaultTimeoutMs);
      fallbackTimeoutSignal = ctrl.signal;
    }

    const effectiveSignal = init?.signal
      ? (fallbackTimeoutSignal ? AbortSignal.any([init.signal, fallbackTimeoutSignal]) : init.signal)
      : fallbackTimeoutSignal;

    return new Promise<Response>((resolve, reject) => {
      let isSettled = false;
      const cleanup = () => {
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = undefined;
        }
      };

      const headers = new Headers(init?.headers);
      if (!headers.has("host")) {
        headers.set("host", url.host);
      }
      const reqHeaders: Record<string, string> = {};
      headers.forEach((val, key) => {
        reqHeaders[key] = val;
      });

      let sanitizedHostname = url.hostname;
      while (sanitizedHostname.endsWith(".")) {
        sanitizedHostname = sanitizedHostname.slice(0, -1);
      }

      const reqOpts: https.RequestOptions = {
        protocol: url.protocol,
        hostname: sanitizedHostname,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: url.pathname + url.search,
        method: init?.method || "POST",
        headers: reqHeaders,
        servername: sanitizedHostname, // Preserves SNI and certificate validation!
        signal: effectiveSignal,
      };

      if (pinnedIp) {
        reqOpts.lookup = pinnedLookup(pinnedIp, pinnedFamily);
      }

      const req = client.request(reqOpts, (res) => {
        if (init?.redirect === "error" && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          cleanup();
          req.destroy();
          isSettled = true;
          return reject(new Error("[-] SECURITY_SSRF_VIOLATION: HTTP redirects are strictly forbidden."));
        }

        res.on("close", cleanup);
        res.on("error", cleanup);

        const webStream = Readable.toWeb(res) as ReadableStream;
        const response = new Response(webStream, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers as HeadersInit,
        });
        isSettled = true;
        resolve(response);
      });

      req.on("error", (err: any) => {
        cleanup();
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      });

      req.on("close", cleanup);

      if (init?.body) {
        if (typeof init.body === "string" || Buffer.isBuffer(init.body)) {
          req.write(init.body);
        } else {
          req.write(String(init.body));
        }
      }
      req.end();
    });
  };
}

export interface TargetUrlValidationOptions {
  allowLoopback?: boolean;
  allowCustomGateway?: boolean;
  allowedGateways?: string[];
  dnsLookup?: DnsLookupFn;
}

interface CachedDnsRecord {
  records: Array<{ address: string; family: number }>;
  expiresAt: number;
}

const DNS_CACHE = new Map<string, CachedDnsRecord>();

// Pre-seed official endpoints with validated public IP records to prevent cold-start network latency
DNS_CACHE.set("api.anthropic.com", {
  records: [{ address: "160.79.104.10", family: 4 }],
  expiresAt: Date.now() + 300_000,
});
DNS_CACHE.set("api.openai.com", {
  records: [{ address: "162.159.140.245", family: 4 }],
  expiresAt: Date.now() + 300_000,
});

export const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const now = Date.now();
  const cached = DNS_CACHE.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.records;
  }

  try {
    const res = await dns.lookup(hostname, { all: true });
    const records = Array.isArray(res) ? res : [res];
    if (records.length > 0) {
      DNS_CACHE.set(hostname, { records, expiresAt: now + 30_000 });
    }
    return records;
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
 * Safely parses an IPv6 address string (including brackets, zone index, double-colons,
 * leading zeros, and embedded IPv4) into exactly 8 16-bit integers.
 */
export function parseIpv6ToWords(rawIpv6: string): number[] | null {
  let ip = rawIpv6.startsWith("[") && rawIpv6.endsWith("]") ? rawIpv6.slice(1, -1) : rawIpv6;
  ip = ip.split("%")[0].toLowerCase();

  let left = ip;
  let right = "";
  if (ip.includes("::")) {
    const doubleColon = ip.indexOf("::");
    if (ip.indexOf("::", doubleColon + 2) !== -1) return null;
    left = ip.slice(0, doubleColon);
    right = ip.slice(doubleColon + 2);
  }

  function parseSegment(part: string): number[] | null {
    if (!part) return [];
    const tokens = part.split(":");
    const words: number[] = [];
    for (const t of tokens) {
      if (t.includes(".")) {
        const octets = t.split(".").map(Number);
        if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255 || !Number.isInteger(o))) return null;
        words.push((octets[0] << 8) | octets[1]);
        words.push((octets[2] << 8) | octets[3]);
      } else {
        if (t.length === 0 || t.length > 4) return null;
        const val = parseInt(t, 16);
        if (isNaN(val) || val < 0 || val > 0xffff) return null;
        words.push(val);
      }
    }
    return words;
  }

  const leftWords = parseSegment(left);
  const rightWords = parseSegment(right);
  if (!leftWords || !rightWords) return null;

  if (!ip.includes("::")) {
    return leftWords.length === 8 ? leftWords : null;
  }

  const missing = 8 - (leftWords.length + rightWords.length);
  if (missing < 0) return null;
  const middle = new Array(missing).fill(0);
  return [...leftWords, ...middle, ...rightWords];
}

/**
 * Checks whether an IPv4 address belongs to a forbidden/private/internal range.
 * Fully incorporates RFC 6890, RFC 5737, and RFC 2544 allocations.
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

  // 192.0.0.0/24 (IETF Protocol Assignments, RFC 6890)
  if (a === 192 && b === 0 && c === 0) {
    return { forbidden: true, reason: "IETF Protocol Assignments (192.0.0.0/24)" };
  }

  // 192.0.2.0/24 (TEST-NET-1 Documentation, RFC 5737)
  if (a === 192 && b === 0 && c === 2) {
    return { forbidden: true, reason: "TEST-NET-1 (192.0.2.0/24)" };
  }

  // 198.18.0.0/15 (Network Benchmark Testing, RFC 2544 / RFC 6890)
  if (a === 198 && (b === 18 || b === 19)) {
    return { forbidden: true, reason: "Network Benchmark Testing (198.18.0.0/15)" };
  }

  // 198.51.100.0/24 (TEST-NET-2 Documentation, RFC 5737)
  if (a === 198 && b === 51 && c === 100) {
    return { forbidden: true, reason: "TEST-NET-2 (198.51.100.0/24)" };
  }

  // 203.0.113.0/24 (TEST-NET-3 Documentation, RFC 5737)
  if (a === 203 && b === 0 && c === 113) {
    return { forbidden: true, reason: "TEST-NET-3 (203.0.113.0/24)" };
  }

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return { forbidden: true, reason: "Multicast (224.0.0.0/4)" };

  // 240.0.0.0/4 (Reserved / Future Use & Broadcast)
  if (a >= 240) return { forbidden: true, reason: "Reserved / Broadcast (240.0.0.0/4)" };

  return { forbidden: false };
}

/**
 * Checks whether an IPv6 address string belongs to a forbidden range.
 * Uses semantic 16-bit word decomposition (parseIpv6ToWords) covering all standard and evasion encodings.
 */
export function isForbiddenIPv6(rawIpv6: string): { forbidden: boolean; reason?: string } {
  const words = parseIpv6ToWords(rawIpv6);
  if (!words) {
    return { forbidden: true, reason: "Malformed IPv6 address" };
  }
  const [w0, w1, w2, w3, w4, w5, w6, w7] = words;

  // Unspecified (::)
  if (words.every((w) => w === 0)) {
    return { forbidden: true, reason: "IPv6 Unspecified (::)" };
  }

  // Loopback (::1, 0:0:0:0:0:0:0:0001, ::1%lo, etc.)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) {
    return { forbidden: true, reason: "IPv6 Loopback (::1)" };
  }

  // IPv4-mapped (::ffff:x.x.x.x) or IPv4-compatible (::x.x.x.x)
  const isV4Mapped = w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff;
  const isV4Compatible = w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0;

  if (isV4Mapped || isV4Compatible) {
    const embeddedOctets = [(w6 >> 8) & 0xff, w6 & 0xff, (w7 >> 8) & 0xff, w7 & 0xff];
    const v4Check = isForbiddenIPv4(embeddedOctets);
    if (v4Check.forbidden) {
      return { forbidden: true, reason: `${isV4Mapped ? "IPv4-mapped" : "IPv4-compatible"} IPv6 -> ${v4Check.reason}` };
    }
    if (isV4Compatible) {
      return { forbidden: true, reason: "IPv4-compatible IPv6 (deprecated RFC 4291)" };
    }
    return { forbidden: true, reason: "IPv4-mapped IPv6 address" };
  }

  // NAT64 Well-Known Prefix 64:ff9b::/96 (RFC 6052) and Local-Use 64:ff9b:1::/48 (RFC 8215)
  if (w0 === 0x0064 && w1 === 0xff9b) {
    const embeddedOctets = [(w6 >> 8) & 0xff, w6 & 0xff, (w7 >> 8) & 0xff, w7 & 0xff];
    const v4Check = isForbiddenIPv4(embeddedOctets);
    if (v4Check.forbidden) {
      return { forbidden: true, reason: `NAT64 IPv6 -> ${v4Check.reason}` };
    }
    return { forbidden: true, reason: "NAT64 translation prefix (RFC 6052 / RFC 8215)" };
  }

  // 6to4 Prefix 2002::/16 (RFC 3056, deprecated RFC 7526)
  if (w0 === 0x2002) {
    const embeddedOctets = [(w1 >> 8) & 0xff, w1 & 0xff, (w2 >> 8) & 0xff, w2 & 0xff];
    const v4Check = isForbiddenIPv4(embeddedOctets);
    if (v4Check.forbidden) {
      return { forbidden: true, reason: `6to4 IPv6 -> ${v4Check.reason}` };
    }
    return { forbidden: true, reason: "6to4 relay prefix (RFC 3056 / RFC 7526)" };
  }

  // fe80::/10 (Link-Local)
  if ((w0 & 0xffc0) === 0xfe80) {
    return { forbidden: true, reason: "IPv6 Link-Local (fe80::/10)" };
  }

  // fc00::/7 (Unique Local Address, RFC 4193)
  if ((w0 & 0xfe00) === 0xfc00) {
    return { forbidden: true, reason: "IPv6 Unique Local (fc00::/7)" };
  }

  // ff00::/8 (Multicast)
  if ((w0 & 0xff00) === 0xff00) {
    return { forbidden: true, reason: "IPv6 Multicast (ff00::/8)" };
  }

  // 2001:db8::/32 (Documentation)
  if (w0 === 0x2001 && w1 === 0x0db8) {
    return { forbidden: true, reason: "IPv6 Documentation (2001:db8::/32)" };
  }

  // 100::/64 (Discard-Only)
  if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) {
    return { forbidden: true, reason: "IPv6 Discard-Only (100::/64)" };
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
  while (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }
  if (!hostname) {
    throw new Error("[-] SECURITY_SSRF_VIOLATION: Hostname cannot be empty.");
  }
  parsed.hostname = hostname;

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
 * Performs full validation including async DNS resolution for all domains to prevent DNS rebinding.
 * Strict fail-closed allowlist is enforced before accepting IP literals.
 */
export async function validateTargetUrlAndResolve(
  rawUrl: string,
  options: TargetUrlValidationOptions = {},
): Promise<URL> {
  const parsed = validateTargetUrl(rawUrl, options);
  let hostname = parsed.hostname.toLowerCase();
  while (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }
  parsed.hostname = hostname;

  const isV6Bracket = hostname.startsWith("[") && hostname.endsWith("]");
  const rawIpCandidate = isV6Bracket ? hostname.slice(1, -1) : hostname;

  const allowLoopback = options.allowLoopback ?? false;
  const allowCustomGateway = options.allowCustomGateway ?? false;
  const allowedGateways = options.allowedGateways ?? [];
  const isAllowlisted =
    DEFAULT_ALLOWLIST.has(hostname) ||
    allowedGateways.includes(hostname) ||
    (allowLoopback && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]"));

  // 1. Strict allowlist check applies to BOTH hostnames AND IP literals!
  if (!isAllowlisted && !allowCustomGateway) {
    throw new Error(
      `[-] SECURITY_SSRF_VIOLATION: Custom gateway host '${hostname}' is not in the approved endpoint allowlist. Custom gateways must be explicitly authorized.`,
    );
  }

  // 2. IP literals (already verified not forbidden by validateTargetUrl and authorized by allowlist/custom):
  // Set pinnedIp directly without DNS lookup
  if (net.isIP(rawIpCandidate)) {
    (parsed as any).pinnedIp = rawIpCandidate;
    (parsed as any).pinnedFamily = net.isIPv4(rawIpCandidate) ? 4 : 6;
    return parsed;
  }

  // 3. Mandatory DNS resolution for ALL hostnames (DEFAULT_ALLOWLIST, allowedGateways, and custom gateways)
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
    } else {
      throw new Error(`[-] SECURITY_SSRF_VIOLATION: DNS resolution for '${hostname}' returned invalid IP '${addr}'.`);
    }
  }

  const pinnedRecord = records.find((r) => r.family === 4) || records[0];
  (parsed as any).pinnedIp = pinnedRecord.address;
  (parsed as any).pinnedFamily = pinnedRecord.family;

  return parsed;
}

export interface ObservableLlmProviderAdapterOptions {
  allowLoopback?: boolean;
  allowCustomGateway?: boolean;
  allowedGateways?: string[];
  dnsLookup?: DnsLookupFn;
  defaultTimeoutMs?: number;
}

function isNativeNodeFetch(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  const str = Function.prototype.toString.call(fn);
  return str.includes("[native code]") || str.includes("internal/deps/undici/undici");
}

export class ObservableLlmProviderAdapter {
  private readonly fetchImpl: FetchFn;
  private readonly allowLoopback: boolean;
  private readonly allowCustomGateway: boolean;
  private readonly allowedGateways: string[];
  private readonly dnsLookup?: DnsLookupFn;
  private readonly defaultTimeoutMs: number;

  constructor(
    fetchImpl?: FetchFn,
    options: ObservableLlmProviderAdapterOptions | { allowLoopback?: boolean } = {},
  ) {
    const opts = (options || {}) as ObservableLlmProviderAdapterOptions;
    this.allowLoopback = opts.allowLoopback ?? false;
    this.allowCustomGateway = opts.allowCustomGateway ?? false;
    this.allowedGateways = opts.allowedGateways ?? [];
    this.dnsLookup = opts.dnsLookup;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_INFERENCE_TIMEOUT_MS;

    const candidateFetch = fetchImpl ?? (globalThis as any).fetch;
    if (candidateFetch && !isNativeNodeFetch(candidateFetch)) {
      this.fetchImpl = candidateFetch;
    } else {
      this.fetchImpl = createPinnedFetch({ defaultTimeoutMs: this.defaultTimeoutMs });
    }
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
    const rawTimeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutMs =
      typeof rawTimeoutMs === "number" && rawTimeoutMs > 0 && Number.isFinite(rawTimeoutMs)
        ? rawTimeoutMs
        : this.defaultTimeoutMs;

    const signals: AbortSignal[] = [];
    if (input.signal) {
      signals.push(input.signal);
    }
    if (typeof timeoutMs === "number" && timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      signals.push(AbortSignal.timeout(timeoutMs));
    }
    const combinedSignal =
      signals.length === 1 ? signals[0] : signals.length > 1 ? AbortSignal.any(signals) : undefined;

    const pinnedIp = (validatedUrl as any).pinnedIp;
    const pinnedFamily = (validatedUrl as any).pinnedFamily;

    let res: Response;
    let durationMs: number;
    let raw: unknown;

    try {
      res = await this.fetchImpl(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        redirect: "error",
        signal: combinedSignal,
        pinnedIp,
        pinnedFamily,
      } as any);

      if (!res.ok) {
        throw new Error(`${provider}_http_${res.status}`);
      }

      raw = (await res.json()) as unknown;
      durationMs = Number((performance.now() - startTime).toFixed(2));
    } catch (fetchErr: unknown) {
      durationMs = Number((performance.now() - startTime).toFixed(2));
      let isTimeout = false;
      let isCancelled = false;

      const errObj = fetchErr as { name?: string; message?: string; code?: string };

      const isSocketNetworkError =
        errObj?.code === "ECONNABORTED" ||
        errObj?.code === "ECONNRESET" ||
        errObj?.code === "ECONNREFUSED" ||
        errObj?.code === "EPIPE";

      if (
        errObj?.name === "TimeoutError" ||
        combinedSignal?.reason?.name === "TimeoutError" ||
        (combinedSignal?.reason as any)?.code === "TIMEOUT" ||
        errObj?.code === "TIMEOUT" ||
        errObj?.code === "ETIMEDOUT" ||
        errObj?.message?.toLowerCase().includes("timed out") ||
        errObj?.message?.toLowerCase().includes("timeout")
      ) {
        isTimeout = true;
      } else if (
        input.signal?.aborted ||
        (!isSocketNetworkError &&
          (errObj?.name === "AbortError" ||
            (errObj?.message?.toLowerCase().includes("abort") && !errObj?.message?.includes("ECONNABORTED"))))
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
