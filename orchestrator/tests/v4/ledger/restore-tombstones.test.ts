import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { restoreWorkDir } from "../../../src/v4/checkpoint/index.js";
import { EFFECT, WORK, draft, runtime, workCreated } from "./helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M02 restore — D19 tombstones", () => {
  it("does not resurrect a consumed grant after restoring an older tree", async () => {
    const live = runtime();
    const backup = runtime();
    roots.push(live.root, backup.root);
    await live.rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    await live.rt.tombstones.recordGrantConsumed(WORK, "grant_ref_opaque_1", "2026-11-15T12:00:00.000Z");
    const recovered = await restoreWorkDir({
      work_id: WORK,
      liveRoot: live.root,
      restoredRoot: backup.root,
      ledger: live.rt.ledger,
      checkpoints: live.rt.checkpoints,
      tombstones: live.rt.tombstones,
    });
    expect(recovered.consumed_grants).toContain("grant_ref_opaque_1");
  });

  it("will not roll a COMMITTED effect back to uncommitted", async () => {
    const live = runtime();
    const backup = runtime();
    roots.push(live.root, backup.root);
    await live.rt.ledger.append(
      WORK,
      [
        workCreated(),
        draft("effect.planned", { effect_id: EFFECT, state: "PLANNED" }),
        draft("effect.state_changed", { effect_id: EFFECT, state: "DISPATCHED" }),
      ],
      { expected_head_seq: 0 },
    );
    await live.rt.tombstones.recordEffectTerminal(WORK, EFFECT, "COMMITTED", "2026-11-15T12:00:00.000Z");
    await backup.rt.tombstones.recordEffectTerminal(WORK, EFFECT, "COMMITTED", "2026-11-15T11:00:00.000Z");
    const recovered = await restoreWorkDir({
      work_id: WORK,
      liveRoot: live.root,
      restoredRoot: backup.root,
      ledger: live.rt.ledger,
      checkpoints: live.rt.checkpoints,
      tombstones: live.rt.tombstones,
    });
    const eff = recovered.projection.effect_summary.find((e) => e.effect_id === EFFECT);
    expect(eff?.state).toBe("COMMITTED");
  });

  it("refuses a path-like grant_ref as a path component (R5)", async () => {
    const opened = runtime();
    roots.push(opened.root);
    await expect(opened.rt.tombstones.recordGrantConsumed(WORK, "../etc/passwd", "2026-11-15T12:00:00.000Z")).rejects.toThrow(
      /grant_ref_not_path_safe/,
    );
  });
});
