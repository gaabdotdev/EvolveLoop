/**
 * Execution Capsule v1 — portable, verifiable state for another executor to continue
 * (constitution §4.3; ADR-V4-0006). Producer: M04. Consumers: executors (C2+), M05 forks.
 *
 * A capsule carries REFERENCES (content hashes) plus the minimum operational context.
 * Capsule ≠ grant (INV-CAP-07, TM-V4-F01): it never carries authority. Effective permissions
 * are re-derived by Policy at accept time and can only narrow. Work/Task state is never
 * written from capsule snapshots (INV-CAP-08). Executor-authored text is UNTRUSTED_DATA
 * (INV-CAP-09, TM-V4-F12). No permanent secrets (INV-CAP-02).
 */

import {
  type ContractHeader,
  type ContentRef,
  type IsoTimestamp,
  type ActorRef,
  isRecord,
  isSemver,
  isSha256,
  scanForSecrets,
  sha256Canonical,
  validateWith,
  type ValidationResult,
} from "./common.js";
import { EFFECT_STATES, OPEN_EFFECT_STATES, type EffectState } from "./effect.js";
import { CONFORMANCE_LEVELS, type ConformanceLevel } from "./executor.js";
import { FORBIDDEN_CAPSULE_AUTHORITY_FIELDS, rejectForbiddenFields } from "./field-class.js";

/** Capsule is not a grant: authority is always re-derived at accept (ADR-V4-0006, TM-V4-F01). */
export const CAPSULE_AUTHORITY_MODEL = "POLICY_REDERIVED_AT_ACCEPT" as const;
export type CapsuleAuthorityModel = typeof CAPSULE_AUTHORITY_MODEL;

export const EXECUTION_CAPSULE_SCHEMA_VERSION = "1.0.0";
/** Capsule *format* version; compatibility = same major (ADR-V4-0006). */
export const CAPSULE_FORMAT_VERSION = "1.0.0";

export interface DelegableGrantRef {
  grant_ref: string;
  scope: string[];
  expires_at: IsoTimestamp;
}

export interface ExecutionCapsule extends ContractHeader<"ExecutionCapsule"> {
  capsule_id: string;
  capsule_format_version: string;
  /** Constant. Receivers MUST re-derive authority from current policy; they MUST NOT copy grants. */
  authority_model: CapsuleAuthorityModel;
  work_id: string;
  source_execution_id?: string;
  goal_contract_ref: { id: string; version: number };
  base_checkpoint: { checkpoint_id: string; event_seq: number; state_digest: string };
  /**
   * Orientation snapshots only (INV-CAP-08). Work/Task state is read from the Event Ledger
   * at `base_checkpoint.event_seq`. Implementations MUST NOT write these values into Work State.
   */
  task_refs: { task_id: string; state: string }[];
  decisions: { decision_ref: string; summary: string }[];
  artifacts: ContentRef[];
  /** Every non-final effect; the receiver must reconcile these before acting (INV-CAP-04). */
  open_effects: { effect_id: string; state: EffectState }[];
  pending_items: string[];
  constraints: string[];
  /** Grant *references* only — never grant material, tokens, or permission sets (INV-CAP-07). */
  delegable_grants: DelegableGrantRef[];
  /** Explicit list of what was NOT preserved or cannot transfer (constitution §4.3). */
  not_preserved: string[];
  compatibility: { min_conformance_level: ConformanceLevel; required_capabilities: string[] };
  created_at: IsoTimestamp;
  created_by: ActorRef;
  integrity: {
    canonicalization: "evolveloop-canonical-json-v1";
    manifest_sha256: string;
    signature?: { alg: "Ed25519"; key_id: string; value_b64: string };
  };
}

/**
 * Allowlist of ExecutionCapsule fields that `seal` / `accept` MAY persist or forward.
 * Unknown keys are dropped — they are never executor context, grants, or Work State
 * (INV-CAP-07, TM-V4-F01). Nested objects are picked the same way.
 *
 * ADR-V4-0001 "ignore unknown optional fields" means same-major *readability*,
 * not forwarding. Capsules are a trust boundary: ignore ≠ grant.
 */
type AllowlistSpec = true | CapsuleAllowlistShape | readonly [CapsuleAllowlistShape];
type CapsuleAllowlistShape = { readonly [k: string]: AllowlistSpec };

const EXECUTION_CAPSULE_ALLOWLIST: CapsuleAllowlistShape = {
  kind: true,
  schema_version: true,
  tenant_id: true,
  capsule_id: true,
  capsule_format_version: true,
  authority_model: true,
  work_id: true,
  source_execution_id: true,
  goal_contract_ref: { id: true, version: true },
  base_checkpoint: { checkpoint_id: true, event_seq: true, state_digest: true },
  task_refs: [{ task_id: true, state: true }],
  decisions: [{ decision_ref: true, summary: true }],
  artifacts: [{ sha256: true, size_bytes: true, media_type: true, locator: true }],
  open_effects: [{ effect_id: true, state: true }],
  pending_items: true,
  constraints: true,
  delegable_grants: [{ grant_ref: true, scope: true, expires_at: true }],
  not_preserved: true,
  compatibility: { min_conformance_level: true, required_capabilities: true },
  created_at: true,
  created_by: { kind: true, id: true },
  integrity: {
    canonicalization: true,
    manifest_sha256: true,
    signature: { alg: true, key_id: true, value_b64: true },
  },
};

function pickAllowlisted(value: unknown, spec: CapsuleAllowlistShape): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, childSpec] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const child = value[key];
    if (childSpec === true) {
      out[key] = child;
    } else if (Array.isArray(childSpec)) {
      out[key] = Array.isArray(child)
        ? child.map((item) => (isRecord(item) ? pickAllowlisted(item, childSpec[0]) : item))
        : child;
    } else if (isRecord(child)) {
      out[key] = pickAllowlisted(child, childSpec);
    } else {
      out[key] = child;
    }
  }
  return out;
}

/**
 * Drop unknown keys (any depth) so they cannot be forwarded as authority or control.
 * Callers MUST run this on any capsule object that leaves the Control Plane toward
 * an executor. Validation still runs on the raw object so nested forbidden names fail.
 */
export function allowlistParseExecutionCapsule(raw: unknown): Record<string, unknown> | undefined {
  return pickAllowlisted(raw, EXECUTION_CAPSULE_ALLOWLIST);
}

/** Digest over every field except `integrity` (INV-CAP-01). */
export function computeCapsuleDigest(capsule: Omit<ExecutionCapsule, "integrity"> | ExecutionCapsule): string {
  const { integrity: _ignored, ...body } = capsule as ExecutionCapsule;
  void _ignored;
  return sha256Canonical(body);
}

/** Major-version compatibility of capsule formats (INV-CAP-05). */
export function isCapsuleFormatCompatible(capsuleFormat: string, readerFormat: string = CAPSULE_FORMAT_VERSION): boolean {
  if (!isSemver(capsuleFormat) || !isSemver(readerFormat)) return false;
  return capsuleFormat.split(".")[0] === readerFormat.split(".")[0];
}

export function validateExecutionCapsule(value: unknown, opts: { now?: IsoTimestamp } = {}): ValidationResult {
  return validateWith(value, (c) => {
    c.header("ExecutionCapsule");
    c.id("capsule_id", "capsule");
    c.ensure(
      c.get("authority_model") === CAPSULE_AUTHORITY_MODEL,
      "INV-CAP-07",
      "authority_model",
      `authority_model must be "${CAPSULE_AUTHORITY_MODEL}" (capsule is not a grant)`,
    );
    const fmt = c.string("capsule_format_version");
    if (fmt !== undefined) {
      c.ensure(isCapsuleFormatCompatible(fmt), "INV-CAP-05", "capsule_format_version", `incompatible capsule format ${fmt}`);
    }
    c.id("work_id", "work");
    c.id("source_execution_id", "execution", { optional: true });
    c.versionedRef("goal_contract_ref", "goal_contract");
    c.nested("base_checkpoint", (cc) => {
      cc.id("checkpoint_id", "checkpoint");
      cc.integer("event_seq", 1);
      cc.ensure(isSha256(cc.get("state_digest")), "STRUCT", "state_digest", "must be sha256");
    });
    c.each("task_refs", (cc) => {
      cc.id("task_id", "task");
      cc.string("state");
    });
    c.each("decisions", (cc) => {
      cc.string("decision_ref");
      cc.string("summary");
    });
    c.each("artifacts", (cc) => {
      cc.ensure(isSha256(cc.get("sha256")), "INV-CAP-01", "sha256", "artifact refs must be content-addressed");
    });
    c.each("open_effects", (cc) => {
      cc.id("effect_id", "effect");
      const st = cc.oneOf("state", EFFECT_STATES);
      if (st) cc.ensure((OPEN_EFFECT_STATES as readonly string[]).includes(st), "INV-CAP-04", "state", "open_effects may only list open states");
    });
    c.stringArray("pending_items");
    c.stringArray("constraints");
    c.each("delegable_grants", (cc) => {
      cc.string("grant_ref");
      cc.stringArray("scope", { minLength: 1 });
      const exp = cc.timestamp("expires_at");
      if (exp && opts.now) cc.ensure(Date.parse(exp) > Date.parse(opts.now), "INV-CAP-06", "expires_at", "delegable grant already expired");
    });
    c.ensure(Array.isArray(c.get("not_preserved")), "INV-CAP-03", "not_preserved", "not_preserved must be declared (may be empty)");
    c.nested("compatibility", (cc) => {
      cc.oneOf("min_conformance_level", CONFORMANCE_LEVELS);
      cc.stringArray("required_capabilities");
    });
    c.timestamp("created_at");
    c.nested("created_by", (cc) => {
      cc.string("kind");
      cc.string("id");
    });
    c.nested("integrity", (cc) => {
      cc.ensure(cc.get("canonicalization") === "evolveloop-canonical-json-v1", "STRUCT", "canonicalization", "unsupported canonicalization");
      cc.ensure(isSha256(cc.get("manifest_sha256")), "STRUCT", "manifest_sha256", "must be sha256");
    });

    const integrity = c.get("integrity") as ExecutionCapsule["integrity"] | undefined;
    if (integrity && isSha256(integrity.manifest_sha256)) {
      let digest: string | null = null;
      try {
        digest = computeCapsuleDigest(c.value() as unknown as ExecutionCapsule);
      } catch {
        digest = null;
      }
      c.ensure(digest === integrity.manifest_sha256, "INV-CAP-01", "integrity.manifest_sha256", "manifest digest mismatch (tampered or non-canonical)");
    }
    for (const f of scanForSecrets(c.value())) {
      c.fail("INV-CAP-02", f.path, `possible secret material (${f.reason}); capsules carry grant references only`);
    }
    rejectForbiddenFields(
      c,
      FORBIDDEN_CAPSULE_AUTHORITY_FIELDS,
      "INV-CAP-07",
      (field) => `forbidden authority field "${field}": capsule is not a grant and does not carry control instructions (TM-V4-F01/F12)`,
    );
  });
}

/**
 * Result of accepting a verified capsule (M04 + M10). Authority is always re-derived;
 * Work State is always read from the ledger. `effective_grant_refs` ⊆ current policy
 * AND ⊆ `capsule.delegable_grants` (can only narrow).
 */
export interface CapsuleAcceptance {
  capsule_id: string;
  accepted_at: IsoTimestamp;
  authority_source: "POLICY_REDERIVED";
  work_state_source: "EVENT_LEDGER";
  effective_grant_refs: string[];
  policy_ref: { policy_id: string; version: number; epoch: number };
  base_checkpoint_id: string;
  /** Expiry / anti-replay / single-use token consumed at accept (M04). */
  replay_id: string;
}
