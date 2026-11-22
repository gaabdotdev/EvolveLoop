/**
 * V5-M07 — Unified Experience: work list/status, mode preference, CLI/TUI bridge.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistentWorkRuntime } from "../../src/v3/work-runtime/index.js";
import {
  EXPERIENCE_HELP_LAYERS,
  readSharedWorkState,
  resolveExperienceMode,
  workStatusForTui,
  writeWorkspaceExperienceMode,
} from "../../src/v3/experience/index.js";
import { handleWorkSurface } from "../../src/cli/work-surface.js";
import {
  helpForExperienceMode,
  handleModeSurface,
} from "../../src/cli/mode-surface.js";
import {
  describeHelpLayers,
  formatAdvancedHelp,
  formatJourneyHelp,
} from "../../src/cli/help-usage.js";

describe("V5-M07 Unified Experience", () => {
  const dirs: string[] = [];

  afterEach(() => {
    delete process.env.EVOLVELOOP_EXPERIENCE_MODE;
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshWs(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m07-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("listWorks + statusSummary from PersistentWorkRuntime", () => {
    const ws = freshWs("list");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-a",
      objective: "Alpha",
      tasks: [{ task_id: "t1", title: "T1" }],
    });
    rt.open({
      work_id: "w-b",
      objective: "Beta",
      tasks: [{ task_id: "t2", title: "T2" }],
    });
    rt.createAttempt({ work_id: "w-a", task_id: "t1" });

    const list = rt.listWorks();
    expect(list.map((w) => w.work_id).sort()).toEqual(["w-a", "w-b"]);
    expect(list.find((w) => w.work_id === "w-a")?.attempt_count).toBe(1);

    const summary = rt.statusSummary();
    expect(summary.kind).toBe("WorkStatusSummary");
    expect(summary.total_works).toBe(2);
    expect(summary.total_attempts).toBe(1);
    expect(summary.by_state.IN_PROGRESS).toBe(2);

    const one = rt.statusSummary("w-a");
    expect(one.work_id).toBe("w-a");
    expect(one.total_works).toBe(1);
    rt.close();
  });

  it("CLI work list|status uses same bridge as TUI helper", () => {
    const ws = freshWs("bridge");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({ work_id: "w-bridge", objective: "Bridge parity" });
    rt.close();

    const snap = readSharedWorkState({ workspaceRoot: ws });
    expect(snap.source).toBe("PersistentWorkRuntime");
    expect(snap.list.some((w) => w.work_id === "w-bridge")).toBe(true);

    const tui = workStatusForTui(ws);
    expect(tui.total_works).toBe(snap.summary.total_works);
    expect(tui.works.map((w) => w.work_id)).toEqual(
      snap.summary.works.map((w) => w.work_id),
    );

    const printed: unknown[] = [];
    const listResult = handleWorkSurface(
      { group: "work", command: "list", workspace: ws, format: "json" },
      {
        printJson: (o) => printed.push(o),
        argv: ["node", "evolve", "work", "list", "--format", "json"],
      },
    );
    expect(listResult.handled).toBe(true);
    expect(listResult.exitCode).toBe(0);
    const listPayload = printed[0] as { works: Array<{ work_id: string }> };
    expect(listPayload.works.some((w) => w.work_id === "w-bridge")).toBe(true);

    printed.length = 0;
    const statusResult = handleWorkSurface(
      { group: "work", command: "status", workspace: ws, format: "json" },
      {
        printJson: (o) => printed.push(o),
        argv: ["node", "evolve", "work", "status", "--format", "json"],
      },
    );
    expect(statusResult.handled).toBe(true);
    const statusPayload = printed[0] as { kind: string; total_works: number };
    expect(statusPayload.kind).toBe("WorkStatusSummary");
    expect(statusPayload.total_works).toBe(tui.total_works);
  });

  it("experience mode preference persists and maps to help layers", () => {
    const ws = freshWs("mode");
    const def = resolveExperienceMode({ workspace: ws });
    expect(def.mode).toBe("simple");
    expect(def.help_layer).toBe("journey");
    expect(def.source).toBe("default");

    const path = writeWorkspaceExperienceMode(ws, "advanced");
    const yaml = readFileSync(path, "utf-8");
    expect(yaml).toMatch(/experience:/);
    expect(yaml).toMatch(/mode:\s*advanced/);

    const pref = resolveExperienceMode({ workspace: ws });
    expect(pref.mode).toBe("advanced");
    expect(pref.help_layer).toBe("advanced");
    expect(pref.source).toBe("workspace");

    const layers = describeHelpLayers();
    expect(layers.simple.cli).toBe(EXPERIENCE_HELP_LAYERS.simple.cli);
    expect(layers.advanced.cli).toBe(EXPERIENCE_HELP_LAYERS.advanced.cli);

    const simpleHelp = helpForExperienceMode("simple");
    const advancedHelp = helpForExperienceMode("advanced");
    expect(simpleHelp).toContain("Simple");
    expect(simpleHelp).toContain("evolve work list");
    expect(advancedHelp).toContain('"layer": "advanced"');
    expect(formatJourneyHelp()).toBe(simpleHelp);
    expect(formatAdvancedHelp()).toBe(advancedHelp);

    const printed: unknown[] = [];
    const r = handleModeSurface(
      { group: "mode", command: "simple", workspace: ws, format: "json" },
      {
        printJson: (o) => printed.push(o),
        argv: ["node", "evolve", "mode", "simple"],
      },
    );
    expect(r.handled).toBe(true);
    expect(r.exitCode).toBe(0);
    expect((printed[0] as { mode: string }).mode).toBe("simple");
    expect(resolveExperienceMode({ workspace: ws }).mode).toBe("simple");
  });
});
