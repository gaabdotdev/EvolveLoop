/**
 * EvolveLoop V4 shared contract primitives (M00-owned).
 *
 * Contracts only: types, normative pure rules and structural/invariant validators.
 * No persistence, no I/O, no engines. See docs/v4/contracts/CONTRACTS.md and ADR-V4-0001.
 */

import { createHash } from "node:crypto";

/** Every V4 contract kind. Adding a kind is a minor catalog change (ADR-V4-0001). */
export type ContractKind =
  | "GoalContract"
  | "Work"
  | "Task"
  | "Execution"
  | "Executor"
  | "ExecutionCapsule"
  | "Checkpoint"
  | "EffectRecord"
  | "Artifact"
  | "Evidence"
  | "WorkProof"
  | "Policy"
  | "PolicyDecision"
  | "CapabilityProfile"
  | "WorkEvent";

/**
 * Common header carried by every persisted/transferred V4 contract object.
 * `tenant_id` is reserved by ADR-V4-0014; single-tenant deployments use "local".
 */
export interface ContractHeader<K extends ContractKind> {
  kind: K;
  /** Semver of the contract schema this object conforms to. */
  schema_version: string;
  tenant_id: string;
}

export const DEFAULT_TENANT_ID = "local";

/** ISO-8601 UTC timestamp string (e.g. 2026-11-15T12:00:00.000Z). Never used for ordering (ADR-V4-0015). */
export type IsoTimestamp = string;

/** Lowercase hex SHA-256 digest. */
export type Sha256Hex = string;

/** Immutable, content-addressed reference (ADR-V4-0004). */
export interface ContentRef {
  sha256: Sha256Hex;
  size_bytes?: number;
  media_type?: string;
  /** Opaque locator (e.g. V3.7 ArtifactFabric artifact_id). Never authoritative over `sha256`. */
  locator?: string;
}

/** Reference to a specific immutable version of a versioned object. */
export interface VersionedRef {
  id: string;
  version: number;
}

/** Executor identity + version, required wherever work is attributed (constitution §5). */
export interface ExecutorRef {
  executor_id: string;
  executor_version: string;
}

/** Who caused something. PLATFORM = EvolveLoop control plane itself. */
export interface ActorRef {
  kind: "PLATFORM" | "EXECUTOR" | "HUMAN" | "POLICY_ENGINE" | "VERIFIER";
  id: string;
}

/**
 * Provenance vocabulary reused verbatim from the V3 Measurement Plane
 * (`orchestrator/src/telemetry/measurement-plane/types.ts`) plus SELF_REPORTED,
 * which V4 needs to make executor self-assessment explicit and non-qualifying.
 */
export type V4ProvenanceKind =
  | "OBSERVED"
  | "PROVIDER_REPORTED"
  | "HARNESS_REPORTED"
  | "ESTIMATED"
  | "DERIVED"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "SELF_REPORTED";

export const PROVENANCE_KINDS: readonly V4ProvenanceKind[] = [
  "OBSERVED",
  "PROVIDER_REPORTED",
  "HARNESS_REPORTED",
  "ESTIMATED",
  "DERIVED",
  "UNAVAILABLE",
  "UNKNOWN",
  "SELF_REPORTED",
];

/** Monetary/resource cost with mandatory provenance — costs are never invented. */
export interface CostRecord {
  amount: number | null;
  currency: string;
  provenance: V4ProvenanceKind;
  breakdown?: Record<string, number>;
}

/**
 * Identifier prefixes (ADR-V4-0015). The suffix is opaque; UUIDv7/ULID recommended.
 */
export const ID_PREFIX = {
  work: "work_",
  goal_contract: "goal_",
  task: "task_",
  execution: "exec_",
  executor: "executor_",
  capsule: "capsule_",
  checkpoint: "ckpt_",
  effect: "eff_",
  artifact: "art_",
  evidence: "evd_",
  proof: "proof_",
  policy: "pol_",
  policy_decision: "pdec_",
  capability_profile: "cprof_",
  event: "evt_",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

const ID_SUFFIX = /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;

export function isValidId(kind: IdKind, value: unknown): value is string {
  if (typeof value !== "string") return false;
  const prefix = ID_PREFIX[kind];
  return value.startsWith(prefix) && ID_SUFFIX.test(value.slice(prefix.length));
}

// ---------------------------------------------------------------------------
// Validation result model
// ---------------------------------------------------------------------------

/**
 * `code` is either "STRUCT" (shape error) or an invariant id from
 * docs/v4/architecture/DOMAIN-MODEL.md (e.g. "INV-EFF-03").
 */
export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function result(issues: ValidationIssue[]): ValidationResult {
  return { valid: issues.length === 0, issues };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

export function isIsoTimestamp(value: unknown): value is IsoTimestamp {
  return typeof value === "string" && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

export function isSha256(value: unknown): value is Sha256Hex {
  return typeof value === "string" && SHA256.test(value);
}

export function isSemver(value: unknown): value is string {
  return typeof value === "string" && SEMVER.test(value);
}

/**
 * Small accumulating checker used by every contract validator so that
 * structural rules are expressed once (DRY) and issues carry stable codes.
 */
export class Checker {
  readonly issues: ValidationIssue[] = [];

  constructor(private readonly root: Record<string, unknown>) {}

  fail(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }

  /** Assert a condition; records `code` when false. Returns the condition. */
  ensure(condition: boolean, code: string, path: string, message: string): boolean {
    if (!condition) this.fail(code, path, message);
    return condition;
  }

  get(path: string): unknown {
    return this.root[path];
  }

  has(key: string): boolean {
    return key in this.root;
  }

  /** The object under validation (for whole-object rules such as secret scanning). */
  value(): Record<string, unknown> {
    return this.root;
  }

  header(kind: ContractKind): void {
    this.ensure(this.root.kind === kind, "STRUCT", "kind", `kind must be "${kind}"`);
    this.ensure(isSemver(this.root.schema_version), "STRUCT", "schema_version", "schema_version must be semver");
    this.string("tenant_id");
  }

  string(key: string, opts: { optional?: boolean; nonEmpty?: boolean } = {}): string | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (typeof v !== "string" || (opts.nonEmpty !== false && v.length === 0)) {
      this.fail("STRUCT", key, "must be a non-empty string");
      return undefined;
    }
    return v;
  }

  id(key: string, kind: IdKind, opts: { optional?: boolean } = {}): string | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (!isValidId(kind, v)) {
      this.fail("STRUCT", key, `must be an id with prefix "${ID_PREFIX[kind]}"`);
      return undefined;
    }
    return v;
  }

  timestamp(key: string, opts: { optional?: boolean } = {}): string | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (!isIsoTimestamp(v)) {
      this.fail("STRUCT", key, "must be an ISO-8601 UTC timestamp");
      return undefined;
    }
    return v;
  }

  integer(key: string, min: number, opts: { optional?: boolean } = {}): number | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
      this.fail("STRUCT", key, `must be an integer >= ${min}`);
      return undefined;
    }
    return v;
  }

  boolean(key: string): boolean | undefined {
    const v = this.root[key];
    if (typeof v !== "boolean") {
      this.fail("STRUCT", key, "must be a boolean");
      return undefined;
    }
    return v;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], opts: { optional?: boolean } = {}): T | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
      this.fail("STRUCT", key, `must be one of: ${allowed.join(", ")}`);
      return undefined;
    }
    return v as T;
  }

  array(key: string, opts: { optional?: boolean; minLength?: number } = {}): unknown[] | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (!Array.isArray(v)) {
      this.fail("STRUCT", key, "must be an array");
      return undefined;
    }
    if (opts.minLength !== undefined && v.length < opts.minLength) {
      this.fail("STRUCT", key, `must contain at least ${opts.minLength} item(s)`);
    }
    return v;
  }

  stringArray(key: string, opts: { optional?: boolean; minLength?: number } = {}): string[] | undefined {
    const arr = this.array(key, opts);
    if (!arr) return undefined;
    if (!arr.every((x) => typeof x === "string" && x.length > 0)) {
      this.fail("STRUCT", key, "must contain only non-empty strings");
      return undefined;
    }
    return arr as string[];
  }

  record(key: string, opts: { optional?: boolean } = {}): Record<string, unknown> | undefined {
    const v = this.root[key];
    if (v === undefined && opts.optional) return undefined;
    if (!isRecord(v)) {
      this.fail("STRUCT", key, "must be an object");
      return undefined;
    }
    return v;
  }

  /** Validate a nested object with a child checker; nested issues are path-prefixed. */
  nested(key: string, fn: (c: Checker) => void, opts: { optional?: boolean } = {}): void {
    const obj = this.record(key, opts);
    if (!obj) return;
    const child = new Checker(obj);
    fn(child);
    for (const i of child.issues) this.issues.push({ ...i, path: `${key}.${i.path}` });
  }

  /** Validate each element of an object array with a child checker. */
  each(key: string, fn: (c: Checker, index: number) => void, opts: { optional?: boolean; minLength?: number } = {}): void {
    const arr = this.array(key, opts);
    if (!arr) return;
    arr.forEach((item, index) => {
      if (!isRecord(item)) {
        this.fail("STRUCT", `${key}[${index}]`, "must be an object");
        return;
      }
      const child = new Checker(item);
      fn(child, index);
      for (const i of child.issues) this.issues.push({ ...i, path: `${key}[${index}].${i.path}` });
    });
  }

  contentRef(key: string, opts: { optional?: boolean } = {}): void {
    this.nested(key, (c) => validateContentRefInto(c), opts);
  }

  executorRef(key: string, opts: { optional?: boolean } = {}): void {
    this.nested(
      key,
      (c) => {
        c.id("executor_id", "executor");
        c.string("executor_version");
      },
      opts,
    );
  }

  versionedRef(key: string, idKind: IdKind, opts: { optional?: boolean } = {}): void {
    this.nested(
      key,
      (c) => {
        c.id("id", idKind);
        c.integer("version", 1);
      },
      opts,
    );
  }

  result(): ValidationResult {
    return result(this.issues);
  }
}

export function validateContentRefInto(c: Checker): void {
  c.ensure(isSha256(c.get("sha256")), "STRUCT", "sha256", "must be a lowercase hex sha256");
  c.integer("size_bytes", 0, { optional: true });
  c.string("media_type", { optional: true });
  c.string("locator", { optional: true });
}

/** Run a validator body against unknown input, handling the non-object case once. */
export function validateWith(value: unknown, body: (c: Checker) => void): ValidationResult {
  if (!isRecord(value)) {
    return result([{ code: "STRUCT", path: "", message: "must be an object" }]);
  }
  const c = new Checker(value);
  body(c);
  return c.result();
}

// ---------------------------------------------------------------------------
// Canonical digest (ADR-V4-0006). EvolveLoop canonical JSON v1:
// object keys sorted lexicographically (UTF-16 code units), no whitespace,
// `undefined` members dropped, arrays keep order. NOT RFC 8785 (number
// canonicalisation is JSON.stringify's); producers must avoid non-integer floats
// in digested payloads or accept that cross-language verifiers may disagree.
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("canonicalJson: non-finite numbers are not representable");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Canonical(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Secret exclusion (constitution §4.3, §9.2). Heuristic defence-in-depth only:
// a clean scan is NOT proof of absence of secrets (documented limitation).
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERN = /(^|_|-)(password|passwd|secret|private_?key|api_?key|access_?token|refresh_?token|bearer|credential|session_?token|client_?secret)($|_|-)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

/** Keys that are explicitly allowed to look secret-ish because they hold references, not material. */
const SECRET_KEY_ALLOWLIST = new Set(["grant_ref", "grant_id", "secret_ref", "credential_ref", "key_id"]);

export interface SecretFinding {
  path: string;
  reason: "suspicious_key" | "suspicious_value";
}

export function scanForSecrets(value: unknown, path = ""): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((p) => p.test(value))) findings.push({ path, reason: "suspicious_value" });
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findings.push(...scanForSecrets(v, `${path}[${i}]`)));
    return findings;
  }
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      const childPath = path ? `${path}.${k}` : k;
      if (!SECRET_KEY_ALLOWLIST.has(k) && SECRET_KEY_PATTERN.test(k) && v !== null && v !== undefined && v !== "") {
        findings.push({ path: childPath, reason: "suspicious_key" });
      }
      findings.push(...scanForSecrets(v, childPath));
    }
  }
  return findings;
}

/** Generic transition check over a declarative table (used by every state machine). */
export function isAllowedTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): boolean {
  return (table[from] ?? []).includes(to);
}
