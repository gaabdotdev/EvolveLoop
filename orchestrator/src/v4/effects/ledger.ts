/**
 * M03 Effect Ledger — at-most-once *dispatch decisions* per effect_id.
 *
 * No exactly-once claim (constitution §4.4 / §14, ADR-V4-0008). Crash between
 * write-ahead DISPATCHED and observation yields DISPATCHED or UNKNOWN, never
 * silence; `decideRetry` then forbids blind redispatch.
 */

import { randomBytes } from "node:crypto";
import { DEFAULT_TENANT_ID, isValidId, type ActorRef, type IsoTimestamp } from "../contracts/common.js";
import {
  canTransitionEffect,
  decideRetry,
  EFFECT_RECORD_SCHEMA_VERSION,
  EFFECT_STATES_REQUIRING_EVIDENCE,
  OPEN_EFFECT_STATES,
  validateEffectRecord,
  type EffectRecord,
  type EffectState,
  type ReconciliationAttempt,
  type RetryDecision,
} from "../contracts/effect.js";
import { validateEvidence, type Evidence } from "../contracts/evidence.js";
import type { EffectLedgerPort } from "../contracts/ports.js";
import { resolveCpSideEvidence, throwEvidenceFailure } from "./evidence-gate.js";
import { EFFECT_ERROR, EffectLedgerError } from "./errors.js";
import { appendEffectEvent } from "./events.js";
import {
  assertSafeEffectId,
  assertSafeEvidenceId,
  assertSafeWorkId,
  createPersistence,
  idempotencySlot,
  type EffectPersistence,
  type IdempotencyIndexEntry,
} from "./store.js";
import {
  AUDIT_INTEGRITY_CLAIM,
  type Clock,
  type EffectAuditEntry,
  type EffectDomainEvent,
  type EffectFence,
  type EffectLedgerOptions,
} from "./types.js";

const OPEN = new Set<string>(OPEN_EFFECT_STATES);
const REQUIRES_EVIDENCE = new Set<string>(EFFECT_STATES_REQUIRING_EVIDENCE);

function defaultClock(): IsoTimestamp {
  return new Date().toISOString();
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function isOpen(state: EffectState): boolean {
  return OPEN.has(state);
}

function unknownWouldViolateInvEff04(effect: Pick<EffectRecord, "effect_class" | "integration">): boolean {
  if (effect.effect_class !== "EXTERNAL") return false;
  const caps = effect.integration.capabilities;
  return !caps.supports_idempotency_key && !caps.supports_status_query;
}

export class EffectLedger implements EffectLedgerPort {
  private readonly persist: EffectPersistence;
  private readonly clock: Clock;
  private readonly actor: ActorRef;
  private readonly opts: EffectLedgerOptions;
  private readonly chains = new Map<string, Promise<void>>();
  private readonly journal: EffectDomainEvent[] = [];
  /** Exact-key index; rebuilt from records so a crash cannot drop in-flight keys (F06). */
  private readonly bySlot = new Map<string, IdempotencyIndexEntry>();
  /** One PolicyDecision / approval → one effect (F04 linkage). Not a path component (R5). */
  private readonly byDecision = new Map<string, string>();
  private readonly byApproval = new Map<string, string>();

  constructor(opts: EffectLedgerOptions = {}) {
    this.opts = opts;
    this.persist = createPersistence(opts.rootDir);
    this.clock = opts.clock ?? defaultClock;
    this.actor = opts.actor ?? { kind: "PLATFORM", id: "control-plane" };
    this.rebuildIndexes();
  }

  /** Restart: reload durable records. COMMITTED stays COMMITTED (D19). */
  recoverFromDisk(): void {
    this.rebuildIndexes();
  }

  domainEvents(): readonly EffectDomainEvent[] {
    return this.journal;
  }

  auditTrail(effect_id: string): EffectAuditEntry[] {
    assertSafeEffectId(effect_id);
    return this.persist.readAudit(effect_id);
  }

  async registerEvidence(evidence: Evidence): Promise<Evidence> {
    assertSafeEvidenceId(evidence.evidence_id);
    const res = validateEvidence(evidence);
    if (!res.valid) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "evidence failed validateEvidence", { issues: res.issues });
    }
    this.persist.saveEvidence(evidence);
    return evidence;
  }

  async plan(
    effect: Omit<EffectRecord, "state" | "evidence_ids" | "reconciliation" | "created_at" | "updated_at">,
  ): Promise<EffectRecord> {
    assertSafeEffectId(effect.effect_id);
    assertSafeWorkId(effect.work_id);
    if (!isValidId("task", effect.task_id)) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "task_id failed isValidId", { task_id: effect.task_id });
    }
    if (!isValidId("execution", effect.execution_id)) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "execution_id failed isValidId", { execution_id: effect.execution_id });
    }
    const slotKey = effect.idempotency_key
      ? idempotencySlot(effect.integration.integration_id, effect.idempotency_key)
      : undefined;
    return this.withLocks(this.lockKeys(effect.effect_id, slotKey), async () => {
      if (this.persist.load(effect.effect_id)) {
        throw new EffectLedgerError(EFFECT_ERROR.CONFLICT, "effect_id already exists", { effect_id: effect.effect_id });
      }
      if (effect.idempotency_key !== undefined) {
        this.assertIdempotencyAvailable(effect, slotKey!);
      }
      this.assertAuthorizationUnused(effect.authorization, effect.effect_id);
      const now = this.clock();
      const record: EffectRecord = {
        ...effect,
        kind: "EffectRecord",
        schema_version: effect.schema_version ?? EFFECT_RECORD_SCHEMA_VERSION,
        tenant_id: effect.tenant_id ?? DEFAULT_TENANT_ID,
        state: "PLANNED",
        evidence_ids: [],
        reconciliation: [],
        created_at: now,
        updated_at: now,
      };
      this.persistValidated(record);
      this.indexRecord(record);
      this.writeAudit(record, null, "planned");
      await this.emitPlanned(record);
      return structuredClone(record);
    });
  }

  /**
   * Attach a PolicyDecision and move PLANNED → AUTHORIZED (INV-EFF-02).
   * `transition` cannot set authorization; this is the M03 write path.
   */
  async authorize(
    effect_id: string,
    authorization: NonNullable<EffectRecord["authorization"]>,
    opts: { expected_state: EffectState },
  ): Promise<EffectRecord> {
    return this.withLocks(this.lockKeys(effect_id), async () => {
      const current = this.require(effect_id);
      if (current.state !== opts.expected_state) {
        throw new EffectLedgerError(EFFECT_ERROR.CONFLICT, "expected_state mismatch", {
          expected: opts.expected_state,
          actual: current.state,
        });
      }
      this.assertAuthorizationUnused(authorization, effect_id);
      const next: EffectRecord = {
        ...current,
        authorization,
        state: "AUTHORIZED",
        updated_at: this.clock(),
      };
      if (!canTransitionEffect(current.state, "AUTHORIZED")) {
        throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, `illegal transition ${current.state} → AUTHORIZED`);
      }
      this.persistValidated(next);
      this.indexRecord(next);
      this.writeAudit(next, current.state, "authorized");
      await this.emitStateChanged(current, next);
      return structuredClone(next);
    });
  }

  async transition(
    effect_id: string,
    to: EffectState,
    evidence_ids: string[],
    opts: { expected_state: EffectState; fence?: EffectFence; observed_result?: string },
  ): Promise<EffectRecord> {
    const currentPeek = this.require(effect_id);
    const slotKey = currentPeek.idempotency_key
      ? idempotencySlot(currentPeek.integration.integration_id, currentPeek.idempotency_key)
      : undefined;
    return this.withLocks(this.lockKeys(effect_id, slotKey), async () => {
      const current = this.require(effect_id);
      if (current.state !== opts.expected_state) {
        throw new EffectLedgerError(EFFECT_ERROR.CONFLICT, "expected_state mismatch", {
          expected: opts.expected_state,
          actual: current.state,
        });
      }
      if (!canTransitionEffect(current.state, to)) {
        throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, `illegal transition ${current.state} → ${to}`, {
          from: current.state,
          to,
        });
      }
      if (to === "UNKNOWN" && unknownWouldViolateInvEff04(current)) {
        throw new EffectLedgerError(
          EFFECT_ERROR.FORBIDDEN,
          "INV-EFF-04: cannot persist UNKNOWN for EXTERNAL effect without idempotency or status query; remain DISPATCHED — retryDecision is ESCALATE",
          { effect_id, to },
        );
      }
      if (to === "DISPATCHED") {
        this.assertDispatchAllowed(current);
        await this.assertFence(current, opts.fence);
      }
      const mergedEvidence = uniqueIds([...current.evidence_ids, ...evidence_ids]);
      if (REQUIRES_EVIDENCE.has(to)) {
        const verdict = await resolveCpSideEvidence(mergedEvidence, current, {
          get: (id) => Promise.resolve(this.persist.loadEvidence(id)),
          put: async (e) => {
            this.persist.saveEvidence(e);
          },
        });
        if (!verdict.ok) throwEvidenceFailure(verdict);
      }
      if (to === "COMPENSATED" && !current.compensation?.compensating_effect_id) {
        throw new EffectLedgerError(
          EFFECT_ERROR.INVALID,
          "COMPENSATED requires compensation.compensating_effect_id (INV-EFF-05)",
        );
      }
      const next: EffectRecord = {
        ...current,
        state: to,
        evidence_ids: mergedEvidence,
        updated_at: this.clock(),
      };
      this.persistValidated(next);
      this.indexRecord(next);
      this.writeAudit(next, current.state, opts.observed_result ?? `transition:${to}`, opts.fence?.fencing_epoch);
      await this.emitStateChanged(current, next);
      this.emitMeasurement(next);
      return structuredClone(next);
    });
  }

  /**
   * Write-ahead DISPATCHED (ADR-V4-0008 rule 1). The record is durable *before*
   * this promise resolves; the caller may then send the external request.
   * A crash after resolve and before observe leaves DISPATCHED, which
   * `decideRetry` treats like UNKNOWN — never DISPATCH_ALLOWED.
   */
  async beginDispatch(effect_id: string, fence?: EffectFence): Promise<EffectRecord> {
    const current = this.require(effect_id);
    const decision = decideRetry(current);
    if (decision.action !== "DISPATCH_ALLOWED") {
      throw new EffectLedgerError(EFFECT_ERROR.BLIND_RETRY_BLOCKED, `beginDispatch refused: ${decision.action}`, {
        ...decision,
        state: current.state,
      });
    }
    return this.transition(effect_id, "DISPATCHED", [], { expected_state: "AUTHORIZED", fence });
  }

  /**
   * Same-key replay for UNKNOWN/DISPATCHED when the target deduplicates.
   * Does not create a new effect_id and does not move state to a fresh DISPATCHED.
   */
  async replayWithSameIdempotencyKey(effect_id: string): Promise<{ record: EffectRecord; idempotency_key: string }> {
    const record = this.require(effect_id);
    const decision = decideRetry(record);
    if (decision.action !== "RETRY_WITH_SAME_IDEMPOTENCY_KEY" || !record.idempotency_key) {
      throw new EffectLedgerError(EFFECT_ERROR.BLIND_RETRY_BLOCKED, `replay refused: ${decision.action}`, {
        ...decision,
        state: record.state,
      });
    }
    return { record: structuredClone(record), idempotency_key: record.idempotency_key };
  }

  /** Crash/restart: DISPATCHED → UNKNOWN when schema-legal; otherwise leave DISPATCHED (INV-EFF-04). */
  async recoverUncertainDispatches(work_id?: string): Promise<EffectRecord[]> {
    const changed: EffectRecord[] = [];
    for (const row of this.persist.loadAll()) {
      if (work_id && row.work_id !== work_id) continue;
      if (row.state !== "DISPATCHED") continue;
      if (unknownWouldViolateInvEff04(row)) continue;
      const next = await this.transition(row.effect_id, "UNKNOWN", [], {
        expected_state: "DISPATCHED",
        observed_result: "crash_or_restart_before_observation",
      });
      changed.push(next);
    }
    return changed;
  }

  async recordReconciliation(effect_id: string, attempt: ReconciliationAttempt): Promise<EffectRecord> {
    const currentPeek = this.require(effect_id);
    const slotKey = currentPeek.idempotency_key
      ? idempotencySlot(currentPeek.integration.integration_id, currentPeek.idempotency_key)
      : undefined;
    return this.withLocks(this.lockKeys(effect_id, slotKey), async () => {
      const current = this.require(effect_id);
      const nextState = this.stateFromReconciliation(current, attempt.outcome);
      const mergedEvidence = uniqueIds([...current.evidence_ids, ...attempt.evidence_ids]);
      if (nextState && REQUIRES_EVIDENCE.has(nextState)) {
        const verdict = await resolveCpSideEvidence(mergedEvidence, current, {
          get: (id) => Promise.resolve(this.persist.loadEvidence(id)),
          put: async (e) => {
            this.persist.saveEvidence(e);
          },
        });
        if (!verdict.ok) throwEvidenceFailure(verdict);
      }
      if (nextState && !canTransitionEffect(current.state, nextState)) {
        throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, `illegal reconciliation transition ${current.state} → ${nextState}`);
      }
      if (nextState === "UNKNOWN" && unknownWouldViolateInvEff04(current)) {
        throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, "INV-EFF-04 blocks persisting UNKNOWN");
      }
      const next: EffectRecord = {
        ...current,
        state: nextState ?? current.state,
        evidence_ids: mergedEvidence,
        reconciliation: [...current.reconciliation, attempt],
        updated_at: this.clock(),
      };
      this.persistValidated(next);
      this.indexRecord(next);
      this.writeAudit(next, current.state, `reconciliation:${attempt.outcome}`);
      await appendEffectEvent(
        this.opts.events,
        this.journal,
        {
          type: "effect.reconciliation_attempted",
          work_id: next.work_id,
          occurred_at: next.updated_at,
          payload: {
            effect_id: next.effect_id,
            method: attempt.method,
            outcome: attempt.outcome,
            observed: attempt.observed,
            evidence_ids: attempt.evidence_ids,
          },
        },
        this.actor,
        () => this.newEventId(),
      );
      if (nextState && nextState !== current.state) {
        await this.emitStateChanged(current, next);
      }
      this.emitMeasurement(next);
      return structuredClone(next);
    });
  }

  async compensate(
    effect_id: string,
    compensating_effect_id: string,
    evidence_ids: string[],
    opts: { expected_state: EffectState },
  ): Promise<EffectRecord> {
    if (compensating_effect_id === effect_id) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "an effect cannot compensate itself (INV-EFF-05)");
    }
    if (!isValidId("effect", compensating_effect_id)) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "compensating_effect_id failed isValidId");
    }
    return this.withLocks(this.lockKeys(effect_id), async () => {
      const current = this.require(effect_id);
      if (current.state !== opts.expected_state) {
        throw new EffectLedgerError(EFFECT_ERROR.CONFLICT, "expected_state mismatch", {
          expected: opts.expected_state,
          actual: current.state,
        });
      }
      if (!canTransitionEffect(current.state, "COMPENSATED")) {
        throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, `illegal transition ${current.state} → COMPENSATED`);
      }
      const mergedEvidence = uniqueIds([...current.evidence_ids, ...evidence_ids]);
      const verdict = await resolveCpSideEvidence(mergedEvidence, current, {
        get: (id) => Promise.resolve(this.persist.loadEvidence(id)),
        put: async (e) => {
          this.persist.saveEvidence(e);
        },
      });
      if (!verdict.ok) throwEvidenceFailure(verdict);
      const next: EffectRecord = {
        ...current,
        compensation: { ...(current.compensation ?? {}), compensating_effect_id },
        state: "COMPENSATED",
        evidence_ids: mergedEvidence,
        updated_at: this.clock(),
      };
      this.persistValidated(next);
      this.indexRecord(next);
      this.writeAudit(next, current.state, "compensated");
      await this.emitStateChanged(current, next);
      return structuredClone(next);
    });
  }

  /**
   * Fork/replay (D08, ADR-V4-0007): new record on the fork work, `fork_inherited=true`.
   * Original is not mutated. EXTERNAL inherited effects are FORBIDDEN to re-dispatch.
   */
  async cloneAsInherited(
    source_effect_id: string,
    fork: { work_id: string; effect_id: string; execution_id: string },
  ): Promise<EffectRecord> {
    const source = this.require(source_effect_id);
    assertSafeWorkId(fork.work_id);
    assertSafeEffectId(fork.effect_id);
    const now = this.clock();
    const cloned: EffectRecord = {
      ...source,
      effect_id: fork.effect_id,
      work_id: fork.work_id,
      execution_id: fork.execution_id,
      fork_inherited: true,
      created_at: now,
      updated_at: now,
      reconciliation: [...source.reconciliation],
      evidence_ids: [...source.evidence_ids],
    };
    return this.withLocks(this.lockKeys(fork.effect_id), async () => {
      if (this.persist.load(fork.effect_id)) {
        throw new EffectLedgerError(EFFECT_ERROR.CONFLICT, "fork effect_id already exists");
      }
      this.persistValidated(cloned);
      this.indexRecord(cloned);
      this.writeAudit(cloned, null, "fork_inherited");
      return structuredClone(cloned);
    });
  }

  async get(effect_id: string): Promise<EffectRecord | undefined> {
    if (!isValidId("effect", effect_id)) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "effect_id failed isValidId", { effect_id });
    }
    const row = this.persist.load(effect_id);
    return row ? structuredClone(row) : undefined;
  }

  async listOpen(work_id: string): Promise<EffectRecord[]> {
    assertSafeWorkId(work_id);
    return this.persist
      .loadAll()
      .filter((e) => e.work_id === work_id && isOpen(e.state))
      .map((e) => structuredClone(e));
  }

  async retryDecision(effect_id: string): Promise<RetryDecision> {
    const record = this.require(effect_id);
    return decideRetry(record);
  }

  private require(effect_id: string): EffectRecord {
    assertSafeEffectId(effect_id);
    const row = this.persist.load(effect_id);
    if (!row) throw new EffectLedgerError(EFFECT_ERROR.NOT_FOUND, "effect not found", { effect_id });
    return row;
  }

  private persistValidated(record: EffectRecord): void {
    const res = validateEffectRecord(record);
    if (!res.valid) {
      throw new EffectLedgerError(EFFECT_ERROR.INVALID, "validateEffectRecord failed", { issues: res.issues });
    }
    this.persist.save(record);
  }

  private assertDispatchAllowed(current: EffectRecord): void {
    if (current.fork_inherited && current.effect_class === "EXTERNAL") {
      throw new EffectLedgerError(EFFECT_ERROR.FORBIDDEN, "fork_inherited EXTERNAL must not dispatch (D08)");
    }
    const decision = decideRetry({ ...current, state: current.state === "AUTHORIZED" ? "AUTHORIZED" : current.state });
    if (current.state === "AUTHORIZED") {
      if (decision.action !== "DISPATCH_ALLOWED") {
        throw new EffectLedgerError(EFFECT_ERROR.BLIND_RETRY_BLOCKED, `dispatch refused: ${decision.action}`, {
          ...decision,
        });
      }
      return;
    }
    if (current.state === "DISPATCHED" || current.state === "UNKNOWN") {
      throw new EffectLedgerError(
        EFFECT_ERROR.BLIND_RETRY_BLOCKED,
        "UNKNOWN/DISPATCHED cannot take a fresh DISPATCHED transition; use replayWithSameIdempotencyKey or reconcile",
        { state: current.state, decision },
      );
    }
  }

  private async assertFence(current: EffectRecord, explicit?: EffectFence): Promise<void> {
    if (current.effect_class !== "EXTERNAL") return;
    const provided = explicit ?? (await this.opts.fence?.({ work_id: current.work_id, effect_id: current.effect_id }));
    if (!provided) {
      throw new EffectLedgerError(
        EFFECT_ERROR.FENCE_REQUIRED,
        "EXTERNAL DISPATCHED requires a fencing check (F05); no unclassifiable external effect",
      );
    }
    try {
      await provided.assertFresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new EffectLedgerError(EFFECT_ERROR.FENCED, `fencing rejected dispatch: ${message}`, {
        work_id: current.work_id,
        fencing_epoch: provided.fencing_epoch,
      });
    }
  }

  private assertIdempotencyAvailable(
    effect: Pick<EffectRecord, "effect_id" | "work_id" | "intent" | "idempotency_key" | "integration">,
    slotKey: string,
  ): void {
    const existing = this.bySlot.get(slotKey);
    if (!existing) return;
    const occupant = this.persist.load(existing.effect_id);
    if (!occupant) {
      this.bySlot.delete(slotKey);
      return;
    }
    const sameIntent = occupant.intent.parameters_digest === effect.intent.parameters_digest;
    if (occupant.effect_id === effect.effect_id && sameIntent) return;
    if (isOpen(occupant.state) || occupant.state === "AUTHORIZED" || occupant.state === "PLANNED") {
      throw new EffectLedgerError(
        EFFECT_ERROR.IDEMPOTENCY_IN_FLIGHT,
        "at most one in-flight attempt per exact idempotency key (F06)",
        { key: effect.idempotency_key, occupant: occupant.effect_id, occupant_state: occupant.state },
      );
    }
    if (sameIntent) {
      throw new EffectLedgerError(
        EFFECT_ERROR.IDEMPOTENCY_CONFLICT,
        "idempotency key already used by a terminal effect with the same intent; reuse that effect_id (dedup)",
        { occupant: occupant.effect_id, occupant_state: occupant.state },
      );
    }
    throw new EffectLedgerError(
      EFFECT_ERROR.IDEMPOTENCY_CONFLICT,
      "idempotency key reused with a different parameters_digest",
      { occupant: occupant.effect_id },
    );
  }

  private assertAuthorizationUnused(
    authorization: EffectRecord["authorization"] | undefined,
    effect_id: string,
  ): void {
    if (!authorization) return;
    const byDec = this.byDecision.get(authorization.policy_decision_id);
    if (byDec && byDec !== effect_id) {
      throw new EffectLedgerError(
        EFFECT_ERROR.AUTHORIZATION_REUSED,
        "policy_decision_id already linked to another effect (F04)",
        { policy_decision_id: authorization.policy_decision_id, occupant: byDec },
      );
    }
    if (authorization.approval_id) {
      const byAp = this.byApproval.get(authorization.approval_id);
      if (byAp && byAp !== effect_id) {
        throw new EffectLedgerError(
          EFFECT_ERROR.AUTHORIZATION_REUSED,
          "approval_id already linked to another effect (F04)",
          { occupant: byAp },
        );
      }
    }
  }

  private stateFromReconciliation(
    current: EffectRecord,
    outcome: ReconciliationAttempt["outcome"],
  ): EffectState | undefined {
    switch (outcome) {
      case "CONFIRMED_COMMITTED":
        return "COMMITTED";
      case "CONFIRMED_REJECTED":
        return "REJECTED";
      case "CONFIRMED_NOT_EXECUTED":
        return "NOT_EXECUTED";
      case "CONFIRMED_PARTIAL":
        return "PARTIAL";
      case "INCONCLUSIVE":
        if (current.state === "DISPATCHED" && !unknownWouldViolateInvEff04(current)) return "UNKNOWN";
        if (current.state === "UNKNOWN") return "ESCALATED";
        return undefined;
    }
  }

  private indexRecord(record: EffectRecord): void {
    if (record.fork_inherited) {
      // History on a fork must not steal the original's idempotency or grant slot (D08).
      return;
    }
    if (record.idempotency_key) {
      this.bySlot.set(idempotencySlot(record.integration.integration_id, record.idempotency_key), {
        key: record.idempotency_key,
        integration_id: record.integration.integration_id,
        effect_id: record.effect_id,
        parameters_digest: record.intent.parameters_digest,
        work_id: record.work_id,
      });
    }
    if (record.authorization?.policy_decision_id) {
      this.byDecision.set(record.authorization.policy_decision_id, record.effect_id);
    }
    if (record.authorization?.approval_id) {
      this.byApproval.set(record.authorization.approval_id, record.effect_id);
    }
  }

  private rebuildIndexes(): void {
    this.bySlot.clear();
    this.byDecision.clear();
    this.byApproval.clear();
    for (const row of this.persist.loadAll()) {
      this.indexRecord(row);
    }
  }

  private writeAudit(record: EffectRecord, from: EffectState | null, observed_result: string, fencing_epoch?: number): void {
    const entry: EffectAuditEntry = {
      at: record.updated_at,
      effect_id: record.effect_id,
      work_id: record.work_id,
      from,
      to: record.state,
      actor: this.actor,
      authorization: record.authorization,
      evidence_ids: [...record.evidence_ids],
      observed_result,
      fencing_epoch,
      integrity_claim: AUDIT_INTEGRITY_CLAIM,
    };
    this.persist.appendAudit(entry);
  }

  private async emitPlanned(record: EffectRecord): Promise<void> {
    const event: EffectDomainEvent = {
      type: "effect.planned",
      work_id: record.work_id,
      occurred_at: record.created_at,
      payload: {
        effect_id: record.effect_id,
        work_id: record.work_id,
        task_id: record.task_id,
        execution_id: record.execution_id,
        effect_class: record.effect_class,
        intent_action: record.intent.action,
        target_resource: record.intent.target_resource,
        parameters_digest: record.intent.parameters_digest,
        idempotency_key: record.idempotency_key,
        executor_id: record.executor_ref.executor_id,
        authorization_policy_decision_id: record.authorization?.policy_decision_id,
      },
    };
    await appendEffectEvent(this.opts.events, this.journal, event, this.actor, () => this.newEventId());
  }

  private async emitStateChanged(from: EffectRecord, to: EffectRecord): Promise<void> {
    const event: EffectDomainEvent = {
      type: "effect.state_changed",
      work_id: to.work_id,
      occurred_at: to.updated_at,
      payload: {
        effect_id: to.effect_id,
        from: from.state,
        to: to.state,
        evidence_ids: [...to.evidence_ids],
        observed_result: to.state,
        authorization_policy_decision_id: to.authorization?.policy_decision_id,
      },
    };
    await appendEffectEvent(this.opts.events, this.journal, event, this.actor, () => this.newEventId());
  }

  private emitMeasurement(record: EffectRecord): void {
    const sink = this.opts.measurements;
    if (!sink) return;
    const provenance =
      record.state === "COMMITTED" || record.state === "REJECTED" || record.state === "NOT_EXECUTED"
        ? "DERIVED"
        : "UNKNOWN";
    sink.emit({
      name: "effect_ledger.state",
      effect_id: record.effect_id,
      work_id: record.work_id,
      state: record.state,
      provenance,
    });
  }

  private newEventId(): string {
    return `evt_${randomBytes(8).toString("hex")}`;
  }

  private lockKeys(effect_id: string, slotKey?: string): string[] {
    return slotKey ? [`e:${effect_id}`, `k:${slotKey}`] : [`e:${effect_id}`];
  }

  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.chains.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort();
    const run = ordered.reduceRight<() => Promise<T>>(
      (inner, key) => () => this.lock(key, inner),
      fn,
    );
    return run();
  }
}
