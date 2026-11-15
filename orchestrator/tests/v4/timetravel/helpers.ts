/**
 * M05 test world: compose Wave 2 public APIs (M01 engine, M02 stores, M03 effects).
 * IsolatedEventBuffer is not used — the Event Ledger is FileEventLedger.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_TENANT_ID,
  type EffectRecord,
  type IsoTimestamp,
} from "../../../src/v4/contracts/index.js";
import { openM02, putAndRegisterArtifact, type M02Runtime } from "../../../src/v4/ledger/index.js";
import { allocateId, markText, type IntentIngest } from "../../../src/v4/goal/index.js";
import { GoalWorkEngine, InMemoryWorkRepository } from "../../../src/v4/work/index.js";
import { EffectLedger } from "../../../src/v4/effects/index.js";
import { GrantRegistry } from "../../../src/v4/policy/index.js";
import { TimeTravelService } from "../../../src/v4/timetravel/index.js";

export const NOW: IsoTimestamp = "2026-11-15T12:00:00.000Z";
export const HUMAN = { kind: "HUMAN" as const, id: "operator" };
export const WORKER_ID = "executor_worker01";
export const WORKER_REF = { executor_id: WORKER_ID, executor_version: "1.0.0" } as const;
export const ARTIFACT_BYTES = new TextEncoder().encode("evolveloop-v4-m05-artifact");
export const ARTIFACT_SHA = createHash("sha256").update(ARTIFACT_BYTES).digest("hex");

export function frozenClock(at: IsoTimestamp = NOW): () => IsoTimestamp {
  return () => at;
}

export function passFence() {
  return async () => ({
    work_id: "unused",
    fencing_epoch: 1,
    lease_id: "lease-m05-test-1",
    assertFresh: () => undefined,
  });
}

export function intent(): IntentIngest {
  return {
    objective: markText("Inspect a work timeline and fork from a checkpoint", "USER_DIRECT"),
    acceptance_criteria: [
      {
        statement: markText("Fork identity is distinct and inherited EXTERNAL effects cannot re-dispatch", "USER_DIRECT"),
        mandatory: true,
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["unit_test"],
      },
    ],
    actor: HUMAN,
  };
}

export interface M05World {
  root: string;
  m02: M02Runtime;
  engine: GoalWorkEngine;
  effects: EffectLedger;
  grants: GrantRegistry;
  tt: TimeTravelService;
  repository: InMemoryWorkRepository;
}

const roots: string[] = [];

export function trackRoot(root: string): string {
  roots.push(root);
  return root;
}

export function cleanupRoots(): void {
  for (const r of roots.splice(0)) {
    rmSync(r, { recursive: true, force: true });
  }
}

export function openWorld(): M05World {
  const root = trackRoot(mkdtempSync(join(tmpdir(), "v4-m05-")));
  const clock = frozenClock();
  const m02 = openM02({ root, clock });
  const repository = new InMemoryWorkRepository();
  const engine = new GoalWorkEngine({ ledger: m02.ledger, repository, clock });
  const effects = new EffectLedger({
    rootDir: join(root, "effects"),
    clock,
    events: m02.ledger,
    fence: passFence(),
  });
  const grants = new GrantRegistry({ now: () => new Date(NOW) });
  const tt = new TimeTravelService({
    ledger: m02.ledger,
    checkpoints: m02.checkpoints,
    artifacts: m02.artifacts,
    effects,
    works: repository,
    clock,
  });
  return { root, m02, engine, effects, grants, tt, repository };
}

export async function seedRunnableWork(world: M05World): Promise<{
  work_id: string;
  task_id: string;
  execution_id: string;
  effect: EffectRecord;
  checkpoint_id: string;
  artifact_sha: string;
  grant_id: string;
}> {
  const ingested = await world.engine.ingest(intent());
  if (ingested.status !== "OK") throw new Error(`ingest failed: ${ingested.status}`);
  const work_id = ingested.work.work_id;

  const accepted = await world.engine.acceptGoal(work_id, HUMAN);
  if (accepted.status !== "OK") throw new Error(`accept failed: ${accepted.status}`);

  const planned = await world.engine.planTasks(work_id, HUMAN, [
    {
      title: "Apply a recorded external effect",
      task_kind: "IMPLEMENT",
      expected_result: "Effect DISPATCHED with captured I/O",
      criterion_refs: ["crit_1"],
    },
  ]);
  if (planned.status !== "OK") throw new Error(`plan failed: ${planned.status}`);
  const task_id = planned.tasks[0]!.task_id;

  const art = await putAndRegisterArtifact(world.m02, {
    work_id,
    bytes: ARTIFACT_BYTES,
    media_type: "text/plain",
    origin: { task_id, executor_ref: WORKER_REF },
  });
  if (art.outcome.status !== "APPENDED" && art.outcome.status !== "DUPLICATE") {
    throw new Error(`artifact.registered failed: ${art.outcome.status}`);
  }

  const execution_id = allocateId("execution");
  const effect_id = allocateId("effect");
  const policy_decision_id = allocateId("policy_decision");
  const plannedEffect = await world.effects.plan({
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id,
    work_id,
    task_id,
    execution_id,
    executor_ref: WORKER_REF,
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
    authorization: { policy_decision_id },
    idempotency_key: `git-push:${work_id}:1`,
    fork_inherited: false,
  });
  await world.effects.authorize(plannedEffect.effect_id, plannedEffect.authorization!, { expected_state: "PLANNED" });
  const effect = await world.effects.beginDispatch(plannedEffect.effect_id);

  const grant = world.grants.issue({
    work_id,
    subject_executor_id: WORKER_ID,
    action: "git.push",
    resource: "origin/main",
    policy_id: "pol_default0001",
    policy_version: 1,
    policy_epoch: 0,
    approval_id: "appr_m05test1",
    max_uses: 1,
    expires_at: "2026-11-16T12:00:00.000Z",
  });

  const head = await world.m02.ledger.head(work_id);
  const ckpt = await world.m02.checkpoints.create(work_id, head);

  return {
    work_id,
    task_id,
    execution_id,
    effect,
    checkpoint_id: ckpt.checkpoint_id,
    artifact_sha: art.artifact.content.sha256,
    grant_id: grant.grant_id,
  };
}
