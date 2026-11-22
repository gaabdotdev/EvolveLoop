import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evolveCli = path.join(__dirname, "../../dist/cli/evolve.js");

function evolve(args: string[], dataDir: string): unknown {
  const out = execFileSync(process.execPath, [evolveCli, ...args, "--data-dir", dataDir], {
    encoding: "utf-8",
  });
  return JSON.parse(out);
}

describe("evolve CLI integration", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evolve-cli-"));
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("goal → work → task plan approve → coordinator tick survives stop", () => {
    const goal = evolve(
      ["goal", "create", "--id", "gc-cli", "--objective", "CLI foundation"],
      tmp,
    ) as { version: number };
    expect(goal.version).toBe(1);

    const work = evolve(
      ["work", "init", "--work-id", "w-cli", "--goal-id", "gc-cli"],
      tmp,
    ) as { master: string };
    expect(work.master).toBe("w-cli-master");

    evolve(
      [
        "task",
        "add",
        "--work-id",
        "w-cli",
        "--goal-id",
        "gc-cli",
        "--task-id",
        "plan-be",
        "--title",
        "Plan backend",
        "--domain",
        "backend",
      ],
      tmp,
    );
    const approved = evolve(
      [
        "task",
        "approve-plan",
        "--work-id",
        "w-cli",
        "--task-id",
        "plan-be",
        "--plan-version",
        "1",
      ],
      tmp,
    ) as { tasks: Array<{ task_id: string; plan_approved?: boolean }> };
    expect(approved.tasks.find((t) => t.task_id === "plan-be")?.plan_approved).toBe(true);

    evolve(["coordinator", "start"], tmp);
    evolve(["coordinator", "stop", "--reason", "simulate_tui_close"], tmp);
    const tick = evolve(["coordinator", "tick", "--work-id", "w-cli"], tmp) as {
      work_state: string;
      true_full_pass_eligible: boolean;
    };
    expect(tick.true_full_pass_eligible).toBe(false);
    expect(["IN_PROGRESS", "RECOVERY", "NOT_PASS"]).toContain(tick.work_state);

    // Status after "UI closed"
    const status = evolve(["work", "status", "--work-id", "w-cli"], tmp) as {
      agents_summary: Array<{ id: string }>;
    };
    expect(status.agents_summary.some((a) => a.id === "w-cli-master")).toBe(true);
  });
});
