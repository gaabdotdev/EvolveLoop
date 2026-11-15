/**
 * In-memory fakes of frozen ports for M11 tests.
 * Disk is not used (worktree constraint). Not product engines.
 */

import { createHash } from "node:crypto";
import {
  ARTIFACT_SCHEMA_VERSION,
  DEFAULT_TENANT_ID,
  EVIDENCE_SCHEMA_VERSION,
  WORK_EVENT_SCHEMA_VERSION,
  computeEventDigest,
  computePayloadDigest,
  type AppendOutcome,
  type Artifact,
  type ArtifactStorePort,
  type ContentRef,
  type EffectLedgerPort,
  type EffectRecord,
  type EventLedgerPort,
  type Evidence,
  type GoalContract,
  type PolicyDecision,
  type Work,
  type WorkEvent,
  type WorkEventDraft,
  type WorkProof,
  type WorkRepositoryPort,
} from "../../../src/v4/contracts/index.js";
import { ProvenanceGraph } from "../../../src/v4/provenance/index.js";
import type { EvidenceLookup, PolicyLookup, ProofLookup, ProvenanceQueryDeps } from "../../../src/v4/provenance/index.js";

export const NOW = "2026-11-15T12:00:00.000Z";
export const WORK = "work_abc123def";
export const GOAL = "goal_abc123def";
export const TASK = "task_abc123def";
export const EXEC = "exec_abc123def";
export const ART = "art_abc123def";
export const EVD = "evd_abc123def";
export const EFF = "eff_abc123def";
export const PDEC = "pdec_abc123def";
export const POL = "pol_abc123def";
export const PROOF = "proof_abc123def";
export const WORKER = "executor_worker01";
export const VERIFIER = "executor_v4detmin1";
export const GRANT = "grnaabbccddeeff001122334455";
export const APPROVAL = "apraabbccddeeff001122334455";

export function shaOf(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export const ARTIFACT_BYTES = new TextEncoder().encode("evolveloop-v4-m11-artifact");
export const ARTIFACT_SHA = shaOf(ARTIFACT_BYTES);

export class MemoryLedger implements EventLedgerPort {
  readonly streams = new Map<string, WorkEvent[]>();

  async append(work_id: string, drafts: WorkEventDraft[], opts: { expected_head_seq: number }): Promise<AppendOutcome> {
    const current = this.streams.get(work_id) ?? [];
    const head = current.length;
    if (opts.expected_head_seq !== head) {
      return { status: "CONFLICT", reason: "EXPECTED_SEQ_MISMATCH", head_seq: head };
    }
    const events: WorkEvent[] = [];
    let prev: WorkEvent["prev_event_digest"] = current.length === 0 ? "GENESIS" : current[current.length - 1]!.event_digest;
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i]!;
      const body: Omit<WorkEvent, "event_digest"> = {
        kind: "WorkEvent",
        schema_version: WORK_EVENT_SCHEMA_VERSION,
        tenant_id: DEFAULT_TENANT_ID,
        event_id: draft.event_id,
        work_id,
        seq: head + i + 1,
        type: draft.type,
        type_version: draft.type_version,
        occurred_at: draft.occurred_at,
        recorded_at: NOW,
        actor: draft.actor,
        correlation_id: draft.correlation_id,
        payload: draft.payload,
        payload_digest: computePayloadDigest(draft.payload),
        prev_event_digest: prev,
        ...(draft.causation_id ? { causation_id: draft.causation_id } : {}),
      };
      const event: WorkEvent = { ...body, event_digest: computeEventDigest(body) };
      events.push(event);
      prev = event.event_digest;
    }
    this.streams.set(work_id, [...current, ...events]);
    return { status: "APPENDED", events, head_seq: head + events.length };
  }

  async read(work_id: string, opts?: { from_seq?: number; to_seq?: number }): Promise<WorkEvent[]> {
    const all = this.streams.get(work_id) ?? [];
    return all.filter((e) => {
      if (opts?.from_seq !== undefined && e.seq < opts.from_seq) return false;
      if (opts?.to_seq !== undefined && e.seq > opts.to_seq) return false;
      return true;
    });
  }

  async head(work_id: string): Promise<number> {
    return this.streams.get(work_id)?.length ?? 0;
  }

  /** Mutate stored events after append so ingest must fail closed. */
  tamperChain(work_id: string): void {
    const events = this.streams.get(work_id);
    if (!events || events.length < 2) return;
    const copy = { ...events[1]!, prev_event_digest: "0".repeat(64) as WorkEvent["prev_event_digest"] };
    events[1] = copy;
  }

  tamperPayload(work_id: string): void {
    const events = this.streams.get(work_id);
    if (!events || events.length === 0) return;
    const first = events[0]!;
    events[0] = { ...first, payload: { ...first.payload, extra: "mutated" } };
  }
}

export class MemoryArtifacts implements ArtifactStorePort {
  readonly byId = new Map<string, Artifact>();
  readonly blobs = new Map<string, Uint8Array>();
  verifyOverride = new Map<string, "VERIFIED" | "MISMATCH" | "MISSING">();

  async put(input: { work_id: string; bytes: Uint8Array; media_type: string; origin: Artifact["origin"] }): Promise<Artifact> {
    const sha256 = shaOf(input.bytes);
    this.blobs.set(sha256, input.bytes);
    const artifact: Artifact = {
      kind: "Artifact",
      schema_version: ARTIFACT_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      artifact_id: ART,
      work_id: input.work_id,
      content: { sha256, size_bytes: input.bytes.byteLength, media_type: input.media_type },
      origin: input.origin,
      access: { classification: "INTERNAL", project_ids: [input.work_id] },
      retention: { policy: "WORK_LIFETIME" },
      integrity_status: "VERIFIED",
      created_at: NOW,
    };
    this.byId.set(artifact.artifact_id, artifact);
    return artifact;
  }

  seed(artifact: Artifact, bytes?: Uint8Array): void {
    this.byId.set(artifact.artifact_id, artifact);
    if (bytes) this.blobs.set(artifact.content.sha256, bytes);
  }

  async get(artifact_id: string): Promise<Artifact | undefined> {
    return this.byId.get(artifact_id);
  }

  async verify(ref: ContentRef): Promise<"VERIFIED" | "MISMATCH" | "MISSING"> {
    const forced = this.verifyOverride.get(ref.sha256);
    if (forced) return forced;
    const blob = this.blobs.get(ref.sha256);
    if (!blob) return "MISSING";
    return shaOf(blob) === ref.sha256 ? "VERIFIED" : "MISMATCH";
  }

  async listByWork(work_id: string): Promise<Artifact[]> {
    return [...this.byId.values()].filter((a) => a.work_id === work_id);
  }
}

export class MemoryEffects implements Pick<EffectLedgerPort, "get"> {
  readonly byId = new Map<string, EffectRecord>();

  seed(effect: EffectRecord): void {
    this.byId.set(effect.effect_id, effect);
  }

  async get(effect_id: string): Promise<EffectRecord | undefined> {
    return this.byId.get(effect_id);
  }

  async plan(): Promise<EffectRecord> {
    throw new Error("M11 tests do not plan effects");
  }
  async transition(): Promise<EffectRecord> {
    throw new Error("M11 tests do not transition effects");
  }
  async listOpen(): Promise<EffectRecord[]> {
    return [];
  }
  async retryDecision(): Promise<never> {
    throw new Error("M11 tests do not retry");
  }
}

export class MemoryWorks implements WorkRepositoryPort {
  work: Work | undefined;
  goals = new Map<string, GoalContract>();

  seedGoal(goal: GoalContract): void {
    this.goals.set(`${goal.goal_contract_id}|${goal.version}`, goal);
  }

  seedWork(work: Work): void {
    this.work = work;
  }

  async getWork(work_id: string): Promise<Work | undefined> {
    return this.work?.work_id === work_id ? this.work : undefined;
  }

  async getGoalContract(goal_contract_id: string, version: number): Promise<GoalContract | undefined> {
    return this.goals.get(`${goal_contract_id}|${version}`);
  }

  async listTasks(): Promise<[]> {
    return [];
  }
}

export class MemoryEvidence implements EvidenceLookup {
  readonly byId = new Map<string, Evidence>();

  seed(evidence: Evidence): void {
    this.byId.set(evidence.evidence_id, evidence);
  }

  async get(evidence_id: string): Promise<Evidence | undefined> {
    return this.byId.get(evidence_id);
  }

  async listByWork(work_id: string): Promise<Evidence[]> {
    return [...this.byId.values()].filter((e) => e.work_id === work_id);
  }
}

export class MemoryProofs implements ProofLookup {
  latest: WorkProof | undefined;

  async latestForWork(work_id: string): Promise<WorkProof | undefined> {
    return this.latest?.work_id === work_id ? this.latest : undefined;
  }
}

export class MemoryPolicy implements PolicyLookup {
  readonly byId = new Map<string, PolicyDecision>();

  seed(decision: PolicyDecision): void {
    this.byId.set(decision.decision_id, decision);
  }

  async getDecision(decision_id: string): Promise<PolicyDecision | undefined> {
    return this.byId.get(decision_id);
  }
}

export function draft(
  event_id: string,
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<WorkEventDraft> = {},
): WorkEventDraft {
  return {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id,
    work_id: WORK,
    type,
    type_version: 1,
    occurred_at: NOW,
    actor: extra.actor ?? { kind: "PLATFORM", id: "control-plane" },
    correlation_id: extra.correlation_id ?? "corr_m11",
    causation_id: extra.causation_id,
    payload,
    payload_digest: computePayloadDigest(payload),
    prev_event_digest: "GENESIS",
    event_digest: "0".repeat(64),
    ...stripDraftConflict(extra),
  };
}

function stripDraftConflict(extra: Partial<WorkEventDraft>): Partial<WorkEventDraft> {
  const { payload: _p, payload_digest: _d, ...rest } = extra;
  void _p;
  void _d;
  return rest;
}

export async function appendAll(ledger: MemoryLedger, drafts: WorkEventDraft[]): Promise<void> {
  for (const d of drafts) {
    const head = await ledger.head(d.work_id);
    const outcome = await ledger.append(d.work_id, [d], { expected_head_seq: head });
    if (outcome.status !== "APPENDED") {
      throw new Error(`append ${d.type} failed: ${outcome.status}`);
    }
  }
}

export function validGoal(overrides: Partial<GoalContract> = {}): GoalContract {
  return {
    kind: "GoalContract",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    goal_contract_id: GOAL,
    version: 1,
    work_id: WORK,
    status: "ACCEPTED",
    objective: "ship with tests",
    scope: ["src"],
    out_of_scope: ["prod"],
    constraints: [],
    acceptance_criteria: [
      {
        criterion_id: "crit_tests",
        statement: "unit tests pass",
        mandatory: true,
        origin: "USER_STATED",
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["unit_test"],
      },
    ],
    assumptions: [],
    ambiguities: [],
    risks: [],
    dependencies: [],
    execution: { autonomy: "L1_EXECUTE", verification: "INDEPENDENT", recovery_enabled: true },
    stop_conditions: ["budget exceeded"],
    created_at: NOW,
    created_by: { kind: "HUMAN", id: "operator" },
    ...overrides,
  };
}

export function validWork(overrides: Partial<Work> = {}): Work {
  return {
    kind: "Work",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    work_id: WORK,
    owner: "platform",
    goal_contract_ref: { id: GOAL, version: 1 },
    state: "RUNNING",
    last_event_seq: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function validArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    kind: "Artifact",
    schema_version: ARTIFACT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    artifact_id: ART,
    work_id: WORK,
    content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
    origin: { executor_ref: { executor_id: WORKER, executor_version: "1.0.0" }, execution_id: EXEC, task_id: TASK },
    access: { classification: "INTERNAL", project_ids: [WORK] },
    retention: { policy: "WORK_LIFETIME" },
    integrity_status: "VERIFIED",
    created_at: NOW,
    ...overrides,
  };
}

export function validEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    kind: "Evidence",
    schema_version: EVIDENCE_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    evidence_id: EVD,
    work_id: WORK,
    subject: { kind: "CRITERION", ref: "crit_tests" },
    criterion_ref: { goal_contract_id: GOAL, goal_contract_version: 1, criterion_id: "crit_tests" },
    evidence_kind: "unit_test",
    method: { kind: "AUTOMATED_TEST", description: "vitest run" },
    result: "PASS",
    produced_by: { executor_id: VERIFIER, executor_version: "1.0.0" },
    subject_executor_ref: { executor_id: WORKER, executor_version: "1.0.0" },
    tested_artifacts: [{ sha256: ARTIFACT_SHA }],
    environment: { runtime: "node" },
    provenance: "OBSERVED",
    observed_at: NOW,
    limitations: ["does not prove production behaviour"],
    ...overrides,
  };
}

export function validEffect(overrides: Partial<EffectRecord> = {}): EffectRecord {
  return {
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id: EFF,
    work_id: WORK,
    task_id: TASK,
    execution_id: EXEC,
    executor_ref: { executor_id: WORKER, executor_version: "1.0.0" },
    effect_class: "EXTERNAL",
    intent: {
      action: "git.push",
      target_resource: "origin/main",
      parameters_digest: ARTIFACT_SHA,
      description: "push branch",
    },
    integration: {
      integration_id: "git",
      capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false },
    },
    authorization: { policy_decision_id: PDEC },
    state: "AUTHORIZED",
    evidence_ids: [],
    reconciliation: [],
    fork_inherited: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function validPolicyDecision(overrides: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    kind: "PolicyDecision",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    decision_id: PDEC,
    request: {
      work_id: WORK,
      task_id: TASK,
      subject: { executor_id: WORKER, executor_version: "1.0.0" },
      action: "git.push",
      resource: "origin/main",
      environment: "dev",
      risk: "medium",
    },
    decision: "ALLOW",
    policy_ref: { policy_id: POL, version: 1, epoch: 1 },
    matched_rule_ids: ["allow-git-push"],
    reason: "matched allow",
    obligations: [],
    decided_at: NOW,
    valid_until: "2026-11-15T12:04:00.000Z",
    ...overrides,
  };
}

export interface World {
  ledger: MemoryLedger;
  artifacts: MemoryArtifacts;
  effects: MemoryEffects;
  works: MemoryWorks;
  evidence: MemoryEvidence;
  proofs: MemoryProofs;
  policy: MemoryPolicy;
  graph: ProvenanceGraph;
}

export function createWorld(extra?: Partial<ProvenanceQueryDeps>): World {
  const ledger = extra?.ledger instanceof MemoryLedger ? extra.ledger : new MemoryLedger();
  const artifacts = extra?.artifacts instanceof MemoryArtifacts ? extra.artifacts : new MemoryArtifacts();
  const effects = new MemoryEffects();
  const works = extra?.works instanceof MemoryWorks ? extra.works : new MemoryWorks();
  const evidence = new MemoryEvidence();
  const proofs = new MemoryProofs();
  const policy = new MemoryPolicy();
  const graph = new ProvenanceGraph({
    ledger,
    artifacts,
    effects: effects as unknown as EffectLedgerPort,
    works,
    evidence,
    proofs,
    policy,
    artifactList: { listByWork: (id) => artifacts.listByWork(id) },
    listWorkIds: extra?.listWorkIds ?? (() => [WORK]),
    now: extra?.now ?? (() => NOW),
  });
  return { ledger, artifacts, effects, works, evidence, proofs, policy, graph };
}

export async function seedWorkCreated(ledger: MemoryLedger): Promise<void> {
  await appendAll(ledger, [
    draft("evt_workcreate1", "work.created", { goal_contract_ref: { id: GOAL, version: 1 } }),
  ]);
}
