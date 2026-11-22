/**
 * V5-M02 — Capability profile honesty + deterministic scheduler + handoff/replace.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  adapterSatisfiesCapabilities,
  discoverCapabilityProfile,
  listCapabilityProfiles,
  replaceAgentPreservingWork,
  selectExecutor,
} from "../../src/v3/agent-orchestration/index.js";
import { PersistentWorkRuntime } from "../../src/v3/work-runtime/index.js";

describe("V5-M02 orchestration contracts", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshWorkspace(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m02-orch-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("capability profile discovery is honest (unsupported explicit, never upgraded)", () => {
    const profiles = listCapabilityProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(4);
    expect(profiles.every((p) => p.source === "AGENT_ADAPTER_CATALOG")).toBe(true);

    const cursor = discoverCapabilityProfile("cursor");
    expect(cursor.adapter_id).toBe("cursor");
    const streaming = cursor.capabilities.find((c) => c.key === "streaming");
    expect(streaming?.honesty).toBe("unsupported");
    expect(cursor.unsupported_or_unknown).toContain("streaming");
    expect(cursor.unsupported_or_unknown).toContain("cross_provider_swap");

    const swap = cursor.capabilities.find((c) => c.key === "cross_provider_swap");
    expect(swap?.honesty).toBe("unsupported");
    // Never invent full for unsupported
    expect(swap?.honesty).not.toBe("full");

    const check = adapterSatisfiesCapabilities(cursor, [
      "resume",
      "cross_provider_swap",
    ]);
    expect(check.ok).toBe(false);
    expect(check.missing).toContain("cross_provider_swap");
    expect(check.reasons.some((r) => r.includes("unsupported"))).toBe(true);

    expect(() => discoverCapabilityProfile("not-an-adapter")).toThrow(
      /UNKNOWN_ADAPTER/,
    );
  });

  it("scheduler selects deterministically by capability + preference (no ML)", () => {
    const req = {
      required_capabilities: ["resume" as const],
      preferred_adapters: ["claude-code" as const, "cursor" as const],
      candidates: [
        {
          executor_id: "z-cursor",
          adapter_id: "cursor" as const,
          preference_rank: 1,
        },
        {
          executor_id: "a-claude",
          adapter_id: "claude-code" as const,
          preference_rank: 1,
        },
        {
          executor_id: "x-codex",
          adapter_id: "codex" as const,
          preference_rank: 1,
        },
      ],
    };
    const once = selectExecutor(req);
    const twice = selectExecutor(req);
    expect(once.algorithm).toBe("capability+preference_v1");
    expect(once.selected?.executor_id).toBe(twice.selected?.executor_id);
    // Same pref_rank → preferred_adapters: claude-code before cursor/codex
    expect(once.selected?.executor_id).toBe("a-claude");
    expect(once.explanation).toContain("selected=a-claude");

    // Lower preference_rank wins over adapter preference
    const byRank = selectExecutor({
      ...req,
      candidates: [
        { executor_id: "late-claude", adapter_id: "claude-code", preference_rank: 5 },
        { executor_id: "early-codex", adapter_id: "codex", preference_rank: 0 },
      ],
    });
    expect(byRank.selected?.executor_id).toBe("early-codex");

    // Require streaming (unsupported across catalog) → none selected; rejects explained
    const none = selectExecutor({
      required_capabilities: ["streaming"],
      candidates: [
        { executor_id: "c1", adapter_id: "cursor" },
        { executor_id: "c2", adapter_id: "claude-code" },
        { executor_id: "c3", adapter_id: "codex" },
      ],
    });
    expect(none.selected).toBeNull();
    expect(none.rejected.length).toBe(3);
    expect(none.rejected.every((r) => r.reasons.length > 0)).toBe(true);
    expect(none.rejected.every((r) => r.reasons.some((x) => x.includes("unsupported")))).toBe(
      true,
    );
  });

  it("handoff REPLACED preserves Work; supersedes Attempts; fail ≠ Work fail", () => {
    const ws = freshWorkspace("handoff");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-ho",
      objective: "handoff contract",
      criteria: [
        {
          id: "c1",
          description: "ok",
          mandatory: true,
          evidence_required: ["e1"],
        },
      ],
    });
    const agents = new AgentRegistryStore(rt.paths.agentsDir);
    agents.register({
      agent_id: "w-ho-master",
      role: "master",
      work_id: "w-ho",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-ho", "w-ho-master");
    spawnDomainHierarchy(rt.paths, { work_id: "w-ho", domains: ["backend"] });
    approveDomainPlan(rt.paths, "w-ho", "backend", 1);

    const plannerId = "w-ho-planner-backend";
    new TaskGraphStore(rt.paths.taskGraphsDir).setTaskState(
      "w-ho",
      "plan-backend",
      "TRUE_PASS",
    );

    const running = rt.createAttempt({
      work_id: "w-ho",
      task_id: "plan-backend",
      agent_id: plannerId,
      executor_id: plannerId,
      adapter_id: "cursor",
      execution_mode: "harness",
      status: "running",
    });

    const continuity = new ContinuityEngine(rt.paths);
    const result = replaceAgentPreservingWork(rt, continuity, {
      work_id: "w-ho",
      agent_id: plannerId,
      trigger: "LIMIT_REACHED",
      reason: "V5-M02 replace contract",
      next_action: "continue under substitute",
    });

    expect(result.work_preserved).toBe(true);
    expect(result.work_after.liveness.durable).toBe(true);
    expect(result.work_after.work_state).toBe(result.work_before.work_state);
    expect(result.work_after.work_state).not.toBe("TRUE_FULL_PASS");
    const replaced = result.work_after.agent_refs.find(
      (a) => a.agent_id === plannerId,
    );
    expect(replaced?.state).toBe("REPLACED");
    expect(result.to_agent_id).toBeTruthy();
    expect(result.superseded_attempts.map((a) => a.attempt_id)).toContain(
      running.attempt_id,
    );
    expect(rt.getAttempt(running.attempt_id).status).toBe("superseded");

    const plan = rt.listTasks("w-ho").find((t) => t.task_id === "plan-backend");
    expect(plan?.state).toBe("TRUE_PASS");

    // Explicit: failing a new attempt must not fail Work
    const next = rt.createAttempt({
      work_id: "w-ho",
      task_id: "plan-backend",
      agent_id: result.to_agent_id,
      executor_id: result.to_agent_id,
      execution_mode: "native",
      status: "running",
    });
    const { work } = rt.failAttempt(next.attempt_id, "substitute_failed");
    expect(work.work_state).toBe("IN_PROGRESS");
    expect(work.liveness.durable).toBe(true);
    rt.close();
  });
});
