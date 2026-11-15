/**
 * M19 vertical-slice composition helpers.
 *
 * Wires public exports only (M01 GoalWorkEngine → M02 FileEventLedger, not
 * IsolatedEventBuffer). Execution records are test-composed: M13 is out of
 * Wave 2; WorkProofBuilder.listExecutions is the published injection point.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  EffectRecord,
  Evidence,
  Execution,
  IsoTimestamp,
  WorkEvent,
} from "../../../src/v4/contracts/index.js";
import { DEFAULT_TENANT_ID, EXECUTION_SCHEMA_VERSION } from "../../../src/v4/contracts/index.js";
import { V37PolicyAdapter, V4_CLI_STORE_FALLBACK } from "../../../src/v4/adapters/v37/index.js";
import { FileEventLedger, openM02, putAndRegisterArtifact, workPath, type M02Runtime } from "../../../src/v4/ledger/index.js";
import { allocateId, markText, type IntentIngest } from "../../../src/v4/goal/index.js";
import {
  GoalWorkEngine,
  IsolatedEventBuffer,
  InMemoryWorkRepository,
} from "../../../src/v4/work/index.js";
import { EffectLedger } from "../../../src/v4/effects/index.js";
import {
  DEFAULT_DETERMINISTIC_VERIFIER_ID,
  DeterministicVerifier,
  MemoryEvidenceStore,
  MemoryProofStore,
  TEST_REPORT_MEDIA_TYPE,
  UNIT_TEST_EVIDENCE_KIND,
  WorkProofBuilder,
  createSequenceIdFactory,
  encodeTestReport,
  type DeterministicTestReport,
} from "../../../src/v4/proof/index.js";
import {
  DenyByDefaultPolicyEngine,
  InMemoryOperatorAuthn,
  InMemoryWorkContext,
  PolicyStore,
} from "../../../src/v4/policy/index.js";
import { ObservabilitySink, REDACTED, wrapInboundEvent } from "../../../src/v4/observability/index.js";

export const NOW: IsoTimestamp = "2026-11-15T12:00:00.000Z";
export const HUMAN = { kind: "HUMAN" as const, id: "operator" };
export const WORKER_ID = "executor_worker01";
export const WORKER = { kind: "EXECUTOR" as const, id: WORKER_ID };
export const CP_EXECUTOR = { executor_id: "executor_controlplane", executor_version: "1.0.0" } as const;
export const WORKER_REF = { executor_id: WORKER_ID, executor_version: "1.0.0" } as const;
export const VERIFIER_ID = DEFAULT_DETERMINISTIC_VERIFIER_ID;
export const POLICY_ID = "pol_default0001";
export const CODE_BYTES = new TextEncoder().encode("evolveloop-v4-vertical-slice-source");

export function shaOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export const CODE_SHA = shaOf(CODE_BYTES);

export function frozenClock(at: IsoTimestamp = NOW): () => IsoTimestamp {
  return () => at;
}

export function markedIntent(): IntentIngest {
  return {
    objective: markText("Prove Intent compiles to a Goal Contract and WorkProof on the M02 Event Ledger", "USER_DIRECT"),
    acceptance_criteria: [
      {
        statement: markText("Independent automated tests pass against the produced artifact", "USER_DIRECT"),
        mandatory: true,
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["unit_test"],
      },
    ],
    actor: HUMAN,
  };
}

export function passFence() {
  return async () => ({
    work_id: "unused",
    fencing_epoch: 1,
    lease_id: "lease-vertical-1",
    assertFresh: () => undefined,
  });
}

export interface VerticalWorld {
  root: string;
  m02: M02Runtime;
  engine: GoalWorkEngine;
  effects: EffectLedger;
  policy: DenyByDefaultPolicyEngine;
  contexts: InMemoryWorkContext;
  authn: InMemoryOperatorAuthn;
  v37Policy: V37PolicyAdapter;
  obs: ObservabilitySink;
  evidence: MemoryEvidenceStore;
  proofs: MemoryProofStore;
  executions: Execution[];
  effectIds: string[];
  bytes: Map<string, Uint8Array>;
}

export function openVerticalWorld(): VerticalWorld {
  const root = mkdtempSync(join(tmpdir(), "v4-vertical-"));
  const clock = frozenClock();
  const m02 = openM02({ root, clock });
  const engine = new GoalWorkEngine({
    ledger: m02.ledger,
    repository: new InMemoryWorkRepository(),
    clock,
  });
  const effects = new EffectLedger({
    rootDir: join(root, "effects"),
    clock,
    events: m02.ledger,
    fence: passFence(),
  });
  const store = new PolicyStore();
  store.put({
    kind: "Policy",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    policy_id: POLICY_ID,
    version: 1,
    status: "ACTIVE",
    default_effect: "DENY",
    autonomy_ceiling: "L2_SUPERVISED",
    rules: [
      {
        rule_id: "rule_write_ws",
        effect: "ALLOW",
        subjects: [WORKER_ID],
        actions: ["filesystem.write"],
        resources: ["/workspace/src/*"],
      },
    ],
    change_semantics: "REEVALUATE_IN_FLIGHT",
    epoch: 0,
    created_at: NOW,
  });
  const contexts = new InMemoryWorkContext();
  const policy = new DenyByDefaultPolicyEngine({
    store,
    policy_id: POLICY_ID,
    contexts,
    clock: { now: () => new Date(NOW) },
  });
  const authn = new InMemoryOperatorAuthn();
  const v37Policy = new V37PolicyAdapter(policy, authn);
  const obs = new ObservabilitySink({
    runId: "run_v4_vertical",
    dataDir: join(root, "obs"),
    collectorOptions: { mode: "benchmark" },
  });
  return {
    root,
    m02,
    engine,
    effects,
    policy,
    contexts,
    authn,
    v37Policy,
    obs,
    evidence: new MemoryEvidenceStore(),
    proofs: new MemoryProofStore(),
    executions: [],
    effectIds: [],
    bytes: new Map(),
  };
}

export function assertM02Ledger(world: VerticalWorld): void {
  if (V4_CLI_STORE_FALLBACK) {
    throw new Error("V4_CLI_STORE_FALLBACK must remain false");
  }
  if (!(world.m02.ledger instanceof FileEventLedger)) {
    throw new Error("vertical slice must use M02 FileEventLedger");
  }
  if (world.m02.ledger instanceof IsolatedEventBuffer) {
    throw new Error("vertical slice must not use M01 IsolatedEventBuffer");
  }
}

export function eventsJsonlExists(world: VerticalWorld, work_id: string): boolean {
  return existsSync(workPath(world.root, work_id, "events.jsonl"));
}

export function bindWorkPolicy(world: VerticalWorld, work_id: string): void {
  world.contexts.set({ work_id, autonomy: "L2_SUPERVISED", executor_labels: ["trusted-internal"] });
}

export function makeExecution(input: { work_id: string; task_id: string; execution_id: string }): Execution {
  return {
    kind: "Execution",
    schema_version: EXECUTION_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    execution_id: input.execution_id,
    work_id: input.work_id,
    task_id: input.task_id,
    attempt: 1,
    executor_ref: WORKER_REF,
    state: "SUCCEEDED",
    environment: { runtime: "node" },
    cost: { amount: 0, currency: "USD", provenance: "OBSERVED" },
    result_claim: { claimed_status: "DONE", summary: "executor self-claim (audit only)" },
    started_at: NOW,
    ended_at: NOW,
  };
}

export function passingReport(criterion_id: string): DeterministicTestReport {
  return {
    kind: "DeterministicTestReport",
    schema_version: "1.0.0",
    criterion_id,
    evidence_kind: UNIT_TEST_EVIDENCE_KIND,
    tests: [{ name: "vertical slice unit", passed: true }],
    tested_artifact_sha256: [CODE_SHA],
  };
}

export function cpEffectEvidence(effect_id: string, work_id: string, evidence_id: string): Evidence {
  return {
    kind: "Evidence",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    evidence_id,
    work_id,
    subject: { kind: "EFFECT", ref: effect_id },
    evidence_kind: "target_status",
    method: { kind: "AUTOMATED_TEST", description: "control-plane observed workspace write" },
    result: "PASS",
    produced_by: CP_EXECUTOR,
    subject_executor_ref: WORKER_REF,
    tested_artifacts: [{ sha256: CODE_SHA }],
    environment: { runtime: "node" },
    provenance: "OBSERVED",
    observed_at: NOW,
    limitations: ["does not prove future mutations of the workspace"],
  };
}

export async function registerCodeAndReport(
  world: VerticalWorld,
  input: { work_id: string; task_id: string; execution_id: string; criterion_id: string },
): Promise<void> {
  const code = await putAndRegisterArtifact(world.m02, {
    work_id: input.work_id,
    bytes: CODE_BYTES,
    media_type: "text/plain",
    origin: { task_id: input.task_id, execution_id: input.execution_id, executor_ref: WORKER_REF },
  });
  if (code.outcome.status !== "APPENDED" && code.outcome.status !== "DUPLICATE") {
    throw new Error(`code artifact.registered failed: ${code.outcome.status}`);
  }
  world.bytes.set(code.artifact.artifact_id, CODE_BYTES);

  const reportBytes = encodeTestReport(passingReport(input.criterion_id));
  const report = await putAndRegisterArtifact(world.m02, {
    work_id: input.work_id,
    bytes: reportBytes,
    media_type: TEST_REPORT_MEDIA_TYPE,
    origin: { task_id: input.task_id, execution_id: input.execution_id, executor_ref: WORKER_REF },
  });
  if (report.outcome.status !== "APPENDED" && report.outcome.status !== "DUPLICATE") {
    throw new Error(`report artifact.registered failed: ${report.outcome.status}`);
  }
  world.bytes.set(report.artifact.artifact_id, reportBytes);
}

export function proofBuilder(world: VerticalWorld, opts: { runVerifiersOnBuild?: boolean; idsTag?: string } = {}): WorkProofBuilder {
  return new WorkProofBuilder({
    works: world.engine.repositoryView(),
    listArtifacts: async (work_id) => (await world.m02.artifacts.listMeta()).filter((a) => a.work_id === work_id),
    listExecutions: async (work_id) => world.executions.filter((e) => e.work_id === work_id),
    listEffects: async (work_id) => {
      const rows: EffectRecord[] = [];
      for (const id of world.effectIds) {
        const rec = await world.effects.get(id);
        if (rec && rec.work_id === work_id) rows.push(rec);
      }
      return rows;
    },
    evidence: world.evidence,
    proofs: world.proofs,
    verifiers: [
      new DeterministicVerifier({
        verifier_id: VERIFIER_ID,
        artifacts: world.m02.artifacts,
        content: {
          readBytes: async (id) => world.bytes.get(id),
        },
        clock: frozenClock(),
        ids: createSequenceIdFactory("ver"),
      }),
    ],
    ledger: world.m02.ledger,
    now: frozenClock(),
    ids: createSequenceIdFactory(opts.idsTag ?? "bld"),
    subjectExecutorId: WORKER_ID,
    runVerifiersOnBuild: opts.runVerifiersOnBuild,
  });
}

export async function planAuthorizedEffect(
  world: VerticalWorld,
  input: {
    work_id: string;
    task_id: string;
    execution_id: string;
    policy_decision_id: string;
    effect_id?: string;
  },
): Promise<EffectRecord> {
  const effect_id = input.effect_id ?? allocateId("effect");
  const planned = await world.effects.plan({
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id,
    work_id: input.work_id,
    task_id: input.task_id,
    execution_id: input.execution_id,
    executor_ref: WORKER_REF,
    effect_class: "INTERNAL",
    intent: {
      action: "filesystem.write",
      target_resource: "/workspace/src/app.ts",
      parameters_digest: CODE_SHA,
      description: "write source artifact",
    },
    integration: {
      integration_id: "workspace",
      capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false },
    },
    authorization: { policy_decision_id: input.policy_decision_id },
    idempotency_key: `write:${input.work_id}:1`,
    fork_inherited: false,
  });
  world.effectIds.push(planned.effect_id);
  await world.effects.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
  return world.effects.beginDispatch(planned.effect_id);
}

export async function commitEffect(world: VerticalWorld, effect: EffectRecord, work_id: string): Promise<EffectRecord> {
  const evidence_id = allocateId("evidence");
  await world.effects.registerEvidence(cpEffectEvidence(effect.effect_id, work_id, evidence_id));
  return world.effects.transition(effect.effect_id, "COMMITTED", [evidence_id], { expected_state: "DISPATCHED" });
}

export function redactCanaryLine(): { redacted: string; raw: string } {
  const raw = `Bearer ${"a".repeat(20)}`;
  const wrapped = wrapInboundEvent(
    {
      event_name: "debug.note",
      source: { component: "v4-vertical", module: "slice" },
      attributes: { note: raw },
    },
    "unauthenticated",
  );
  if (!wrapped.ok || !wrapped.event) throw new Error(wrapped.reason ?? "wrap failed");
  return { raw, redacted: String(wrapped.event.attributes.note) };
}

export function ledgerTypes(events: WorkEvent[]): string[] {
  return events.map((e) => e.type);
}

export { allocateId, InMemoryWorkContext, REDACTED };
