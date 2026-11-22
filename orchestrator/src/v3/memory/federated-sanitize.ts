/**
 * V3-MEM-07 — Federated Global Memory with Automatic Sanitization (META-WS-006).
 *
 * Cross-project promotion is opt-in via an explicit federation policy.
 * Before any memory may enter the global scope, secrets, absolute/sensitive
 * paths, private variables, and domain names are stripped deterministically.
 * Promotion is refused when residual leakage is still detectable (0% leak).
 */

import { createHash } from "node:crypto";
import type { MemoryRecord, MemoryType } from "./types.js";

export const FEDERATED_SANITIZE_SCHEMA_VERSION = "1";

export const GLOBAL_FEDERATION_SCOPE = "global" as const;

export const REDACTION_TOKENS = {
  secret: "[REDACTED_SECRET]",
  path: "[REDACTED_PATH]",
  private_var: "[REDACTED_PRIVATE_VAR]",
  domain: "[REDACTED_DOMAIN]",
} as const;

export type FederationRedactionKind = keyof typeof REDACTION_TOKENS;

/**
 * Explicit sharing policy. Federation is denied unless `allow_federation` is true.
 * Strip flags default to true when omitted (fail-closed hygiene).
 */
export interface FederationSanitizePolicy {
  /** Hard opt-in — without this, promoteToGlobal always refuses. */
  allow_federation: boolean;
  /** Source project that owns the memory before promotion. */
  source_project_id?: string;
  /** Destination scope after promotion (only "global" is supported). */
  target_scope?: typeof GLOBAL_FEDERATION_SCOPE;
  strip_secrets?: boolean;
  strip_paths?: boolean;
  strip_private_vars?: boolean;
  strip_domain_names?: boolean;
  /** Extra literal canaries that must never survive sanitization. */
  extra_canaries?: string[];
}

export interface FederationRemoval {
  kind: FederationRedactionKind;
  /** Matched raw fragment (truncated for audit size). */
  matched: string;
  replacement: string;
}

export interface FederationResidual {
  kind: FederationRedactionKind | "canary";
  matched: string;
  reason: string;
}

export interface SanitizeForFederationResult {
  text: string;
  policy: Required<
    Pick<
      FederationSanitizePolicy,
      "allow_federation" | "strip_secrets" | "strip_paths" | "strip_private_vars" | "strip_domain_names"
    >
  > &
    Pick<FederationSanitizePolicy, "source_project_id" | "target_scope" | "extra_canaries">;
  removals: FederationRemoval[];
  residuals: FederationResidual[];
  /** True only when no residual leakage remains. */
  leak_free: boolean;
  schema_version: typeof FEDERATED_SANITIZE_SCHEMA_VERSION;
}

export interface FederatedMemoryInput {
  memory_id: string;
  project_id: string;
  memory_type?: MemoryType;
  title: string;
  body: string;
  source?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  /** Optional raw fields that must also be scanned (adversarial extras). */
  extras?: string[];
}

export interface GlobalFederatedMemory {
  memory_id: string;
  /** Always the federation scope — never the source project_id. */
  project_id: typeof GLOBAL_FEDERATION_SCOPE;
  source_project_id: string;
  memory_type: MemoryType;
  title: string;
  body: string;
  source: string;
  payload: Record<string, unknown>;
  created_at: string;
  federated_at: string;
  sanitize: {
    schema_version: typeof FEDERATED_SANITIZE_SCHEMA_VERSION;
    removals: FederationRemoval[];
    leak_free: true;
  };
}

export type PromoteToGlobalResult =
  | {
      ok: true;
      memory: GlobalFederatedMemory;
      sanitize: SanitizeForFederationResult;
    }
  | {
      ok: false;
      code: string;
      reason: string;
      residuals: FederationResidual[];
      sanitize?: SanitizeForFederationResult;
    };

export class FederatedSanitizeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly residuals: FederationResidual[] = [],
  ) {
    super(message);
    this.name = "FederatedSanitizeError";
  }
}

const AUDIT_MATCH_MAX = 120;

/** Secret material: tokens, keys, PEM blocks, assignment forms. */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN[A-Z0-9 \-]*PRIVATE KEY-----[\s\S]*?-----END[A-Z0-9 \-]*PRIVATE KEY-----/gi,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}\b/gi,
  /\b(?:sk|api)[-_]?[A-Za-z0-9]{16,}\b/gi,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi,
  /\bAKIA[0-9A-Z]{16,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  // Lookbehind keeps delimiters (esp. newlines) so adjacent paths stay matchable.
  /(?<=^|[\s"'`])[A-Z][A-Z0-9_]{2,}(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)\s*[=:]\s*[^\s#'"`]+/gm,
];

/**
 * Absolute / home / file-URI / Windows paths and sensitive filenames.
 * Deterministic; does not depend on host cwd.
 */
const PATH_PATTERNS: RegExp[] = [
  /\bfile:\/\/\/[^\s"'`]+/gi,
  /\b[A-Za-z]:\\(?:[^\s"'`\\]+\\)*[^\s"'`\\]+/g,
  /(?<=^|[\s"'`(=])(?:\/(?:home|Users|root|var|tmp|opt|etc|usr|mnt|data)\/|~\/)[^\s"'`]+/gm,
  /(?<=^|[\s"'`(=])\/(?:[A-Za-z0-9._-]+\/){2,}[A-Za-z0-9._-]+/gm,
  /(?<=^|[\s"'`(=])(?:\.\/|\.\.\/)[^\s"'`]+/gm,
  /(?:^|\/)(?:\.env(?:\.[A-Za-z0-9_-]+)?|mcp\.env|id_rsa|id_ed25519|credentials\.json|secrets?\.(?:ya?ml|json|env))(?:\b|\/|$)/gi,
];

/** Private / env-style variables and process.env accesses. */
const PRIVATE_VAR_PATTERNS: RegExp[] = [
  /\bprocess\.env\.[A-Z][A-Z0-9_]{1,}\b/g,
  /\$\{(?:PRIVATE|SECRET|TOKEN|PASSWORD|CREDENTIAL|API[_-]?KEY)[A-Z0-9_]*\}/gi,
  /\$(?:PRIVATE|SECRET|TOKEN|PASSWORD|CREDENTIAL|API[_-]?KEY)[A-Z0-9_]*/gi,
  /(?<=^|[\s"'`])(?:PRIVATE|SECRET)_[A-Z0-9_]+\s*[=:]\s*[^\s#'"`]+/gm,
  /(?<=^|[\s"'`])[A-Z][A-Z0-9_]*(?:_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL|_PRIVATE|_KEY)\s*[=:]\s*[^\s#'"`]+/gm,
  /(?<=^|[\s"'`])export\s+[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s#'"`]+/gm,
];

/** File extensions that must not be treated as DNS TLDs. */
const FILE_EXT_TLD_BLOCK = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "toml",
  "xml",
  "env",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "css",
  "scss",
  "html",
  "map",
  "lock",
  "log",
  "sql",
  "sh",
  "zsh",
  "bash",
  "pem",
  "crt",
  "key",
  "db",
  "sqlite",
  "wasm",
]);

/**
 * Domain names / emails / http(s) URLs.
 * Bare `file.ext` is excluded via FILE_EXT_TLD_BLOCK (paths own those).
 */
const DOMAIN_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g,
  /\bhttps?:\/\/[^\s"'`]+/gi,
  /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:com|net|org|io|dev|local|internal|lan|corp|cloud|ai|app|co|uk|br|example)(?::\d{2,5})?\b/gi,
];

function truncateMatch(s: string): string {
  if (s.length <= AUDIT_MATCH_MAX) return s;
  return `${s.slice(0, AUDIT_MATCH_MAX)}…`;
}

/** Deterministic non-reversible audit fingerprint — never stores raw secret material. */
export function fingerprintMatched(matched: string): string {
  const hex = createHash("sha256").update(matched, "utf8").digest("hex").slice(0, 16);
  return `sha256:${hex}`;
}

/** Removals safe to embed in federated/global artifacts (0% raw leak). */
export function toSafeRemovals(removals: FederationRemoval[]): FederationRemoval[] {
  return removals.map((r) => ({
    kind: r.kind,
    matched: fingerprintMatched(r.matched),
    replacement: r.replacement,
  }));
}

function normalizePolicy(policy: FederationSanitizePolicy): SanitizeForFederationResult["policy"] {
  return {
    allow_federation: policy.allow_federation === true,
    source_project_id: policy.source_project_id,
    target_scope: policy.target_scope ?? GLOBAL_FEDERATION_SCOPE,
    strip_secrets: policy.strip_secrets !== false,
    strip_paths: policy.strip_paths !== false,
    strip_private_vars: policy.strip_private_vars !== false,
    strip_domain_names: policy.strip_domain_names !== false,
    extra_canaries: policy.extra_canaries ? [...policy.extra_canaries] : undefined,
  };
}

function isAlreadyRedactedToken(matched: string): boolean {
  return /^\[REDACTED_[A-Z_]+\]$/.test(matched.trim());
}

function applyPatterns(
  text: string,
  patterns: RegExp[],
  kind: FederationRedactionKind,
  removals: FederationRemoval[],
): string {
  let out = text;
  for (const re of patterns) {
    // Clone flags — global regexes retain lastIndex across calls.
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const clone = new RegExp(re.source, flags);
    out = out.replace(clone, (matched) => {
      // Only skip exact redaction tokens — adjacent secrets must still redact.
      if (isAlreadyRedactedToken(matched)) return matched;
      // Domain pass: ignore bare file.ext (path territory).
      if (kind === "domain" && looksLikeFileName(matched)) return matched;
      const replacement = REDACTION_TOKENS[kind];
      removals.push({ kind, matched: truncateMatch(matched), replacement });
      return replacement;
    });
  }
  return out;
}

function looksLikeFileName(matched: string): boolean {
  if (/^https?:\/\//i.test(matched) || matched.includes("@")) return false;
  const base = matched.replace(/^.*[\\/]/, "").split("?")[0]?.split("#")[0] ?? matched;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  // single-label file.ext (no extra dots in hostname sense beyond one)
  if (FILE_EXT_TLD_BLOCK.has(ext) && !base.slice(0, dot).includes(".")) return true;
  return FILE_EXT_TLD_BLOCK.has(ext) && !/(?:com|net|org|io|dev|local|internal|lan|corp|cloud|example)$/i.test(ext);
}

function applyCanaries(text: string, canaries: string[] | undefined, removals: FederationRemoval[]): string {
  let out = text;
  for (const c of canaries ?? []) {
    if (!c) continue;
    if (!out.includes(c)) continue;
    const parts = out.split(c);
    const count = parts.length - 1;
    out = parts.join(REDACTION_TOKENS.secret);
    for (let i = 0; i < count; i++) {
      removals.push({
        kind: "secret",
        matched: truncateMatch(c),
        replacement: REDACTION_TOKENS.secret,
      });
    }
  }
  return out;
}

/**
 * Collect residual hits by re-running detectors on text.
 * For federation leak-gate (`forFederationGate=true`), ALL categories are scanned
 * regardless of strip_* flags — disabling a strip must not allow promotion with leaks.
 */
export function detectFederationResiduals(
  text: string,
  policy: FederationSanitizePolicy,
  opts?: { forFederationGate?: boolean },
): FederationResidual[] {
  const p = normalizePolicy(policy);
  const residuals: FederationResidual[] = [];
  const gate = opts?.forFederationGate === true;

  const scan = (enabled: boolean, patterns: RegExp[], kind: FederationRedactionKind, reason: string) => {
    if (!gate && !enabled) return;
    for (const re of patterns) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      const clone = new RegExp(re.source, flags);
      let m: RegExpExecArray | null;
      while ((m = clone.exec(text)) !== null) {
        const matched = m[0];
        if (isAlreadyRedactedToken(matched)) continue;
        if (matched.includes("[REDACTED_")) continue;
        if (kind === "domain" && looksLikeFileName(matched)) continue;
        residuals.push({ kind, matched: truncateMatch(matched), reason });
      }
    }
  };

  scan(p.strip_secrets, SECRET_PATTERNS, "secret", "residual_secret_pattern");
  scan(p.strip_paths, PATH_PATTERNS, "path", "residual_path_pattern");
  scan(p.strip_private_vars, PRIVATE_VAR_PATTERNS, "private_var", "residual_private_var_pattern");
  scan(p.strip_domain_names, DOMAIN_PATTERNS, "domain", "residual_domain_pattern");

  for (const c of p.extra_canaries ?? []) {
    if (!c) continue;
    if (text.includes(c)) {
      residuals.push({ kind: "canary", matched: truncateMatch(c), reason: "residual_canary" });
    }
  }

  return residuals;
}

/**
 * Deterministic federation sanitizer.
 * Order: canaries → secrets → private vars → paths → domains (then residual scan).
 */
export function sanitizeForFederation(
  text: string,
  policy: FederationSanitizePolicy,
): SanitizeForFederationResult {
  if (typeof text !== "string") {
    throw new FederatedSanitizeError("INVALID_TEXT", "sanitizeForFederation requires a string");
  }
  const normalized = normalizePolicy(policy);
  const removals: FederationRemoval[] = [];
  let out = text;

  out = applyCanaries(out, normalized.extra_canaries, removals);

  // private_vars before secrets so PRIVATE_* assignments classify as private_var.
  if (normalized.strip_private_vars) {
    out = applyPatterns(out, PRIVATE_VAR_PATTERNS, "private_var", removals);
  }
  if (normalized.strip_secrets) {
    out = applyPatterns(out, SECRET_PATTERNS, "secret", removals);
  }
  if (normalized.strip_paths) {
    out = applyPatterns(out, PATH_PATTERNS, "path", removals);
  }
  if (normalized.strip_domain_names) {
    out = applyPatterns(out, DOMAIN_PATTERNS, "domain", removals);
  }

  // Second pass: nested / overlapping forms after first replacements.
  if (normalized.strip_private_vars) {
    out = applyPatterns(out, PRIVATE_VAR_PATTERNS, "private_var", removals);
  }
  if (normalized.strip_secrets) {
    out = applyPatterns(out, SECRET_PATTERNS, "secret", removals);
  }
  if (normalized.strip_paths) {
    out = applyPatterns(out, PATH_PATTERNS, "path", removals);
  }
  if (normalized.strip_domain_names) {
    out = applyPatterns(out, DOMAIN_PATTERNS, "domain", removals);
  }

  const residuals = detectFederationResiduals(out, normalized, { forFederationGate: true });
  return {
    text: out,
    policy: normalized,
    removals,
    residuals,
    leak_free: residuals.length === 0,
    schema_version: FEDERATED_SANITIZE_SCHEMA_VERSION,
  };
}

function sanitizeDeepStrings(
  value: unknown,
  policy: FederationSanitizePolicy,
  removals: FederationRemoval[],
  residuals: FederationResidual[],
): unknown {
  if (typeof value === "string") {
    const r = sanitizeForFederation(value, policy);
    removals.push(...r.removals);
    residuals.push(...r.residuals);
    return r.text;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDeepStrings(v, policy, removals, residuals));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Keys that look like secret carriers: sanitize string values aggressively.
      out[k] = sanitizeDeepStrings(v, policy, removals, residuals);
    }
    return out;
  }
  return value;
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function assertPolicyAllows(
  policy: FederationSanitizePolicy,
): Extract<PromoteToGlobalResult, { ok: false }> | null {
  if (policy.allow_federation !== true) {
    return {
      ok: false,
      code: "FEDERATION_POLICY_DENIED",
      reason: "explicit allow_federation=true required before promoteToGlobal",
      residuals: [],
    };
  }
  const scope = policy.target_scope ?? GLOBAL_FEDERATION_SCOPE;
  if (scope !== GLOBAL_FEDERATION_SCOPE) {
    return {
      ok: false,
      code: "FEDERATION_SCOPE_INVALID",
      reason: `target_scope must be "${GLOBAL_FEDERATION_SCOPE}", got ${String(scope)}`,
      residuals: [],
    };
  }
  return null;
}

/**
 * Promote a project-local memory into the global federation scope.
 * Always runs sanitize first; refuses when any residual is detected.
 */
export function promoteToGlobal(
  memory: FederatedMemoryInput | Pick<MemoryRecord, "memory_id" | "project_id" | "memory_type" | "title" | "body" | "source" | "payload" | "created_at">,
  policy: FederationSanitizePolicy,
  opts?: { clock?: () => Date; throwOnRefuse?: boolean },
): PromoteToGlobalResult {
  const denied = assertPolicyAllows(policy);
  if (denied) {
    if (opts?.throwOnRefuse) {
      throw new FederatedSanitizeError(denied.code, denied.reason, denied.residuals);
    }
    return denied;
  }

  if (!memory || typeof memory.memory_id !== "string" || !memory.memory_id.trim()) {
    const bad: PromoteToGlobalResult = {
      ok: false,
      code: "INVALID_MEMORY",
      reason: "memory_id is required",
      residuals: [],
    };
    if (opts?.throwOnRefuse) throw new FederatedSanitizeError(bad.code, bad.reason);
    return bad;
  }

  const sourceProject =
    policy.source_project_id?.trim() ||
    (typeof memory.project_id === "string" ? memory.project_id : "");
  if (!sourceProject || sourceProject === GLOBAL_FEDERATION_SCOPE) {
    const bad: PromoteToGlobalResult = {
      ok: false,
      code: "SOURCE_PROJECT_REQUIRED",
      reason: "source project_id required and must not already be global",
      residuals: [],
    };
    if (opts?.throwOnRefuse) throw new FederatedSanitizeError(bad.code, bad.reason);
    return bad;
  }

  const policyWithSource: FederationSanitizePolicy = {
    ...policy,
    allow_federation: true,
    source_project_id: sourceProject,
    target_scope: GLOBAL_FEDERATION_SCOPE,
  };

  const removals: FederationRemoval[] = [];
  const residuals: FederationResidual[] = [];

  const titleResult = sanitizeForFederation(String(memory.title ?? ""), policyWithSource);
  removals.push(...titleResult.removals);
  residuals.push(...titleResult.residuals);

  const bodyResult = sanitizeForFederation(String(memory.body ?? ""), policyWithSource);
  removals.push(...bodyResult.removals);
  residuals.push(...bodyResult.residuals);

  const sourceResult = sanitizeForFederation(String(memory.source ?? "federated"), policyWithSource);
  removals.push(...sourceResult.removals);
  residuals.push(...sourceResult.residuals);

  const payloadIn =
    memory.payload && typeof memory.payload === "object" && !Array.isArray(memory.payload)
      ? memory.payload
      : {};
  const payloadOut = sanitizeDeepStrings(payloadIn, policyWithSource, removals, residuals) as Record<
    string,
    unknown
  >;

  const extras = "extras" in memory && Array.isArray(memory.extras) ? memory.extras : [];
  for (const extra of extras) {
    const er = sanitizeForFederation(String(extra), policyWithSource);
    removals.push(...er.removals);
    residuals.push(...er.residuals);
  }

  // Combined residual check on the joined sanitized surface (catches cross-field leaks).
  const joined = [titleResult.text, bodyResult.text, sourceResult.text, JSON.stringify(payloadOut)].join(
    "\n",
  );
  const joinedResiduals = detectFederationResiduals(joined, policyWithSource, {
    forFederationGate: true,
  });
  residuals.push(...joinedResiduals);

  const uniqueResiduals = dedupeResiduals(residuals);
  const sanitizeSummary: SanitizeForFederationResult = {
    text: joined,
    policy: normalizePolicy(policyWithSource),
    removals,
    residuals: uniqueResiduals,
    leak_free: uniqueResiduals.length === 0,
    schema_version: FEDERATED_SANITIZE_SCHEMA_VERSION,
  };

  if (!sanitizeSummary.leak_free) {
    const refused: PromoteToGlobalResult = {
      ok: false,
      code: "RESIDUAL_LEAK_DETECTED",
      reason: `federation refused: ${uniqueResiduals.length} residual leak(s) after sanitize`,
      residuals: uniqueResiduals,
      sanitize: sanitizeSummary,
    };
    if (opts?.throwOnRefuse) {
      throw new FederatedSanitizeError(refused.code, refused.reason, uniqueResiduals);
    }
    return refused;
  }

  const federated_at = nowIso(opts?.clock);
  const safeRemovals = toSafeRemovals(removals);
  // Local sanitize summary also uses fingerprints so result JSON is not a leak channel.
  const safeSanitize: SanitizeForFederationResult = {
    ...sanitizeSummary,
    removals: safeRemovals,
  };
  const result: PromoteToGlobalResult = {
    ok: true,
    sanitize: safeSanitize,
    memory: {
      memory_id: memory.memory_id,
      project_id: GLOBAL_FEDERATION_SCOPE,
      source_project_id: sourceProject,
      memory_type: memory.memory_type ?? "semantic",
      title: titleResult.text,
      body: bodyResult.text,
      source: sourceResult.text,
      payload: {
        ...payloadOut,
        federation: {
          schema_version: FEDERATED_SANITIZE_SCHEMA_VERSION,
          source_project_id: sourceProject,
          federated_at,
          removal_count: safeRemovals.length,
        },
      },
      created_at: memory.created_at ?? federated_at,
      federated_at,
      sanitize: {
        schema_version: FEDERATED_SANITIZE_SCHEMA_VERSION,
        removals: safeRemovals,
        leak_free: true,
      },
    },
  };
  return result;
}

function dedupeResiduals(items: FederationResidual[]): FederationResidual[] {
  const seen = new Set<string>();
  const out: FederationResidual[] = [];
  for (const r of items) {
    const key = `${r.kind}|${r.matched}|${r.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Convenience: assert leak-free or throw. */
export function assertLeakFree(result: SanitizeForFederationResult): void {
  if (!result.leak_free) {
    throw new FederatedSanitizeError(
      "RESIDUAL_LEAK_DETECTED",
      `sanitize not leak-free: ${result.residuals.length} residual(s)`,
      result.residuals,
    );
  }
}
