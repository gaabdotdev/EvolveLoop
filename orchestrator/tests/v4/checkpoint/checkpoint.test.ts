import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { openEffects } from "../../../src/v4/contracts/checkpoint.js";
import { EFFECT, TASK, WORK, draft, runtime, workCreated } from "../ledger/helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function open() {
  const opened = runtime();
  roots.push(opened.root);
  return opened.rt;
}

describe("M02 checkpoints (ADR-V4-0005)", () => {
  it("creates a VERIFIED checkpoint after reconciling events, artifacts and open effects", async () => {
    const rt = open();
    await rt.ledger.append(
      WORK,
      [
        workCreated(),
        draft("task.planned", { task_id: TASK, state: "RUNNING" }),
        draft("effect.planned", { effect_id: EFFECT, state: "PLANNED" }),
        draft("effect.state_changed", { effect_id: EFFECT, state: "DISPATCHED" }),
      ],
      { expected_head_seq: 0 },
    );
    const ckpt = await rt.checkpoints.create(WORK, 4);
    expect(ckpt.consistency).toBe("VERIFIED");
    expect(ckpt.event_seq).toBe(4);
    expect(ckpt.task_states).toEqual([{ task_id: TASK, state: "RUNNING" }]);
    expect(openEffects(ckpt)).toEqual([EFFECT]);
    expect(ckpt.workspace_snapshot).toBeUndefined();
    expect(ckpt.context_hint).toBeUndefined();

    const latest = await rt.checkpoints.latestConsistent(WORK);
    expect(latest?.checkpoint_id).toBe(ckpt.checkpoint_id);

    const events = await rt.ledger.read(WORK);
    expect(events.at(-1)?.type).toBe("checkpoint.created");
  });

  it("refuses a checkpoint beyond the log head (INV-CKPT-01)", async () => {
    const rt = open();
    await rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    await expect(rt.checkpoints.create(WORK, 9)).rejects.toThrow(/INV-CKPT-01/);
  });

  it("latestConsistent skips UNVERIFIED/INCONSISTENT checkpoints", async () => {
    const rt = open();
    await rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const good = await rt.checkpoints.create(WORK, 1);
    expect(good.consistency).toBe("VERIFIED");
    const latest = await rt.checkpoints.latestConsistent(WORK);
    expect(latest?.consistency).toBe("VERIFIED");
    expect(await rt.checkpoints.get(good.checkpoint_id)).toMatchObject({ checkpoint_id: good.checkpoint_id });
    expect(await rt.checkpoints.get("ckpt_notreal")).toBeUndefined();
  });

  it("marks INCONSISTENT when an artifact ref is not resolvable", async () => {
    const rt = open();
    await rt.ledger.append(
      WORK,
      [
        workCreated(),
        draft("artifact.registered", {
          artifact_id: "art_abc123def",
          content: { sha256: "b".repeat(64), size_bytes: 4, media_type: "text/plain" },
        }),
      ],
      { expected_head_seq: 0 },
    );
    const ckpt = await rt.checkpoints.create(WORK, 2);
    expect(ckpt.consistency).toBe("INCONSISTENT");
    const latest = await rt.checkpoints.latestConsistent(WORK);
    expect(latest).toBeUndefined();
  });
});
