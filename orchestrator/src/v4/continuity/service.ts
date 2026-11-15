/**
 * CapsuleServicePort — seal / verify / accept (ADR-V4-0006, freeze R6).
 *
 * Protocol: verify the *raw* object (recursive INV-CAP-07) → allowlist-parse →
 * re-derive grants via PolicyDecisionPort (only narrows) → bind Work/Task from
 * the Event Ledger at base_checkpoint.event_seq (never from task_refs) →
 * consume store-side replay_id (R3).
 */

import {
  allowlistParseExecutionCapsule,
  CAPSULE_AUTHORITY_MODEL,
  CAPSULE_FORMAT_VERSION,
  computeCapsuleDigest,
  DEFAULT_TENANT_ID,
  EXECUTION_CAPSULE_SCHEMA_VERSION,
  isValidId,
  OPEN_EFFECT_STATES,
  result,
  validateExecutionCapsule,
  type CapsuleAcceptance,
  type CapsuleServicePort,
  type CheckpointStorePort,
  type EffectLedgerPort,
  type EffectState,
  type EventLedgerPort,
  type ExecutionCapsule,
  type IsoTimestamp,
  type PolicyDecisionPort,
  type ValidationResult,
} from "../contracts/index.js";
import { computeStateDigest, projectEvents } from "../ledger/index.js";
import { asCapsule, assertCapsuleSize, executorContextFromParsed, parseKnownFields } from "./context.js";
import { CapsuleVerifyFailed, CONTINUITY_ERROR, ContinuityError } from "./errors.js";
import { rederiveGrantRefs, refsOnly } from "./grants.js";
import { newCapsuleId, replayIdFor } from "./ids.js";
import type { ReplayStore } from "./replay-store.js";
import {
  CONTINUITY_ACTOR_ID,
  DEFAULT_NOT_PRESERVED,
  type BoundWorkState,
  type CapsuleServiceOptions,
} from "./types.js";

const OPEN = new Set<string>(OPEN_EFFECT_STATES);

function issue(code: string, path: string, message: string): ValidationResult {
  return result([{ code, path, message }]);
}

function mergeIssues(base: ValidationResult, extra: ValidationResult): ValidationResult {
  if (extra.valid) return base;
  return result([...base.issues, ...extra.issues]);
}

export class CapsuleService implements CapsuleServicePort {
  private lastBound: BoundWorkState | undefined;
  private lastContext: Record<string, unknown> | undefined;
  private readonly requireSignature: boolean;

  constructor(
    private readonly ledger: EventLedgerPort,
    private readonly checkpoints: CheckpointStorePort,
    private readonly effects: EffectLedgerPort,
    private readonly policy: PolicyDecisionPort,
    private readonly replay: ReplayStore,
    private readonly opts: CapsuleServiceOptions,
  ) {
    this.requireSignature = opts.require_signature ?? true;
  }

  lastBoundWorkState(): BoundWorkState | undefined {
    return this.lastBound;
  }

  lastExecutorContext(): Record<string, unknown> | undefined {
    return this.lastContext;
  }

  private now(): IsoTimestamp {
    return this.opts.now?.() ?? new Date().toISOString();
  }

  async seal(work_id: string, sealOpts: { base_checkpoint_id: string; for_executor?: string }): Promise<ExecutionCapsule> {
    if (!isValidId("work", work_id)) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "invalid work_id", { work_id });
    }
    if (!isValidId("checkpoint", sealOpts.base_checkpoint_id)) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "invalid checkpoint_id", {
        checkpoint_id: sealOpts.base_checkpoint_id,
      });
    }
    if (this.requireSignature && !this.opts.signer) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "V4.1 seal requires a signature handle");
    }

    const checkpoint = await this.checkpoints.get(sealOpts.base_checkpoint_id);
    if (!checkpoint || checkpoint.work_id !== work_id) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "checkpoint not found for work", {
        work_id,
        checkpoint_id: sealOpts.base_checkpoint_id,
      });
    }
    if (checkpoint.consistency !== "VERIFIED") {
      throw new ContinuityError(CONTINUITY_ERROR.CHECKPOINT_NOT_VERIFIED, "seal requires a VERIFIED checkpoint", {
        consistency: checkpoint.consistency,
      });
    }

    const events = await this.ledger.read(work_id, { to_seq: checkpoint.event_seq });
    const projection = projectEvents(work_id, events, checkpoint.event_seq);
    const digest = computeStateDigest(projection);
    if (digest !== checkpoint.state_digest) {
      throw new ContinuityError(CONTINUITY_ERROR.DIGEST_MISMATCH, "checkpoint state_digest does not match ledger", {
        expected: checkpoint.state_digest,
        actual: digest,
      });
    }

    const liveOpen = await this.effects.listOpen(work_id);
    const open_effects = projection.effect_summary
      .filter((e) => OPEN.has(e.state))
      .map((e) => ({ effect_id: e.effect_id, state: e.state }));
    const liveIds = new Set(liveOpen.map((e) => e.effect_id));
    const openFromLedger = open_effects.filter((e) => liveIds.has(e.effect_id) || liveOpen.length === 0);

    const now = this.now();
    const rawGrants = this.opts.grants
      ? await this.opts.grants.grantsFor({ work_id, for_executor: sealOpts.for_executor, now })
      : [];
    const plannedNotOpen = projection.effect_summary
      .filter((e) => !OPEN.has(e.state) && e.state !== "COMMITTED" && e.state !== "REJECTED" && e.state !== "NOT_EXECUTED" && e.state !== "COMPENSATED")
      .map((e) => `effect ${e.effect_id} state=${e.state} not in open_effects`);

    const body: Omit<ExecutionCapsule, "integrity"> = {
      kind: "ExecutionCapsule",
      schema_version: EXECUTION_CAPSULE_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      capsule_id: newCapsuleId(),
      capsule_format_version: CAPSULE_FORMAT_VERSION,
      authority_model: CAPSULE_AUTHORITY_MODEL,
      work_id,
      goal_contract_ref: checkpoint.goal_contract_ref,
      base_checkpoint: {
        checkpoint_id: checkpoint.checkpoint_id,
        event_seq: checkpoint.event_seq,
        state_digest: checkpoint.state_digest,
      },
      task_refs: projection.task_states.map((t) => ({ task_id: t.task_id, state: t.state })),
      decisions: [],
      artifacts: projection.artifact_refs.map((a) => ({
        sha256: a.sha256,
        ...(a.size_bytes !== undefined ? { size_bytes: a.size_bytes } : {}),
        ...(a.media_type !== undefined ? { media_type: a.media_type } : {}),
        ...(a.locator !== undefined ? { locator: a.locator } : {}),
      })),
      open_effects: liveOpen.length > 0 ? openFromLedger : open_effects,
      pending_items: [],
      constraints: [],
      delegable_grants: refsOnly(rawGrants),
      not_preserved: [...DEFAULT_NOT_PRESERVED, ...plannedNotOpen],
      compatibility: { min_conformance_level: "C2_CONTINUITY", required_capabilities: [] },
      created_at: now,
      created_by: { kind: "PLATFORM", id: this.opts.created_by_id ?? CONTINUITY_ACTOR_ID },
    };

    const pickedBody = allowlistParseExecutionCapsule(body);
    if (!pickedBody) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "allowlist-parse dropped the sealed body");
    }
    const digestBody = asCapsule(pickedBody);
    const manifest_sha256 = computeCapsuleDigest(digestBody);
    const integrity: ExecutionCapsule["integrity"] = {
      canonicalization: "evolveloop-canonical-json-v1",
      manifest_sha256,
    };
    if (this.opts.signer) {
      integrity.signature = {
        alg: "Ed25519",
        key_id: this.opts.signer.key_id,
        value_b64: this.opts.signer.sign(manifest_sha256),
      };
    }

    const sealedRaw = { ...digestBody, integrity };
    const sealed = allowlistParseExecutionCapsule(sealedRaw);
    if (!sealed) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "allowlist-parse dropped integrity");
    }
    assertCapsuleSize(sealed);
    const capsule = asCapsule(sealed);
    const check = validateExecutionCapsule(capsule, { now });
    if (!check.valid) {
      throw new ContinuityError(CONTINUITY_ERROR.SEAL_FAILED, "sealed capsule failed validateExecutionCapsule", {
        issues: check.issues,
      });
    }
    return capsule;
  }

  async verify(capsule: ExecutionCapsule, opts: { now: IsoTimestamp; trusted_key_ids: string[] }): Promise<ValidationResult> {
    const raw: unknown = capsule;
    try {
      assertCapsuleSize(raw);
    } catch (err) {
      if (err instanceof ContinuityError) {
        return issue("D09", "", err.message);
      }
      throw err;
    }

    // Raw object: recursive INV-CAP-07, digest, secrets, grant expiry, format major.
    const schema = validateExecutionCapsule(raw, { now: opts.now });
    const sig = this.verifySignature(raw, opts.trusted_key_ids);
    return mergeIssues(schema, sig);
  }

  private verifySignature(raw: unknown, trusted_key_ids: string[]): ValidationResult {
    const rec = raw as { integrity?: ExecutionCapsule["integrity"] };
    const signature = rec.integrity?.signature;
    if (!signature) {
      if (this.requireSignature) {
        return issue("INV-CAP-SIG", "integrity.signature", "V4.1 verify requires an Ed25519 signature");
      }
      return result([]);
    }
    if (signature.alg !== "Ed25519") {
      return issue("INV-CAP-SIG", "integrity.signature.alg", `unsupported signature alg ${String(signature.alg)}`);
    }
    if (!trusted_key_ids.includes(signature.key_id)) {
      return issue("INV-CAP-SIG", "integrity.signature.key_id", "signature key_id is not in trusted_key_ids");
    }
    const keys = this.opts.keys;
    if (!keys) {
      return issue("INV-CAP-SIG", "integrity.signature", "no key lookup configured");
    }
    const pub = keys.publicKey(signature.key_id);
    if (!pub) {
      return issue("INV-CAP-SIG", "integrity.signature.key_id", "unknown signature key_id");
    }
    const manifest = rec.integrity?.manifest_sha256;
    if (typeof manifest !== "string" || !keys.verify(pub, manifest, signature.value_b64)) {
      return issue("INV-CAP-SIG", "integrity.signature.value_b64", "signature verification failed");
    }
    return result([]);
  }

  async accept(capsule: ExecutionCapsule, ctx: { now: IsoTimestamp; policy_id: string }): Promise<CapsuleAcceptance> {
    const raw: unknown = capsule;
    const trusted = this.opts.trusted_key_ids ?? (this.opts.signer ? [this.opts.signer.key_id] : []);
    const verified = await this.verify(capsule, { now: ctx.now, trusted_key_ids: trusted });
    if (!verified.valid) {
      throw new CapsuleVerifyFailed(verified);
    }

    const parsed = parseKnownFields(raw);
    this.lastContext = executorContextFromParsed(parsed);
    const clean = asCapsule(parsed);

    await this.assertNotSuperseded(clean);
    const bound = await this.bindFromLedger(clean);
    this.lastBound = bound;

    const derived = await rederiveGrantRefs(this.policy, {
      work_id: clean.work_id,
      policy_id: ctx.policy_id,
      now: ctx.now,
      subject: this.opts.rederive_subject,
      environment: this.opts.environment ?? "handoff",
      risk: this.opts.risk ?? "low",
      capsule_grants: clean.delegable_grants ?? [],
    });

    const replay = await this.replay.consume({
      capsule_id: clean.capsule_id,
      work_id: clean.work_id,
      now: ctx.now,
    });

    await this.bindLease(clean, ctx.now);

    const acceptance: CapsuleAcceptance = {
      capsule_id: clean.capsule_id,
      accepted_at: ctx.now,
      authority_source: "POLICY_REDERIVED",
      work_state_source: "EVENT_LEDGER",
      effective_grant_refs: derived.effective_grant_refs,
      policy_ref: derived.policy_ref,
      base_checkpoint_id: clean.base_checkpoint.checkpoint_id,
      replay_id: replay.replay_id,
    };
    return acceptance;
  }

  private async assertNotSuperseded(capsule: ExecutionCapsule): Promise<void> {
    const latest = await this.checkpoints.latestConsistent(capsule.work_id);
    if (latest && latest.event_seq > capsule.base_checkpoint.event_seq) {
      throw new ContinuityError(CONTINUITY_ERROR.SUPERSEDED, "capsule checkpoint is behind latest VERIFIED checkpoint", {
        capsule_seq: capsule.base_checkpoint.event_seq,
        latest_seq: latest.event_seq,
      });
    }
    if (await this.replay.peek(capsule.capsule_id)) {
      throw new ContinuityError(CONTINUITY_ERROR.REPLAY_REUSED, "capsule already accepted", {
        capsule_id: capsule.capsule_id,
        replay_id: replayIdFor(capsule.capsule_id),
      });
    }
  }

  /**
   * INV-CAP-08: Work/Task state is the ledger projection at event_seq.
   * `task_refs` are ignored. Nothing is written to the ledger or Work State.
   */
  private async bindFromLedger(capsule: ExecutionCapsule): Promise<BoundWorkState> {
    const checkpoint = await this.checkpoints.get(capsule.base_checkpoint.checkpoint_id);
    if (!checkpoint || checkpoint.work_id !== capsule.work_id) {
      throw new ContinuityError(CONTINUITY_ERROR.CHECKPOINT_MISMATCH, "base_checkpoint not found", {
        checkpoint_id: capsule.base_checkpoint.checkpoint_id,
      });
    }
    if (checkpoint.consistency !== "VERIFIED") {
      throw new ContinuityError(CONTINUITY_ERROR.CHECKPOINT_NOT_VERIFIED, "accept requires VERIFIED checkpoint");
    }
    if (checkpoint.event_seq !== capsule.base_checkpoint.event_seq) {
      throw new ContinuityError(CONTINUITY_ERROR.CHECKPOINT_MISMATCH, "capsule event_seq does not match checkpoint");
    }

    const events = await this.ledger.read(capsule.work_id, { to_seq: capsule.base_checkpoint.event_seq });
    const projection = projectEvents(capsule.work_id, events, capsule.base_checkpoint.event_seq);
    const digest = computeStateDigest(projection);
    if (digest !== checkpoint.state_digest || digest !== capsule.base_checkpoint.state_digest) {
      throw new ContinuityError(CONTINUITY_ERROR.DIGEST_MISMATCH, "ledger digest mismatch at accept bind", {
        ledger: digest,
        checkpoint: checkpoint.state_digest,
        capsule: capsule.base_checkpoint.state_digest,
      });
    }

    return {
      source: "EVENT_LEDGER",
      work_id: capsule.work_id,
      event_seq: capsule.base_checkpoint.event_seq,
      state_digest: digest,
      work_state: projection.work_state,
      tasks: projection.task_states.map((t) => ({ task_id: t.task_id, state: t.state })),
      open_effects: projection.effect_summary
        .filter((e) => OPEN.has(e.state))
        .map((e) => ({ effect_id: e.effect_id, state: e.state as EffectState })),
    };
  }

  private async bindLease(capsule: ExecutionCapsule, now: IsoTimestamp): Promise<void> {
    if (this.opts.lease_required && !this.opts.lease) {
      throw new ContinuityError(CONTINUITY_ERROR.LEASE_REQUIRED, "accept requires M13 lease/epoch bind; port not configured");
    }
    if (!this.opts.lease) return;
    await this.opts.lease.bind({
      work_id: capsule.work_id,
      capsule_id: capsule.capsule_id,
      checkpoint_id: capsule.base_checkpoint.checkpoint_id,
      event_seq: capsule.base_checkpoint.event_seq,
      now,
    });
  }
}
