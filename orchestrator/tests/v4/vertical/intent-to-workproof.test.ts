/**
 * M19 vertical slice — Intent → Goal Contract → M02 Event Ledger → M03 effects
 * → M06 WorkProof. Honesty: verifier ≠ subject; self-report cannot yield PROVEN;
 * open effects cap PROVEN at PARTIAL (frozen deriveFinalStatus).
 *
 * IsolatedEventBuffer (M01 isolation) is not the Event Ledger. This file composes
 * public exports only; contracts/** are not edited.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  checkEventStream,
  isIndependent,
  isValidId,
  validateWorkProof,
} from "../../../src/v4/contracts/index.js";
import { FileEventLedger } from "../../../src/v4/ledger/index.js";
import { IsolatedEventBuffer } from "../../../src/v4/work/index.js";
import { V4_CLI_STORE_FALLBACK } from "../../../src/v4/adapters/v37/index.js";
import { REDACTED } from "../../../src/v4/observability/index.js";
import {
  HUMAN,
  NOW,
  WORKER,
  WORKER_ID,
  allocateId,
  assertM02Ledger,
  bindWorkPolicy,
  commitEffect,
  eventsJsonlExists,
  ledgerTypes,
  makeExecution,
  markedIntent,
  openVerticalWorld,
  planAuthorizedEffect,
  proofBuilder,
  redactCanaryLine,
  registerCodeAndReport,
  type VerticalWorld,
} from "./helpers.js";

const roots: string[] = [];

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function world(): VerticalWorld {
  const w = openVerticalWorld();
  roots.push(w.root);
  return w;
}

async function ingestAcceptedPlanned(w: VerticalWorld) {
  assertM02Ledger(w);
  expect(w.m02.ledger).toBeInstanceOf(FileEventLedger);
  expect(w.m02.ledger instanceof IsolatedEventBuffer).toBe(false);
  expect(V4_CLI_STORE_FALLBACK).toBe(false);

  const ingested = await w.engine.ingest(markedIntent());
  expect(ingested.status).toBe("OK");
  if (ingested.status !== "OK") throw new Error("ingest failed");
  expect(ingested.contract.status).toBe("DRAFT");
  expect(ingested.questions.filter((q) => q.blocking)).toEqual([]);
  expect(isValidId("work", ingested.work.work_id)).toBe(true);
  expect(eventsJsonlExists(w, ingested.work.work_id)).toBe(true);

  const accepted = await w.engine.acceptGoal(ingested.work.work_id, HUMAN);
  expect(accepted.status).toBe("OK");
  if (accepted.status !== "OK") throw new Error("accept failed");
  expect(accepted.contract.status).toBe("ACCEPTED");

  const planned = await w.engine.planTasks(ingested.work.work_id, HUMAN, [
    {
      title: "Implement vertical slice artifact",
      task_kind: "IMPLEMENT",
      expected_result: "content-addressed source + independent test report",
      criterion_refs: ["crit_1"],
    },
  ]);
  expect(planned.status).toBe("OK");
  if (planned.status !== "OK") throw new Error("plan failed");
  const task = planned.tasks[0]!;
  const running = await w.engine.changeTaskState(ingested.work.work_id, WORKER, {
    task_id: task.task_id,
    to: "RUNNING",
  });
  expect(running.status).toBe("OK");
  const claimed = await w.engine.changeTaskState(ingested.work.work_id, WORKER, {
    task_id: task.task_id,
    to: "SUCCEEDED_UNVERIFIED",
  });
  expect(claimed.status).toBe("OK");
  if (claimed.status === "OK") expect(claimed.task.progress_status).toBe("UNVERIFIED");

  const events = await w.m02.ledger.read(ingested.work.work_id);
  expect(checkEventStream(events)).toEqual([]);
  expect(ledgerTypes(events)).toEqual(expect.arrayContaining([
    "work.created",
    "goal_contract.versioned",
    "goal_contract.accepted",
    "task.planned",
    "task.state_changed",
  ]));
  expect(events[0]!.prev_event_digest).toBe("GENESIS");
  expect(events[0]!.recorded_at).toBe(NOW);

  return { work_id: ingested.work.work_id, contract: accepted.contract, task_id: task.task_id };
}

describe("V4 vertical slice — Intent → M02 ledger → M03 → M06 WorkProof", () => {
  it("compiles marked intent onto FileEventLedger and issues honest independent PROVEN", async () => {
    const w = world();
    const { work_id, contract, task_id } = await ingestAcceptedPlanned(w);
    const criterion_id = contract.acceptance_criteria[0]!.criterion_id;
    expect(criterion_id).toBe("crit_1");

    bindWorkPolicy(w, work_id);
    const denied = await w.v37Policy.decide({
      work_id,
      task_id,
      subject: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      action: "network.egress",
      resource: "https://example.invalid",
      environment: "dev",
      risk: "low",
    });
    expect(denied.decision).toBe("DENY");
    expect(denied.reason).toBe("deny_by_default_no_match");

    const writeReq = {
      work_id,
      task_id,
      subject: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      action: "filesystem.write",
      resource: "/workspace/src/app.ts",
      environment: "dev",
      risk: "high" as const,
    };
    const needsGrant = await w.v37Policy.decide(writeReq);
    expect(needsGrant.decision).toBe("REQUIRE_APPROVAL");
    const operator = w.authn.issue("operator-vertical");
    const pending = w.policy.pendingForDecision(needsGrant.decision_id);
    expect(pending).toBeDefined();
    const approved = w.v37Policy.approve({
      approval_id: pending!.approval_id,
      operator_token: operator.token,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok || !approved.grant) throw new Error("expected grant");

    const execution_id = allocateId("execution");
    w.executions = [makeExecution({ work_id, task_id, execution_id })];

    const ckptHead = await w.m02.ledger.head(work_id);
    const ckpt = await w.m02.checkpoints.create(work_id, ckptHead);
    expect(["VERIFIED", "UNVERIFIED", "INCONSISTENT"]).toContain(ckpt.consistency);
    expect(ckpt.goal_contract_ref.id).toBe(contract.goal_contract_id);

    await registerCodeAndReport(w, { work_id, task_id, execution_id, criterion_id });

    const dispatched = await planAuthorizedEffect(w, {
      work_id,
      task_id,
      execution_id,
      policy_decision_id: needsGrant.decision_id,
    });
    const consumed = w.policy.consumeGrant({
      grant_id: approved.grant.grant_id,
      effect_id: dispatched.effect_id,
      work_id,
      action: "filesystem.write",
      resource: "/workspace/src/app.ts",
    });
    expect(consumed.ok).toBe(true);

    const selfBuilder = proofBuilder(w, { runVerifiersOnBuild: false, idsTag: "self" });
    const self = await selfBuilder.recordSelfReport({
      work_id,
      goal_contract: contract,
      criterion_id,
      subject_executor: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      summary: "I ran the tests and they passed",
      evidence_kind: "unit_test",
      tested_artifacts: [{ sha256: (await w.m02.artifacts.listMeta()).find((a) => a.content.media_type === "text/plain")!.content.sha256 }],
    });
    expect(self.method.kind).toBe("SELF_REPORTED");
    expect(isIndependent(self)).toBe(false);
    const unverified = await selfBuilder.build(work_id);
    expect(unverified.final_status).toBe("UNVERIFIED");
    expect(unverified.final_status).not.toBe("PROVEN");
    expect(unverified.limitations.some((l) => l.includes("result_claim"))).toBe(true);

    await commitEffect(w, dispatched, work_id);

    const canary = redactCanaryLine();
    expect(canary.redacted).toBe(REDACTED);
    expect(canary.redacted).not.toContain("Bearer");
    w.obs.emitFromControlPlane(
      {
        event_name: "checkpoint.created",
        provenance: { kind: "OBSERVED" },
        correlation: { run_id: "run_v4_vertical", work_id },
        attributes: { checkpoint_id: ckpt.checkpoint_id, note: canary.raw },
      },
      { component: "v4-control-plane", module: "vertical-slice" },
    );
    const ce = w.obs.acceptedEvents().find((e) => e.event_name === "checkpoint.created");
    expect(ce?.provenance.kind).toBe("OBSERVED");
    expect(JSON.stringify(ce)).not.toMatch(/Bearer\s+a{20}/);

    const proven = await proofBuilder(w, { idsTag: "ind" }).build(work_id);
    expect(validateWorkProof(proven).valid).toBe(true);
    expect(proven.final_status).toBe("PROVEN");
    expect(proven.supersedes_proof_id).toBe(unverified.proof_id);
    expect(proven.generated_by.verifier_id).not.toBe(WORKER_ID);
    expect(JSON.stringify(proven)).not.toMatch(/confidence/);

    const stream = await w.m02.ledger.read(work_id);
    expect(checkEventStream(stream)).toEqual([]);
    expect(ledgerTypes(stream)).toEqual(expect.arrayContaining([
      "effect.planned",
      "effect.state_changed",
      "artifact.registered",
      "evidence.recorded",
      "proof.issued",
      "checkpoint.created",
    ]));
    expect(existsSync(w.root)).toBe(true);
  });

  it("caps an otherwise independent proof at PARTIAL while an effect is still DISPATCHED", async () => {
    const w = world();
    const { work_id, contract, task_id } = await ingestAcceptedPlanned(w);
    const criterion_id = contract.acceptance_criteria[0]!.criterion_id;
    bindWorkPolicy(w, work_id);

    const allow = await w.v37Policy.decide({
      work_id,
      task_id,
      subject: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      action: "filesystem.write",
      resource: "/workspace/src/app.ts",
      environment: "dev",
      risk: "low",
    });
    expect(allow.decision).toBe("ALLOW");

    const execution_id = allocateId("execution");
    w.executions = [makeExecution({ work_id, task_id, execution_id })];
    await registerCodeAndReport(w, { work_id, task_id, execution_id, criterion_id });
    const open = await planAuthorizedEffect(w, {
      work_id,
      task_id,
      execution_id,
      policy_decision_id: allow.decision_id,
    });
    expect(open.state).toBe("DISPATCHED");
    expect((await w.effects.listOpen(work_id)).map((e) => e.effect_id)).toContain(open.effect_id);

    const proof = await proofBuilder(w, { idsTag: "open" }).build(work_id);
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.status).toBe("PROVEN");
    expect(proof.final_status).not.toBe("PROVEN");
  });
});
