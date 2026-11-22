/**
 * V2-ORCH-03 — Idempotency Keys + Saga Compensations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { StateDb } from "../../src/v3/state-db/index.js";
import {
  IdempotencyStore,
  hashPayload,
  buildIdempotencyKey,
  IDEMPOTENCY_KEY_DIGEST,
  withIdempotency,
  IdempotencyConflictError,
  IdempotencyInFlightError,
  Saga,
  SagaRegistry,
  applyUnknownSagaCompensations,
  reconcileWorkOnBootWithSaga,
} from "../../src/v3/idempotency/index.js";
import { decideReconcile } from "../../src/v3/mso/index.js";
import type { BootReconcileReport } from "../../src/v3/mso/index.js";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v2-orch-03-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@evolveloop.local"]);
  git(root, ["config", "user.name", "EvolveLoop Test"]);
  writeFileSync(path.join(root, "README.md"), "# fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("V2-ORCH-03 Idempotency Keys + Saga Compensations", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-orch-03-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it("buildIdempotencyKey is deterministic (full sha256 hex)", () => {
    expect(IDEMPOTENCY_KEY_DIGEST).toBe("sha256-hex-full");
    const a = buildIdempotencyKey({
      contract_version: 3,
      task_id: "t-1",
      input_fingerprint: "fp-abc",
    });
    const b = buildIdempotencyKey({
      contract_version: 3,
      task_id: "t-1",
      input_fingerprint: "fp-abc",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);

    const c = buildIdempotencyKey({
      contract_version: "3",
      task_id: "t-1",
      input_fingerprint: "fp-abc",
    });
    expect(c).toBe(a);

    const d = buildIdempotencyKey({
      contract_version: 3,
      task_id: "t-1",
      input_fingerprint: "fp-OTHER",
    });
    expect(d).not.toBe(a);
  });

  it("same key + same fingerprint → replay; effect called once", async () => {
    const store = new IdempotencyStore(path.join(tmp, "idem"));
    const fingerprint = hashPayload({ op: "write", path: "a.txt" });
    const key = buildIdempotencyKey({
      contract_version: 1,
      task_id: "t-replay",
      input_fingerprint: fingerprint,
    });

    let calls = 0;
    const effect = async () => {
      calls += 1;
      return { ok: true, n: calls };
    };

    const first = await withIdempotency(
      store,
      { work_id: "w1", key, payload: { fingerprint } },
      effect,
    );
    expect(first.status).toBe("executed");
    expect(first.result).toEqual({ ok: true, n: 1 });

    const second = await withIdempotency(
      store,
      { work_id: "w1", key, payload: { fingerprint } },
      effect,
    );
    expect(second.status).toBe("replay");
    expect(second.result).toEqual({ ok: true, n: 1 });
    expect(calls).toBe(1);
  });

  it("same key + different fingerprint/payload → reject", async () => {
    const store = new IdempotencyStore(path.join(tmp, "idem"));
    const key = buildIdempotencyKey({
      contract_version: 1,
      task_id: "t-conflict",
      input_fingerprint: "fp-1",
    });

    await withIdempotency(
      store,
      { work_id: "w1", key, payload: { fingerprint: "fp-1" } },
      async () => ({ done: true }),
    );

    await expect(
      withIdempotency(
        store,
        { work_id: "w1", key, payload: { fingerprint: "fp-DIFFERENT" } },
        async () => ({ done: true }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("in-flight claim → typed IdempotencyInFlightError", async () => {
    const store = new IdempotencyStore(path.join(tmp, "idem"));
    const key = "lease-key-1";
    const payload = { x: 1 };

    const gate = store.beginOrReplay("w1", key, "effect", payload, { claim: true });
    expect(gate.status).toBe("fresh");

    await expect(
      withIdempotency(store, { work_id: "w1", key, payload }, async () => 1),
    ).rejects.toBeInstanceOf(IdempotencyInFlightError);

    store.abandon(gate.record);
  });

  it("saga: 2 steps, fail on 2nd → compensate 1st; state clean", async () => {
    const effects: string[] = [];
    const compensations: string[] = [];
    const saga = new Saga();

    await saga.runStep({
      name: "step-1",
      execute: () => {
        effects.push("step-1");
        return "ok-1";
      },
      compensate: () => {
        compensations.push("step-1");
      },
    });

    await expect(
      saga.runStep({
        name: "step-2",
        execute: () => {
          effects.push("step-2");
          throw new Error("step-2 failed");
        },
        compensate: () => {
          compensations.push("step-2");
        },
      }),
    ).rejects.toThrow(/step-2 failed/);

    expect(effects).toEqual(["step-1", "step-2"]);
    expect(saga.completedStepNames).toEqual(["step-1"]);
    expect(saga.isClean()).toBe(false);

    const report = await saga.compensateReverse();
    expect(report.compensated).toEqual(["step-1"]);
    expect(compensations).toEqual(["step-1"]);
    expect(saga.isClean()).toBe(true);
    expect(report.clean).toBe(true);
  });

  it("UNKNOWN path dispara saga compensations", async () => {
    const repo = await initRepo();
    const db = new StateDb(path.join(tmp, "state.db"));
    const wt = path.join(tmp, "dirty-wt");
    mkdirSync(wt, { recursive: true });
    git(repo, ["worktree", "add", "--detach", wt, "HEAD"]);
    writeFileSync(path.join(wt, "partial.txt"), "partial\n");

    const decision = decideReconcile({
      work_id: "w-unk",
      task_id: "t-partial",
      state: "IN_PROGRESS",
      payload: { pgid: 999999999, worktree_path: wt },
    });
    expect(decision.next_state).toBe("UNKNOWN");
    expect(decision.auto_retry_allowed).toBe(false);

    db.upsertTaskGraphNode({
      work_id: "w-unk",
      task_id: "t-partial",
      state: "IN_PROGRESS",
      payload: { pgid: 999999999, worktree_path: wt },
    });

    const compensations: string[] = [];
    const saga = new Saga();
    await saga.runStep({
      name: "reserve-lock",
      execute: () => "held",
      compensate: () => {
        compensations.push("reserve-lock");
      },
    });
    await saga.runStep({
      name: "write-partial",
      execute: () => "dirty",
      compensate: () => {
        compensations.push("write-partial");
      },
    });

    const registry = new SagaRegistry();
    registry.register("w-unk", "t-partial", saga);

    const report = await reconcileWorkOnBootWithSaga(db, "w-unk", registry);
    expect(report.unknown_tasks).toContain("t-partial");
    expect(report.saga_compensations.tasks).toHaveLength(1);
    expect(report.saga_compensations.tasks[0]?.reason).toBe("compensated_on_unknown");
    expect(report.saga_compensations.tasks[0]?.compensation?.compensated).toEqual([
      "write-partial",
      "reserve-lock",
    ]);
    expect(compensations).toEqual(["write-partial", "reserve-lock"]);
    expect(saga.isClean()).toBe(true);

    db.close();
    await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  it("applyUnknownSagaCompensations on synthetic UNKNOWN report", async () => {
    const compensations: string[] = [];
    const saga = new Saga();
    await saga.runStep({
      name: "a",
      execute: () => 1,
      compensate: () => {
        compensations.push("a");
      },
    });

    const registry = new SagaRegistry();
    registry.register("w-syn", "t-u", saga);

    const report: BootReconcileReport = {
      kind: "BootReconcileReport",
      work_id: "w-syn",
      examined: 1,
      decisions: [
        {
          task_id: "t-u",
          previous_state: "IN_PROGRESS",
          next_state: "UNKNOWN",
          reason: "partial_effect_dead_pgid_dirty_worktree",
          pgid_alive: false,
          worktree_dirty: true,
          auto_retry_allowed: false,
        },
      ],
      unknown_tasks: ["t-u"],
      notes: [],
    };

    const applied = await applyUnknownSagaCompensations(report, registry);
    expect(applied.tasks[0]?.compensation?.compensated).toEqual(["a"]);
    expect(compensations).toEqual(["a"]);
  });

  it("retry with same key after success does not duplicate effect (saga+idempotency)", async () => {
    const store = new IdempotencyStore(path.join(tmp, "idem"));
    const sideEffects: string[] = [];
    const fingerprint = hashPayload({ files: ["x"] });
    const key = buildIdempotencyKey({
      contract_version: 2,
      task_id: "t-once",
      input_fingerprint: fingerprint,
    });

    const run = () =>
      withIdempotency(store, { work_id: "w1", key, payload: { fingerprint } }, async () => {
        const saga = new Saga();
        await saga.runStep({
          name: "mutate",
          execute: () => {
            sideEffects.push("mutate");
            return "done";
          },
          compensate: () => {
            sideEffects.push("compensate");
          },
        });
        return { status: "ok" as const };
      });

    const first = await run();
    const second = await run();
    expect(first.status).toBe("executed");
    expect(second.status).toBe("replay");
    expect(sideEffects).toEqual(["mutate"]);
  });
});
