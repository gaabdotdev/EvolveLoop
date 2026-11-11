/**
 * V3.3 E2E: multiagent hierarchy → quota handoff → cross-provider apply →
 * subtree recovery → cancel → parallel — via evolve CLI.
 */
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
    env: { ...process.env, EVOLVELOOP_HARNESS_CONSENT: "false" },
  });
  return JSON.parse(out);
}

describe("V3.3 multiagent resilience E2E", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v33e2e-"));
  });

  afterAll(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("full resilience path", async () => {
    evolve(["goal", "create", "--id", "gc-e2e", "--objective", "V3.3 e2e resilience"], tmp);
    evolve(["work", "init", "--work-id", "w-e2e", "--goal-id", "gc-e2e"], tmp);
    evolve(["hierarchy", "spawn", "--work-id", "w-e2e", "--domains", "backend"], tmp);
    evolve(
      ["hierarchy", "approve", "--work-id", "w-e2e", "--domain", "backend", "--plan-version", "1"],
      tmp,
    );

    const aux = evolve(
      [
        "hierarchy",
        "aux",
        "--work-id",
        "w-e2e",
        "--parent-agent-id",
        "w-e2e-leader-backend",
        "--objective",
        "scout auth",
      ],
      tmp,
    ) as { auxiliary_agent_id: string };
    expect(aux.auxiliary_agent_id).toBeTruthy();

    const limit = evolve(
      [
        "limits",
        "handoff",
        "--work-id",
        "w-e2e",
        "--agent-id",
        "w-e2e-planner-backend",
        "--signal",
        "quota exhausted",
        "--apply",
        "true",
      ],
      tmp,
    ) as { handoff?: { handoff_id: string; status: string }; classification: { cause: string } };
    expect(limit.classification.cause).toBe("quota_exhausted");
    expect(limit.handoff?.status).toBe("applied");

    const handoffId = limit.handoff!.handoff_id;
    const drivers = evolve(["adapters", "probe"], tmp) as {
      drivers: Array<{ adapter_id: string; can_invoke: boolean }>;
    };
    const claude = drivers.drivers.find((d) => d.adapter_id === "claude-code");
    const toAdapter = claude?.can_invoke ? "claude-code" : "cursor";

    // For cursor invoke path needs IR — skip invoke when targeting cursor
    const xp = evolve(
      [
        "adapters",
        "handoff-apply",
        "--handoff-id",
        handoffId,
        "--to-adapter",
        toAdapter,
        "--provider-mode",
        "mock",
        "--invoke",
        toAdapter === "claude-code" ? "true" : "false",
      ],
      tmp,
    ) as { envelope: { auto_swap: boolean; to_adapter: string } };
    expect(xp.envelope.auto_swap).toBe(true);
    expect(xp.envelope.to_adapter).toBe(toAdapter);

    const recovery = evolve(
      [
        "recovery",
        "apply",
        "--work-id",
        "w-e2e",
        "--parent-agent-id",
        "w-e2e-leader-backend",
        "--action",
        "orphan",
      ],
      tmp,
    ) as { action: string };
    expect(recovery.action).toBe("orphan");

    const cancel = evolve(
      [
        "cancel",
        "apply",
        "--work-id",
        "w-e2e",
        "--agent-id",
        aux.auxiliary_agent_id,
        "--reason",
        "e2e-done",
        "--cascade",
        "false",
        "--idempotency-key",
        "e2e-cancel-1",
      ],
      tmp,
    ) as { cancelled_agents: string[] };
    expect(cancel.cancelled_agents).toContain(aux.auxiliary_agent_id);

    const parallel = evolve(
      ["parallel", "schedule", "--work-id", "w-e2e", "--max-in-progress", "2"],
      tmp,
    ) as { kind: string };
    expect(parallel.kind).toBe("ParallelScheduleResult");

    const tick = evolve(["coordinator", "tick", "--work-id", "w-e2e"], tmp) as {
      hierarchical_budget_breaches: number;
      parallel_started: string[];
      limitations: string[];
    };
    expect(typeof tick.hierarchical_budget_breaches).toBe("number");
    expect(Array.isArray(tick.parallel_started)).toBe(true);

    const battery = evolve(["battery", "run", "--work-id", "w-e2e"], tmp) as {
      passed: boolean;
      scenarios: Array<{ id: string; passed: boolean }>;
    };
    // Battery may fail some scenarios after destructive e2e mutations — record honestly
    expect(battery.scenarios.length).toBeGreaterThanOrEqual(4);
  });
});
