/**
 * V1-SEC-02 — Local Credential Proxy + hard SSRF block.
 * Injects credentials only for authorized domains; blocks private/link-local targets.
 *
 * V2-SEC-02 — Granular DomainPolicy by task_type + AdapterSandboxProfile by adapter_id.
 * CredentialProxy.authorize() is fail-closed: default deny outside allowlists.
 *
 * V3-SEC-02 — DLP egress inspection (body/headers) before credential injection.
 */

import { isIP } from "node:net";
import { URL } from "node:url";
import {
  inspectEgress,
  type DlpEgressDecision,
  type InspectEgressInput,
  type InspectEgressOptions,
} from "./dlp-egress.js";

export class CredentialProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CredentialProxyError";
  }
}

export interface CredentialProxyConfig {
  /** Domains allowed to receive injected credentials (exact or *.suffix). */
  authorized_domains: string[];
  /** Map domain → header/env secret material (never logged). */
  credentials: Record<string, { header?: string; value: string }>;
}

export interface CredentialProxyDecision {
  kind: "CredentialProxyDecision";
  allowed: boolean;
  blocked: boolean;
  reason: string;
  host: string;
  /** Injected Authorization (or custom) header when allowed — never for blocked. */
  injected_headers: Record<string, string>;
}

/** CIDR-style private / special-use ranges that MUST be blocked (V1-SEC-02). */
export const SSRF_BLOCKED_RANGES = [
  "127.0.0.0/8",
  "::1",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "169.254.0.0/16",
] as const;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function inCidrV4(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net!);
  if (ipInt == null || netInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/** True when host is loopback / private / CGNAT / link-local (IPv4 or IPv6). */
export function isSsrfBlockedHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") {
    return true;
  }

  // IPv6 loopback / ULA / link-local
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4-mapped IPv6
  const v4mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return isSsrfBlockedHost(v4mapped[1]!);

  const ipVersion = isIP(h);
  if (ipVersion === 4) {
    return (
      inCidrV4(h, "127.0.0.0/8") ||
      inCidrV4(h, "10.0.0.0/8") ||
      inCidrV4(h, "172.16.0.0/12") ||
      inCidrV4(h, "192.168.0.0/16") ||
      inCidrV4(h, "100.64.0.0/10") ||
      inCidrV4(h, "169.254.0.0/16") ||
      inCidrV4(h, "0.0.0.0/8")
    );
  }
  if (ipVersion === 6) {
    // Any IPv6 that is not a public global unicast we treat conservatively for SSRF
    // beyond ::1 / fe80 / fc00::/7 already handled: still block ::1 variants.
    return h === "::" || h === "0:0:0:0:0:0:0:0";
  }

  return false;
}

function parseTarget(urlOrHost: string): { host: string; href?: string } {
  const raw = urlOrHost.trim();
  if (!raw) throw new CredentialProxyError("EMPTY_TARGET", "target URL/host required");
  try {
    if (raw.includes("://")) {
      const u = new URL(raw);
      return { host: u.hostname, href: u.href };
    }
    // Bracketed IPv6: [::1] or [::1]:443
    if (raw.startsWith("[")) {
      const end = raw.indexOf("]");
      if (end > 0) {
        return { host: raw.slice(1, end) };
      }
    }
    // Bare IPv6 (contains multiple colons) — do not strip ":port" naively.
    if ((raw.match(/:/g) ?? []).length >= 2) {
      return { host: raw };
    }
    // hostname or IPv4[:port]
    const host = raw.replace(/:\d+$/, "");
    return { host };
  } catch {
    throw new CredentialProxyError("INVALID_URL", `cannot parse target: ${raw}`);
  }
}

function domainAuthorized(host: string, authorized: string[]): boolean {
  const h = host.toLowerCase();
  for (const d of authorized) {
    const pat = d.toLowerCase().trim();
    if (!pat) continue;
    if (pat.startsWith("*.")) {
      const suffix = pat.slice(1); // .example.com
      if (h === pat.slice(2) || h.endsWith(suffix)) return true;
    } else if (h === pat) {
      return true;
    }
  }
  return false;
}

function credentialForHost(
  host: string,
  credentials: CredentialProxyConfig["credentials"],
): { header?: string; value: string } | undefined {
  const h = host.toLowerCase();
  if (credentials[h]) return credentials[h];
  for (const [k, v] of Object.entries(credentials)) {
    if (k.startsWith("*.") && (h === k.slice(2) || h.endsWith(k.slice(1)))) return v;
  }
  return undefined;
}

/**
 * Decide whether to inject credentials for a target.
 * Fail-closed: SSRF ranges always blocked; unauthorized domains get no secrets.
 */
export function evaluateCredentialProxy(
  target: string,
  config: CredentialProxyConfig,
): CredentialProxyDecision {
  const { host } = parseTarget(target);

  if (isSsrfBlockedHost(host)) {
    return {
      kind: "CredentialProxyDecision",
      allowed: false,
      blocked: true,
      reason: `ssrf_blocked_host:${host}`,
      host,
      injected_headers: {},
    };
  }

  if (!domainAuthorized(host, config.authorized_domains)) {
    return {
      kind: "CredentialProxyDecision",
      allowed: false,
      blocked: true,
      reason: `domain_not_authorized:${host}`,
      host,
      injected_headers: {},
    };
  }

  const cred = credentialForHost(host, config.credentials);
  if (!cred) {
    return {
      kind: "CredentialProxyDecision",
      allowed: true,
      blocked: false,
      reason: "authorized_no_credential_mapped",
      host,
      injected_headers: {},
    };
  }

  const headerName = cred.header ?? "Authorization";
  return {
    kind: "CredentialProxyDecision",
    allowed: true,
    blocked: false,
    reason: "credentials_injected",
    host,
    injected_headers: { [headerName]: cred.value },
  };
}

/** Assert inject path — throws on SSRF / unauthorized. */
export function assertCredentialProxyAllowed(
  target: string,
  config: CredentialProxyConfig,
): CredentialProxyDecision {
  const d = evaluateCredentialProxy(target, config);
  if (d.blocked) {
    throw new CredentialProxyError("SSRF_OR_UNAUTHORIZED", d.reason);
  }
  return d;
}

/* -------------------------------------------------------------------------- */
/* V2-SEC-02 — DomainPolicy + AdapterSandboxProfile + CredentialProxy class   */
/* -------------------------------------------------------------------------- */

/** Allow/deny hosts/domains scoped to a task_type (fail-closed). */
export interface DomainPolicy {
  kind: "DomainPolicy";
  task_type: string;
  /** Explicit allowlist (exact host or *.suffix). Empty ≡ deny all for this task. */
  allow: string[];
  /** Explicit denylist — always wins over allow. */
  deny: string[];
}

/** Network + filesystem + env capabilities for a circuit/agent adapter. */
export interface AdapterSandboxCapabilities {
  /** Network egress for credential/egress decisions. */
  net: {
    mode: "deny" | "allowlist";
    /** Hosts/domains allowed when mode=allowlist. Empty allowlist ≡ deny. */
    allowlist: string[];
  };
  /** Absolute roots the adapter may read/write. */
  fs_roots: string[];
  /** Env var names injectable/inheritable inside the adapter sandbox. */
  env_allowlist: string[];
}

export interface AdapterSandboxProfile {
  kind: "AdapterSandboxProfile";
  adapter_id: string;
  capabilities: AdapterSandboxCapabilities;
  notes?: string[];
}

export interface CredentialProxyAuthorizeRequest {
  task_type: string;
  adapter_id: string;
  /** Full URL preferred when available. */
  target_url?: string;
  /** Bare host when URL is unavailable. */
  host?: string;
  /**
   * Optional outbound HTTP/HTTPS body for V3-SEC-02 DLP egress inspection.
   * When present (or headers present), inspectEgress runs before inject.
   */
  body?: InspectEgressInput["body"];
  /** Optional outbound request headers for DLP egress inspection. */
  headers?: InspectEgressInput["headers"];
}

export interface CredentialProxyAuthorizeResult {
  kind: "CredentialProxyAuthorizeResult";
  allowed: boolean;
  blocked: boolean;
  reason: string;
  host: string;
  task_type: string;
  adapter_id: string;
  injected_headers: Record<string, string>;
  domain_policy_id: string | null;
  adapter_profile_id: string | null;
  /** Present when DLP ran (body/headers supplied) or when DLP blocked. */
  dlp?: DlpEgressDecision;
}

export interface CredentialProxyOptions {
  /** Optional V1 credential map for header injection after policy allow. */
  credentials?: CredentialProxyConfig;
  domain_policies?: DomainPolicy[];
  adapter_profiles?: AdapterSandboxProfile[];
  /** Optional DLP pattern overrides for inspectEgress. */
  dlp?: InspectEgressOptions;
}

function hostMatchesPatterns(host: string, patterns: string[]): boolean {
  return domainAuthorized(host, patterns);
}

/**
 * Evaluate DomainPolicy for a host.
 * Deny list wins; missing/empty allow → deny (default deny).
 */
export function evaluateDomainPolicy(
  host: string,
  policy: DomainPolicy | undefined,
): { allowed: boolean; reason: string } {
  if (!policy) {
    return { allowed: false, reason: `no_domain_policy_for_task` };
  }
  if (hostMatchesPatterns(host, policy.deny)) {
    return { allowed: false, reason: `domain_denied_by_task_policy:${host}` };
  }
  if (!policy.allow.length || !hostMatchesPatterns(host, policy.allow)) {
    return { allowed: false, reason: `domain_not_in_task_allowlist:${host}` };
  }
  return { allowed: true, reason: `domain_allowed_by_task_policy:${policy.task_type}` };
}

/**
 * Evaluate AdapterSandboxProfile network capability for a host.
 * Missing profile / deny mode / empty allowlist → deny.
 */
export function evaluateAdapterNetPolicy(
  host: string,
  profile: AdapterSandboxProfile | undefined,
): { allowed: boolean; reason: string } {
  if (!profile) {
    return { allowed: false, reason: `no_adapter_sandbox_profile` };
  }
  const net = profile.capabilities.net;
  if (net.mode === "deny") {
    return { allowed: false, reason: `adapter_net_denied:${profile.adapter_id}` };
  }
  if (!net.allowlist.length || !hostMatchesPatterns(host, net.allowlist)) {
    return {
      allowed: false,
      reason: `adapter_host_not_in_allowlist:${profile.adapter_id}:${host}`,
    };
  }
  return { allowed: true, reason: `adapter_net_allowed:${profile.adapter_id}` };
}

/** Built-in adapter sandbox profiles (cursor / antigravity). */
export function defaultAdapterSandboxProfiles(
  workspaceRoot = "/tmp/evolve-workspace",
): AdapterSandboxProfile[] {
  const env = ["PATH", "LANG", "TERM", "HOME", "TMPDIR"];
  return [
    {
      kind: "AdapterSandboxProfile",
      adapter_id: "cursor",
      capabilities: {
        net: {
          mode: "allowlist",
          allowlist: ["api.openai.com", "*.anthropic.com", "*.cursor.sh", "api2.cursor.sh"],
        },
        fs_roots: [workspaceRoot, "/tmp"],
        env_allowlist: [...env, "CURSOR_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      },
      notes: ["Harness/provider network allowlist for cursor adapter"],
    },
    {
      kind: "AdapterSandboxProfile",
      adapter_id: "antigravity",
      capabilities: {
        net: {
          mode: "allowlist",
          allowlist: ["api.openai.com", "*.anthropic.com"],
        },
        fs_roots: [workspaceRoot, "/tmp"],
        env_allowlist: [...env, "ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
      },
      notes: ["Narrower allowlist for antigravity bridge"],
    },
  ];
}

/**
 * Credential proxy with per-task DomainPolicy and per-adapter sandbox profiles.
 * Fail-closed: unknown task_type / adapter_id / host outside allowlists → blocked.
 */
export class CredentialProxy {
  private readonly credentials: CredentialProxyConfig;
  private readonly domainPolicies = new Map<string, DomainPolicy>();
  private readonly adapterProfiles = new Map<string, AdapterSandboxProfile>();
  private readonly dlpOpts: InspectEgressOptions;

  constructor(opts: CredentialProxyOptions = {}) {
    this.credentials = opts.credentials ?? { authorized_domains: [], credentials: {} };
    this.dlpOpts = opts.dlp ?? {};
    for (const p of opts.domain_policies ?? []) {
      this.setDomainPolicy(p);
    }
    for (const a of opts.adapter_profiles ?? []) {
      this.setAdapterProfile(a);
    }
  }

  /**
   * V3-SEC-02 — Inspect outbound body/headers for secret / proprietary exfil.
   * Standalone entry used by authorize() and by callers that only need DLP.
   */
  inspectEgress(
    input: InspectEgressInput,
    opts?: InspectEgressOptions,
  ): DlpEgressDecision {
    return inspectEgress(input, { ...this.dlpOpts, ...opts });
  }

  setDomainPolicy(policy: DomainPolicy): void {
    if (!policy.task_type?.trim()) {
      throw new CredentialProxyError("INVALID_DOMAIN_POLICY", "task_type required");
    }
    this.domainPolicies.set(policy.task_type, {
      kind: "DomainPolicy",
      task_type: policy.task_type,
      allow: [...(policy.allow ?? [])],
      deny: [...(policy.deny ?? [])],
    });
  }

  setAdapterProfile(profile: AdapterSandboxProfile): void {
    if (!profile.adapter_id?.trim()) {
      throw new CredentialProxyError("INVALID_ADAPTER_PROFILE", "adapter_id required");
    }
    const caps = profile.capabilities;
    this.adapterProfiles.set(profile.adapter_id, {
      kind: "AdapterSandboxProfile",
      adapter_id: profile.adapter_id,
      capabilities: {
        net: {
          mode: caps.net.mode,
          allowlist: [...(caps.net.allowlist ?? [])],
        },
        fs_roots: [...(caps.fs_roots ?? [])],
        env_allowlist: [...(caps.env_allowlist ?? [])],
      },
      notes: profile.notes ? [...profile.notes] : undefined,
    });
  }

  getDomainPolicy(taskType: string): DomainPolicy | undefined {
    return this.domainPolicies.get(taskType);
  }

  getAdapterProfile(adapterId: string): AdapterSandboxProfile | undefined {
    return this.adapterProfiles.get(adapterId);
  }

  listDomainPolicies(): DomainPolicy[] {
    return [...this.domainPolicies.values()];
  }

  listAdapterProfiles(): AdapterSandboxProfile[] {
    return [...this.adapterProfiles.values()];
  }

  /**
   * Authorize credential injection / egress for a target under task + adapter policies.
   * Order: parse → SSRF → DomainPolicy → AdapterSandboxProfile.net →
   *        V3-SEC-02 DLP (when body/headers present) → optional inject.
   */
  authorize(req: CredentialProxyAuthorizeRequest): CredentialProxyAuthorizeResult {
    const task_type = req.task_type?.trim() ?? "";
    const adapter_id = req.adapter_id?.trim() ?? "";
    const target = (req.target_url ?? req.host ?? "").trim();
    const hasDlpPayload = req.body != null || req.headers != null;

    const base = (
      host: string,
      reason: string,
      extra?: Partial<CredentialProxyAuthorizeResult>,
    ): CredentialProxyAuthorizeResult => ({
      kind: "CredentialProxyAuthorizeResult",
      allowed: false,
      blocked: true,
      reason,
      host,
      task_type,
      adapter_id,
      injected_headers: {},
      domain_policy_id: null,
      adapter_profile_id: null,
      ...extra,
    });

    if (!task_type) {
      return base("", "task_type_required");
    }
    if (!adapter_id) {
      return base("", "adapter_id_required");
    }
    if (!target) {
      return base("", "target_url_or_host_required");
    }

    let host: string;
    try {
      host = parseTarget(target).host;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return base("", `invalid_target:${msg}`);
    }

    if (isSsrfBlockedHost(host)) {
      return {
        ...base(host, `ssrf_blocked_host:${host}`),
      };
    }

    const domainPolicy = this.getDomainPolicy(task_type);
    const domainEval = evaluateDomainPolicy(host, domainPolicy);
    if (!domainEval.allowed) {
      return {
        ...base(host, domainEval.reason),
        domain_policy_id: domainPolicy ? domainPolicy.task_type : null,
      };
    }

    const adapterProfile = this.getAdapterProfile(adapter_id);
    const netEval = evaluateAdapterNetPolicy(host, adapterProfile);
    if (!netEval.allowed) {
      return {
        ...base(host, netEval.reason),
        domain_policy_id: domainPolicy!.task_type,
        adapter_profile_id: adapterProfile?.adapter_id ?? null,
      };
    }

    // Optional defense-in-depth: if V1 authorized_domains is non-empty, require match.
    if (
      this.credentials.authorized_domains.length > 0 &&
      !domainAuthorized(host, this.credentials.authorized_domains)
    ) {
      return {
        ...base(host, `domain_not_authorized:${host}`),
        domain_policy_id: domainPolicy!.task_type,
        adapter_profile_id: adapterProfile!.adapter_id,
      };
    }

    // V3-SEC-02: DLP egress before credential injection when payload supplied.
    let dlp: DlpEgressDecision | undefined;
    if (hasDlpPayload) {
      dlp = this.inspectEgress({ body: req.body, headers: req.headers });
      if (dlp.blocked) {
        const dlpReason = `dlp_egress_blocked:${dlp.reasons.join(",") || "unknown"}`;
        return {
          ...base(host, dlpReason, {
            domain_policy_id: domainPolicy!.task_type,
            adapter_profile_id: adapterProfile!.adapter_id,
            dlp,
          }),
        };
      }
    }

    const cred = credentialForHost(host, this.credentials.credentials);
    const injected_headers: Record<string, string> = {};
    let reason = "authorized_by_policies";
    if (cred) {
      injected_headers[cred.header ?? "Authorization"] = cred.value;
      reason = "credentials_injected";
    }

    return {
      kind: "CredentialProxyAuthorizeResult",
      allowed: true,
      blocked: false,
      reason,
      host,
      task_type,
      adapter_id,
      injected_headers,
      domain_policy_id: domainPolicy!.task_type,
      adapter_profile_id: adapterProfile!.adapter_id,
      ...(dlp ? { dlp } : {}),
    };
  }

  /** Throws CredentialProxyError when authorize() blocks. */
  assertAuthorized(req: CredentialProxyAuthorizeRequest): CredentialProxyAuthorizeResult {
    const d = this.authorize(req);
    if (d.blocked) {
      throw new CredentialProxyError("SSRF_OR_UNAUTHORIZED", d.reason);
    }
    return d;
  }
}
