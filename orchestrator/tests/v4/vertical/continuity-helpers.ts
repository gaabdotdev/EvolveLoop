/**
 * M19 Continuity vertical composition.
 *
 * Wires public barrels only: M01 GoalWorkEngine → M02 FileEventLedger,
 * M03 EffectLedger, M04 CapsuleService, M05 TimeTravelService, M10 policy,
 * M06 proof, M12 sink. contracts/** are not edited.
 */

import { join } from "node:path";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import {
  CAPSULE_AUTHORITY_MODEL,
  DEFAULT_TENANT_ID,
  computeCapsuleDigest,
  type DelegableGrantRef,
  type EffectRecord,
  type ExecutionCapsule,
  type IsoTimestamp,
} from "../../../src/v4/contracts/index.js";
import { HandleSigningAdapter } from "../../../src/v4/adapters/v37/index.js";
import { FileEventLedger, openM02 } from "../../../src/v4/ledger/index.js";
import { IsolatedEventBuffer, GoalWorkEngine, InMemoryWorkRepository } from "../../../src/v4/work/index.js";
import { EffectLedger } from "../../../src/v4/effects/index.js";
import {
  CapsuleService,
  FileReplayStore,
  signerFromHandle,
  type CapsuleKeyLookup,
  type CapsuleServiceOptions,
  type CapsuleSigner,
} from "../../../src/v4/continuity/index.js";
import { TimeTravelService } from "../../../src/v4/timetravel/index.js";
import { markText } from "../../../src/v4/goal/index.js";
import {
  HUMAN,
  NOW,
  POLICY_ID,
  WORKER,
  WORKER_ID,
  WORKER_REF,
  allocateId,
  assertM02Ledger,
  bindWorkPolicy,
  eventsJsonlExists,
  frozenClock,
  makeExecution,
  openVerticalWorld,
  passFence,
  type VerticalWorld,
} from "./helpers.js";

export const LATER: IsoTimestamp = "2026-11-16T12:00:00.000Z";
export const WRITE_GRANT: DelegableGrantRef = {
  grant_ref: "grn" + "aa".repeat(12),
  scope: ["filesystem.write /workspace/src/app.ts"],
  expires_at: LATER,
};
export const PUSH_GRANT: DelegableGrantRef = {
  grant_ref: "grn" + "bb".repeat(12),
  scope: ["git.push origin/main"],
  expires_at: LATER,
};

export interface ContinuityWorld extends VerticalWorld {
  capsule: CapsuleService;
  tt: TimeTravelService;
  replay: FileReplayStore;
  signer: CapsuleSigner;
  keys: CapsuleKeyLookup;
  capsuleOpts: CapsuleServiceOptions;
}

export function continuityIntent() {
  return {
    objective: markText(
      "Handoff a sealed capsule, recover from a VERIFIED checkpoint, then fork without replaying EXTERNAL effects",
      "USER_DIRECT",
    ),
    acceptance_criteria: [
      {
        statement: markText(
          "Independent automated tests pass against the produced artifact on the forked work",
          "USER_DIRECT",
        ),
        mandatory: true,
        verification_methods: ["AUTOMATED_TEST" as const],
        evidence_required: ["unit_test"],
      },
    ],
    actor: HUMAN,
  };
}

function attachContinuity(world: VerticalWorld): ContinuityWorld {
  const km = generateNodeIdentity();
  const adapter = new HandleSigningAdapter();
  const handle = adapter.register({
    private_key_pem: km.private_key_pem,
    public_key_spki_b64: km.public_key_spki_b64,
  });
  const { signer, keys } = signerFromHandle(adapter, handle);
  const replay = new FileReplayStore(world.root);
  const capsuleOpts: CapsuleServiceOptions = {
    now: () => NOW,
    signer,
    keys,
    require_signature: true,
    rederive_subject: WORKER_REF,
    grants: { grantsFor: async () => [WRITE_GRANT, PUSH_GRANT] },
    lease_required: false,
    tombstones: {
      consumedGrants: async () => [],
      terminalEffects: async () => [],
    },
  };
  const capsule = new CapsuleService(
    world.m02.ledger,
    world.m02.checkpoints,
    world.effects,
    world.policy,
    replay,
    capsuleOpts,
  );
  const tt = new TimeTravelService({
    ledger: world.m02.ledger,
    checkpoints: world.m02.checkpoints,
    artifacts: world.m02.artifacts,
    effects: world.effects,
    works: world.engine.repositoryView(),
    clock: frozenClock(),
  });
  return { ...world, capsule, tt, replay, signer, keys, capsuleOpts };
}

export function openContinuityWorld(): ContinuityWorld {
  return attachContinuity(openVerticalWorld());
}

/**
 * Simulate control-plane restart of file-backed M02/M03/M04 stores.
 * In-memory M01 WorkRepository and M10 GrantRegistry are not durable (GAP).
 */
export function reopenContinuityWorld(previous: ContinuityWorld): ContinuityWorld {
  const clock = frozenClock();
  const m02 = openM02({ root: previous.root, clock });
  const repository = new InMemoryWorkRepository();
  const engine = new GoalWorkEngine({ ledger: m02.ledger, repository, clock });
  const effects = new EffectLedger({
    rootDir: join(previous.root, "effects"),
    clock,
    events: m02.ledger,
    fence: passFence(),
  });
  effects.recoverFromDisk();
  const replay = new FileReplayStore(previous.root);
  const capsule = new CapsuleService(
    m02.ledger,
    m02.checkpoints,
    effects,
    previous.policy,
    replay,
    previous.capsuleOpts,
  );
  const tt = new TimeTravelService({
    ledger: m02.ledger,
    checkpoints: m02.checkpoints,
    artifacts: m02.artifacts,
    effects,
    works: repository,
    clock,
  });
  return {
    ...previous,
    m02,
    engine,
    effects,
    replay,
    capsule,
    tt,
    executions: [...previous.executions],
    effectIds: [...previous.effectIds],
    bytes: new Map(previous.bytes),
  };
}

export function assertDurableM02(world: ContinuityWorld): void {
  assertM02Ledger(world);
  if (!(world.m02.ledger instanceof FileEventLedger)) {
    throw new Error("continuity vertical must use M02 FileEventLedger");
  }
  if (world.m02.ledger instanceof IsolatedEventBuffer) {
    throw new Error("continuity vertical must not use M01 IsolatedEventBuffer");
  }
}

export async function ingestAcceptedPlanned(world: ContinuityWorld) {
  assertDurableM02(world);
  const ingested = await world.engine.ingest(continuityIntent());
  if (ingested.status !== "OK") throw new Error(`ingest failed: ${ingested.status}`);
  if (!eventsJsonlExists(world, ingested.work.work_id)) {
    throw new Error("expected durable events.jsonl");
  }
  const accepted = await world.engine.acceptGoal(ingested.work.work_id, HUMAN);
  if (accepted.status !== "OK") throw new Error(`accept failed: ${accepted.status}`);
  const planned = await world.engine.planTasks(ingested.work.work_id, HUMAN, [
    {
      title: "Apply a recorded external effect then hand off",
      task_kind: "IMPLEMENT",
      expected_result: "EXTERNAL effect DISPATCHED; capsule sealed at VERIFIED checkpoint",
      criterion_refs: ["crit_1"],
    },
  ]);
  if (planned.status !== "OK") throw new Error(`plan failed: ${planned.status}`);
  const task = planned.tasks[0]!;
  const running = await world.engine.changeTaskState(ingested.work.work_id, WORKER, {
    task_id: task.task_id,
    to: "RUNNING",
  });
  if (running.status !== "OK") throw new Error("RUNNING failed");
  const claimed = await world.engine.changeTaskState(ingested.work.work_id, WORKER, {
    task_id: task.task_id,
    to: "SUCCEEDED_UNVERIFIED",
  });
  if (claimed.status !== "OK") throw new Error("SUCCEEDED_UNVERIFIED failed");
  return {
    work_id: ingested.work.work_id,
    contract: accepted.contract,
    task_id: task.task_id,
  };
}

export async function planExternalDispatched(
  world: ContinuityWorld,
  input: { work_id: string; task_id: string; execution_id: string },
): Promise<EffectRecord> {
  const effect_id = allocateId("effect");
  const policy_decision_id = allocateId("policy_decision");
  const planned = await world.effects.plan({
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id,
    work_id: input.work_id,
    task_id: input.task_id,
    execution_id: input.execution_id,
    executor_ref: WORKER_REF,
    effect_class: "EXTERNAL",
    intent: {
      action: "git.push",
      target_resource: "origin/main",
      parameters_digest: "aa".repeat(32),
      description: "push branch",
    },
    integration: {
      integration_id: "git",
      capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false },
    },
    authorization: { policy_decision_id },
    idempotency_key: `git-push:${input.work_id}:1`,
    fork_inherited: false,
  });
  world.effectIds.push(planned.effect_id);
  await world.effects.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
  return world.effects.beginDispatch(planned.effect_id);
}

export function issueBasePushGrant(world: ContinuityWorld, work_id: string): string {
  const grant = world.policy.grants.issue({
    work_id,
    subject_executor_id: WORKER_ID,
    action: "git.push",
    resource: "origin/main",
    policy_id: POLICY_ID,
    policy_version: 1,
    policy_epoch: 0,
    approval_id: "appr_contvert1",
    max_uses: 1,
    expires_at: LATER,
  });
  return grant.grant_id;
}

export function resign(
  capsule: ExecutionCapsule,
  extra: Record<string, unknown>,
  sign: (manifest: string) => { key_id: string; value_b64: string },
): ExecutionCapsule {
  const { integrity: _ignored, ...rest } = { ...capsule, ...extra } as ExecutionCapsule;
  void _ignored;
  const manifest_sha256 = computeCapsuleDigest(rest);
  const sig = sign(manifest_sha256);
  return {
    ...(rest as Omit<ExecutionCapsule, "integrity">),
    integrity: {
      canonicalization: "evolveloop-canonical-json-v1",
      manifest_sha256,
      signature: { alg: "Ed25519", key_id: sig.key_id, value_b64: sig.value_b64 },
    },
  };
}

export function assertAllowlistOnly(sealed: ExecutionCapsule): void {
  if (sealed.authority_model !== CAPSULE_AUTHORITY_MODEL) {
    throw new Error(`expected ${CAPSULE_AUTHORITY_MODEL}`);
  }
  if ("permissions" in sealed) throw new Error("sealed capsule forwarded permissions");
  if ("handoff" in sealed) throw new Error("sealed capsule forwarded handoff");
  if ("next_action" in sealed) throw new Error("sealed capsule forwarded next_action");
  if (!sealed.delegable_grants.every((g) => Object.keys(g).sort().join(",") === "expires_at,grant_ref,scope")) {
    throw new Error("delegable_grants must be refs only");
  }
}

export { HUMAN, NOW, POLICY_ID, WORKER_ID, WORKER_REF, allocateId, bindWorkPolicy, makeExecution };
