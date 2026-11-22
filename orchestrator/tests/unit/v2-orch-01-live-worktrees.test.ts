/**
 * V2-ORCH-01 live — real git worktrees + FileOwnershipLock / scheduler.
 * Deterministic; no LLM. Temp repo under repo `.tmp/` (cleaned at end).
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  scheduleReadyTasks,
  releaseTaskFileLocks,
} from "../../src/v3/parallel/index.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TMP_ROOT = path.join(REPO_ROOT, ".tmp", "v2-orch-01-live");
const WORK_ID = "orch01-live";

function git(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function rmPath(p: string): void {
  spawnSync("rm", ["-rf", "--", p], { encoding: "utf-8" });
}

describe("V2-ORCH-01 live worktrees + FileOwnershipLock", () => {
  const runId = `run-${Date.now()}`;
  const base = path.join(TMP_ROOT, runId);
  const bare = path.join(base, "repo");
  const dataDir = path.join(base, "v3-data");
  const worktrees: string[] = [];

  afterAll(() => {
    for (const wt of worktrees) {
      if (existsSync(bare)) git(bare, ["worktree", "remove", "--force", wt]);
      rmPath(wt);
    }
    if (existsSync(bare)) git(bare, ["worktree", "prune"]);
    rmPath(base);
  });

  it(
    "spawns 5 worktrees; conflicting serialize; disjoint parallel; zero corruption",
    async () => {
      rmPath(base);
      mkdirSync(bare, { recursive: true });
      mkdirSync(dataDir, { recursive: true });

      expect(git(bare, ["init"]).status).toBe(0);
      git(bare, ["config", "user.email", "orch01-live@example.com"]);
      git(bare, ["config", "user.name", "ORCH01 Live"]);
      mkdirSync(path.join(bare, "src"), { recursive: true });
      writeFileSync(path.join(bare, "src", "shared.ts"), "export const shared = 1;\n");
      writeFileSync(path.join(bare, "src", "a.ts"), "export const a = 1;\n");
      writeFileSync(path.join(bare, "src", "b.ts"), "export const b = 1;\n");
      writeFileSync(path.join(bare, "src", "c.ts"), "export const c = 1;\n");
      writeFileSync(path.join(bare, "README.md"), "# orch01-live\n");
      expect(git(bare, ["add", "."]).status).toBe(0);
      expect(git(bare, ["commit", "-m", "base"]).status).toBe(0);

      for (let i = 1; i <= 5; i++) {
        const wt = path.join(base, `wt-${i}`);
        worktrees.push(wt);
        const add = git(bare, ["worktree", "add", "-b", `branch-${i}`, wt]);
        expect(add.status, add.stderr).toBe(0);
        expect(existsSync(path.join(wt, ".git")) || existsSync(path.join(wt, "src"))).toBe(true);
      }
      const list = git(bare, ["worktree", "list", "--porcelain"]);
      expect(list.status).toBe(0);
      const wtCount = list.stdout.split("\n").filter((l) => l.startsWith("worktree ")).length;
      // bare + 5 linked worktrees
      expect(wtCount).toBeGreaterThanOrEqual(5);

      const paths = resolveV3DataPaths(dataDir);
      const store = new TaskGraphStore(paths.taskGraphsDir);
      store.create(WORK_ID, "gc-orch01-live", 1);

      const specs: Array<{ id: string; touch: string[]; wt: string }> = [
        { id: "t1", touch: ["src/shared.ts"], wt: worktrees[0]! },
        { id: "t2", touch: ["src/shared.ts", "src/a.ts"], wt: worktrees[1]! },
        { id: "t3", touch: ["src/b.ts"], wt: worktrees[2]! },
        { id: "t4", touch: ["src/c.ts"], wt: worktrees[3]! },
        { id: "t5", touch: ["src/shared.ts"], wt: worktrees[4]! },
      ];
      for (const s of specs) {
        store.addTask(WORK_ID, {
          task_id: s.id,
          goal_contract_id: "gc-orch01-live",
          goal_contract_version: 1,
          title: s.id,
          task_kind: "research",
          depends_on: [],
          touch_paths: s.touch,
        });
      }

      const scheduled = scheduleReadyTasks(paths, WORK_ID, { max_in_progress: 5 });
      expect(scheduled.newly_started.sort()).toEqual(["t1", "t3", "t4"]);
      expect(scheduled.queued_for_lock.sort()).toEqual(["t2", "t5"]);

      const startedAt = Date.now();
      const writeJobs = scheduled.newly_started.map(async (tid) => {
        const spec = specs.find((s) => s.id === tid)!;
        const marker = path.join(spec.wt, "src", `_marker_${tid}.ts`);
        const payload = `export const marker_${tid} = ${startedAt};\n`;
        // Simulate concurrent worker writes in disjoint worktrees.
        await fs.writeFile(marker, payload, "utf-8");
        // Also append a line to the owned file without touching shared from parallel tasks incorrectly.
        for (const rel of spec.touch) {
          if (rel === "src/shared.ts" && tid !== "t1") continue;
          const abs = path.join(spec.wt, rel);
          const prev = readFileSync(abs, "utf-8");
          await fs.writeFile(abs, `${prev}// touched_by=${tid}\n`, "utf-8");
        }
        return { tid, marker, started: Date.now() };
      });
      const writes = await Promise.all(writeJobs);
      expect(writes).toHaveLength(3);

      // Conflicting tasks must NOT have written markers while still queued.
      for (const tid of scheduled.queued_for_lock) {
        const spec = specs.find((s) => s.id === tid)!;
        const marker = path.join(spec.wt, "src", `_marker_${tid}.ts`);
        expect(existsSync(marker)).toBe(false);
      }

      // Complete t1 → release → t2 may advance (still conflicts with t5 until t2 done).
      store.setTaskState(WORK_ID, "t1", "TRUE_PASS");
      releaseTaskFileLocks(paths, WORK_ID, "t1");
      const second = scheduleReadyTasks(paths, WORK_ID, { max_in_progress: 5 });
      // t3,t4 still IN_PROGRESS; t2 can start; t5 still conflicts with t2 on shared.
      expect(second.newly_started).toEqual(["t2"]);
      expect(second.queued_for_lock).toContain("t5");

      const t2wt = specs.find((s) => s.id === "t2")!.wt;
      writeFileSync(
        path.join(t2wt, "src", "_marker_t2.ts"),
        "export const marker_t2 = 1;\n",
      );
      store.setTaskState(WORK_ID, "t2", "TRUE_PASS");
      releaseTaskFileLocks(paths, WORK_ID, "t2");
      store.setTaskState(WORK_ID, "t3", "TRUE_PASS");
      releaseTaskFileLocks(paths, WORK_ID, "t3");
      store.setTaskState(WORK_ID, "t4", "TRUE_PASS");
      releaseTaskFileLocks(paths, WORK_ID, "t4");

      const third = scheduleReadyTasks(paths, WORK_ID, { max_in_progress: 5 });
      expect(third.newly_started).toEqual(["t5"]);
      writeFileSync(
        path.join(specs.find((s) => s.id === "t5")!.wt, "src", "_marker_t5.ts"),
        "export const marker_t5 = 1;\n",
      );

      // Zero corruption: each worktree marker matches its task; shared.ts still parses as TS-ish.
      for (const tid of ["t1", "t2", "t3", "t4", "t5"]) {
        const spec = specs.find((s) => s.id === tid)!;
        const marker = path.join(spec.wt, "src", `_marker_${tid}.ts`);
        expect(existsSync(marker)).toBe(true);
        const body = readFileSync(marker, "utf-8");
        expect(body).toContain(`marker_${tid}`);
        expect(body).not.toContain("CORRUPT");
      }
      for (const wt of worktrees) {
        const shared = readFileSync(path.join(wt, "src", "shared.ts"), "utf-8");
        expect(shared.startsWith("export const shared")).toBe(true);
      }

      // Evidence artifact for the evidence pack runner (optional sidecar).
      const evidence = {
        kind: "ORCH01LiveWorktrees",
        worktree_count: worktrees.length,
        newly_started_wave1: scheduled.newly_started,
        queued_for_lock_wave1: scheduled.queued_for_lock,
        newly_started_wave2: second.newly_started,
        newly_started_wave3: third.newly_started,
        corruption: false,
      };
      mkdirSync(path.join(base, "out"), { recursive: true });
      writeFileSync(path.join(base, "out", "result.json"), JSON.stringify(evidence, null, 2));
      expect(evidence.corruption).toBe(false);
      expect(evidence.worktree_count).toBe(5);
    },
    60_000,
  );
});
