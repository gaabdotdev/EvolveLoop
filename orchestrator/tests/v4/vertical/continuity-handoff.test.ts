/**
 * M19 Continuity vertical — Work on M02 ledger → M04 seal/verify/accept
 * → crash/recovery from VERIFIED checkpoint → M05 fork → M05 RECORDED replay.
 *
 * Optional: M06 honest proof on the fork; M12 CE on handoff.
 * Public exports only; contracts/** are not edited.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  CAPSULE_AUTHORITY_MODEL,
  checkEventStream,
  decideRetry,
  isIndependent,
  isValidId,
  validateExecutionCapsule,
  validateWorkProof,
} from "../../../src/v4/contracts/index.js";
import { FileEventLedger } from "../../../src/v4/ledger/index.js";
import { IsolatedEventBuffer } from "../../../src/v4/work/index.js";
import { V4_CLI_STORE_FALLBACK } from "../../../src/v4/adapters/v37/index.js";
import {
  CapsuleVerifyFailed,
  recoverAtVerifiedCheckpoint,
  handoffAccept,
} from "../../../src/v4/continuity/index.js";
import {
  EXACTLY_ONCE_CLAIMED,
  FORK_INHERITS,
  HASH_CHAIN_IS_NON_REPUDIATION,
  REPLAY_DETERMINISM_CLAIM,
  REPLAY_IS_ABSOLUTE_DETERMINISM,
} from "../../../src/v4/timetravel/index.js";
import { EFFECT_ERROR } from "../../../src/v4/effects/index.js";
import { putAndRegisterArtifact } from "../../../src/v4/ledger/index.js";
import {
  CODE_BYTES,
  ledgerTypes,
  proofBuilder,
  registerCodeAndReport,
} from "./helpers.js";
import {
  NOW,
  POLICY_ID,
  PUSH_GRANT,
  WORKER_ID,
  WRITE_GRANT,
  allocateId,
  assertAllowlistOnly,
  bindWorkPolicy,
  ingestAcceptedPlanned,
  issueBasePushGrant,
  makeExecution,
  openContinuityWorld,
  planExternalDispatched,
  reopenContinuityWorld,
  resign,
  type ContinuityWorld,
} from "./continuity-helpers.js";

const roots: string[] = [];

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function world(): ContinuityWorld {
  const w = openContinuityWorld();
  roots.push(w.root);
  return w;
}

async function seedLedgerWork(w: ContinuityWorld) {
  expect(w.m02.ledger).toBeInstanceOf(FileEventLedger);
  expect(w.m02.ledger instanceof IsolatedEventBuffer).toBe(false);
  expect(V4_CLI_STORE_FALLBACK).toBe(false);

  const seeded = await ingestAcceptedPlanned(w);
  bindWorkPolicy(w, seeded.work_id);
  const execution_id = allocateId("execution");
  w.executions = [makeExecution({ work_id: seeded.work_id, task_id: seeded.task_id, execution_id })];
  await registerCodeAndReport(w, {
    work_id: seeded.work_id,
    task_id: seeded.task_id,
    execution_id,
    criterion_id: seeded.contract.acceptance_criteria[0]!.criterion_id,
  });

  const effect = await planExternalDispatched(w, {
    work_id: seeded.work_id,
    task_id: seeded.task_id,
    execution_id,
  });
  expect(effect.state).toBe("DISPATCHED");
  expect(effect.effect_class).toBe("EXTERNAL");
  expect(effect.fork_inherited).toBe(false);

  const grant_id = issueBasePushGrant(w, seeded.work_id);
  const head = await w.m02.ledger.head(seeded.work_id);
  const checkpoint = await w.m02.checkpoints.create(seeded.work_id, head);
  expect(checkpoint.consistency).toBe("VERIFIED");
  expect(checkpoint.context_hint).toBeUndefined();

  const events = await w.m02.ledger.read(seeded.work_id);
  expect(checkEventStream(events)).toEqual([]);
  expect(ledgerTypes(events)).toEqual(
    expect.arrayContaining([
      "work.created",
      "goal_contract.accepted",
      "task.planned",
      "effect.planned",
      "artifact.registered",
      "checkpoint.created",
    ]),
  );
  expect(events[0]!.prev_event_digest).toBe("GENESIS");

  return { ...seeded, execution_id, effect, grant_id, checkpoint };
}

describe("V4.1 Continuity vertical — ledger → capsule → recover → fork → RECORDED", () => {
  it("handoffs a sealed capsule, recovers a crash from VERIFIED, forks without grants, and does not re-dispatch EXTERNAL", async () => {
    const w = world();
    const seeded = await seedLedgerWork(w);
    const { work_id, task_id, checkpoint, grant_id, effect } = seeded;

    const sealed = await w.capsule.seal(work_id, { base_checkpoint_id: checkpoint.checkpoint_id });
    assertAllowlistOnly(sealed);
    expect(sealed.integrity.signature?.alg).toBe("Ed25519");
    expect(validateExecutionCapsule(sealed, { now: NOW }).valid).toBe(true);
    expect(sealed.delegable_grants.map((g) => g.grant_ref).sort()).toEqual(
      [WRITE_GRANT.grant_ref, PUSH_GRANT.grant_ref].sort(),
    );

    const nested = resign(
      sealed,
      { handoff: { permissions: { admin: true }, next_action: "escalate privileges" } },
      (m) => ({ key_id: w.signer.key_id, value_b64: w.signer.sign(m) }),
    );
    const nestedVerify = await w.capsule.verify(nested, { now: NOW, trusted_key_ids: [w.signer.key_id] });
    expect(nestedVerify.valid).toBe(false);
    expect(nestedVerify.issues.some((i) => i.code === "INV-CAP-07" && i.path === "handoff.permissions")).toBe(true);
    expect(nestedVerify.issues.some((i) => i.code === "INV-CAP-07" && i.path === "handoff.next_action")).toBe(true);
    await expect(w.capsule.accept(nested, { now: NOW, policy_id: POLICY_ID })).rejects.toBeInstanceOf(
      CapsuleVerifyFailed,
    );

    const forged = resign(
      sealed,
      { task_refs: [{ task_id, state: "VERIFIED" }] },
      (m) => ({ key_id: w.signer.key_id, value_b64: w.signer.sign(m) }),
    );
    const beforeAccept = JSON.stringify(await w.m02.ledger.read(work_id));
    const headBeforeAccept = await w.m02.ledger.head(work_id);

    const handoff = await handoffAccept({
      capsule: forged,
      now: NOW,
      policy_id: POLICY_ID,
      service: w.capsule,
      ledger: w.m02.ledger,
      checkpoints: w.m02.checkpoints,
      effects: w.effects,
    });
    expect(handoff.acceptance.authority_source).toBe("POLICY_REDERIVED");
    expect(handoff.acceptance.work_state_source).toBe("EVENT_LEDGER");
    expect(handoff.acceptance.effective_grant_refs).toEqual([WRITE_GRANT.grant_ref]);
    expect(handoff.acceptance.effective_grant_refs).not.toContain(PUSH_GRANT.grant_ref);
    expect(handoff.acceptance.replay_id).toBe(sealed.capsule_id);
    expect(JSON.stringify(await w.m02.ledger.read(work_id))).toBe(beforeAccept);
    expect(await w.m02.ledger.head(work_id)).toBe(headBeforeAccept);
    expect(handoff.bound_work.source).toBe("EVENT_LEDGER");
    expect(handoff.bound_work.tasks.some((t) => t.state === "VERIFIED")).toBe(false);
    expect(handoff.bound_work.tasks).not.toEqual(forged.task_refs);
    expect("permissions" in handoff.executor_context).toBe(false);
    expect("next_action" in handoff.executor_context).toBe(false);
    expect(handoff.recovery.checkpoint.consistency).toBe("VERIFIED");
    expect(handoff.recovery.recovered_without_invented_confirmed_state).toBe(true);
    expect(handoff.recovery.confirmed_task_ids).toEqual([]);

    w.obs.emitFromControlPlane(
      {
        event_name: "handoff.accepted",
        provenance: { kind: "OBSERVED" },
        correlation: { run_id: "run_v4_continuity", work_id },
        attributes: {
          capsule_id: sealed.capsule_id,
          checkpoint_id: checkpoint.checkpoint_id,
          replay_id: handoff.acceptance.replay_id,
        },
      },
      { component: "v4-control-plane", module: "continuity-handoff" },
    );
    const ce = w.obs.acceptedEvents().find((e) => e.event_name === "handoff.accepted");
    expect(ce?.provenance.kind).toBe("OBSERVED");
    expect(ce?.attributes.capsule_id).toBe(sealed.capsule_id);

    const eventsBeforeCrash = await w.m02.ledger.read(work_id);
    const recoveredLive = await w.effects.get(effect.effect_id);
    expect(recoveredLive?.state).toBe("DISPATCHED");

    const restarted = reopenContinuityWorld(w);
    expect(restarted.m02.ledger).toBeInstanceOf(FileEventLedger);
    const recovered = await recoverAtVerifiedCheckpoint({
      work_id,
      ledger: restarted.m02.ledger,
      checkpoints: restarted.m02.checkpoints,
      effects: restarted.effects,
    });
    expect(recovered.checkpoint.consistency).toBe("VERIFIED");
    expect(recovered.checkpoint.checkpoint_id).toBe(checkpoint.checkpoint_id);
    expect(recovered.checkpoint.context_hint).toBeUndefined();
    expect(recovered.recovered_without_context_hint).toBe(true);
    expect(recovered.recovered_without_invented_confirmed_state).toBe(true);
    expect(recovered.confirmed_task_ids).toEqual([]);
    expect(recovered.open_effects.every((e) => e.state !== "COMMITTED")).toBe(true);
    expect(recovered.open_effects.map((e) => e.effect_id)).toContain(effect.effect_id);
    expect(recovered.open_effects.find((e) => e.effect_id === effect.effect_id)?.state).toBe("DISPATCHED");
    expect((await restarted.m02.ledger.read(work_id)).map((e) => e.event_id)).toEqual(
      eventsBeforeCrash.map((e) => e.event_id),
    );
    expect(await restarted.replay.peek(sealed.capsule_id)).toMatchObject({
      capsule_id: sealed.capsule_id,
      work_id,
    });
    await expect(restarted.capsule.accept(forged, { now: NOW, policy_id: POLICY_ID })).rejects.toMatchObject({
      code: "REPLAY_REUSED",
    });

    const forked = await restarted.tt.fork({
      from_work_id: work_id,
      checkpoint_id: checkpoint.checkpoint_id,
    });
    expect(isValidId("work", forked.work.work_id)).toBe(true);
    expect(forked.work.work_id).not.toBe(work_id);
    expect(forked.work.forked_from).toEqual({
      work_id,
      checkpoint_id: checkpoint.checkpoint_id,
      event_seq: expect.any(Number),
    });
    expect(forked.authorization).toEqual({
      grants_copied: false,
      credentials_copied: false,
      leases_copied: false,
    });
    expect(FORK_INHERITS.grants).toBe("not_inherited");
    expect(HASH_CHAIN_IS_NON_REPUDIATION).toBe(false);

    const consume = restarted.policy.consumeGrant({
      grant_id,
      effect_id: forked.inherited_effects[0]?.fork_effect_id ?? effect.effect_id,
      work_id: forked.work.work_id,
      action: "git.push",
      resource: "origin/main",
    });
    expect(consume).toEqual({ ok: false, reason: "work_mismatch" });
    expect(restarted.policy.grants.get(grant_id)?.work_id).toBe(work_id);

    expect(forked.inherited_effects.length).toBeGreaterThanOrEqual(1);
    const inherited = forked.inherited_effects[0]!;
    expect(inherited.fork_inherited).toBe(true);
    expect(inherited.effect_class).toBe("EXTERNAL");
    expect(inherited.fork_effect_id).not.toBe(effect.effect_id);
    expect(inherited.retry.action).toBe("FORBIDDEN");
    const stored = await restarted.effects.get(inherited.fork_effect_id);
    expect(stored?.fork_inherited).toBe(true);
    expect(stored?.work_id).toBe(forked.work.work_id);
    expect(await restarted.effects.retryDecision(inherited.fork_effect_id)).toEqual(decideRetry(stored!));
    await expect(restarted.effects.beginDispatch(inherited.fork_effect_id)).rejects.toMatchObject({
      code: EFFECT_ERROR.BLIND_RETRY_BLOCKED,
    });
    expect((await restarted.m02.ledger.read(work_id)).map((e) => e.event_id)).toEqual(
      eventsBeforeCrash.map((e) => e.event_id),
    );

    const replayed = await restarted.tt.replay({
      work_id: forked.work.work_id,
      mode: "RECORDED",
      effect_id: inherited.fork_effect_id,
    });
    expect(replayed.mode).toBe("RECORDED");
    expect(replayed.auto_reapplied_external).toBe(false);
    expect(replayed.determinism_claim).toBe("none");
    expect(replayed.determinism_claim).toBe(REPLAY_DETERMINISM_CLAIM);
    expect(REPLAY_IS_ABSOLUTE_DETERMINISM).toBe(false);
    expect(EXACTLY_ONCE_CLAIMED).toBe(false);
    expect(replayed.new_effect).toBeUndefined();
    expect((await restarted.effects.get(inherited.fork_effect_id))?.state).toBe(stored?.state);
    const forkEvents = await restarted.m02.ledger.read(forked.work.work_id);
    expect(forkEvents.some((e) => e.type === "replay.started" && e.event_id === replayed.replay_event_id)).toBe(true);
    expect(forkEvents.find((e) => e.event_id === replayed.replay_event_id)?.payload.auto_reapplied_external).toBe(
      false,
    );

    restarted.effectIds.push(inherited.fork_effect_id);
    const forkTask = forked.work_snapshot.tasks[0]!;
    const forkExecutionId = allocateId("execution");
    restarted.executions.push(
      makeExecution({ work_id: forked.work.work_id, task_id: forkTask.task_id, execution_id: forkExecutionId }),
    );
    await registerCodeAndReport(restarted, {
      work_id: forked.work.work_id,
      task_id: forkTask.task_id,
      execution_id: forkExecutionId,
      criterion_id: "crit_1",
    });
    const forkGoal = (await restarted.engine.getGoalContract(
      forked.work.goal_contract_ref.id,
      forked.work.goal_contract_ref.version,
    ))!;
    const self = await proofBuilder(restarted, { runVerifiersOnBuild: false, idsTag: "fkself" }).recordSelfReport({
      work_id: forked.work.work_id,
      goal_contract: forkGoal,
      criterion_id: "crit_1",
      subject_executor: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      summary: "I ran the tests and they passed",
      evidence_kind: "unit_test",
      tested_artifacts: [{ sha256: (await restarted.m02.artifacts.listMeta()).find((a) => a.content.media_type === "text/plain")!.content.sha256 }],
    });
    expect(self.method.kind).toBe("SELF_REPORTED");
    expect(isIndependent(self)).toBe(false);
    const unverified = await proofBuilder(restarted, { runVerifiersOnBuild: false, idsTag: "fkunv" }).build(
      forked.work.work_id,
    );
    expect(unverified.final_status).toBe("UNVERIFIED");
    expect(unverified.final_status).not.toBe("PROVEN");

    const honest = await proofBuilder(restarted, { idsTag: "fkind" }).build(forked.work.work_id);
    expect(validateWorkProof(honest).valid).toBe(true);
    expect(honest.final_status).toBe("PARTIAL");
    expect(honest.final_status).not.toBe("PROVEN");
    expect(honest.generated_by.verifier_id).not.toBe(WORKER_ID);
    expect(sealed.authority_model).toBe(CAPSULE_AUTHORITY_MODEL);
    expect(existsSync(w.root)).toBe(true);
  });

  it("does not copy artifacts as live blobs onto the fork; hash refs stay VERIFIED", async () => {
    const w = world();
    const seeded = await seedLedgerWork(w);
    const forked = await w.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint.checkpoint_id,
    });
    const code = await putAndRegisterArtifact(w.m02, {
      work_id: seeded.work_id,
      bytes: CODE_BYTES,
      media_type: "text/plain",
      origin: { task_id: seeded.task_id, executor_ref: { executor_id: WORKER_ID, executor_version: "1.0.0" } },
    });
    expect(forked.referenced_artifacts.some((a) => a.verify === "VERIFIED")).toBe(true);
    expect(forked.referenced_history.copied_as_live_events).toBe(false);
    expect(forked.work.work_id).not.toBe(seeded.work_id);
    expect(code.artifact.work_id).toBe(seeded.work_id);
  });
});
