import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  getAdapterContract,
  listAdapterContracts,
  isAdapterId,
} from "../../src/v3/adapters/catalog.js";
import { AdapterHandoffBridge } from "../../src/v3/adapters/handoff-bridge.js";

describe("Agent adapter catalog + handoff bridge", () => {
  it("lists four priority adapters with honest execution_bridge", () => {
    const list = listAdapterContracts();
    expect(list.map((a) => a.adapter_id).sort()).toEqual([
      "antigravity",
      "claude-code",
      "codex",
      "cursor",
    ]);
    expect(getAdapterContract("cursor").execution_bridge).toBe("jobs_pickup");
    expect(getAdapterContract("claude-code").execution_bridge).toBe("cli_process");
    expect(getAdapterContract("codex").execution_bridge).toBe("none");
    expect(getAdapterContract("antigravity").execution_bridge).toBe("none");
    expect(isAdapterId("cursor")).toBe(true);
    expect(isAdapterId("gpt")).toBe(false);
    for (const a of list) {
      expect(a.handoff.preserves_private_transcripts).toBe(false);
      const cross = a.capabilities.find((c) => c.key === "cross_provider_swap");
      if (a.adapter_id === "claude-code") {
        expect(cross?.level).toBe("partial");
      } else {
        expect(cross?.level).toBe("unsupported");
      }
    }
  });

  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "adapt-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("builds envelope with auto_swap=false and records ledger", () => {
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-a",
      objective: "adapters",
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-a", "gc-a", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-a-master",
      role: "master",
      work_id: "w-a",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-a", "w-a-master");
    agents.register({
      agent_id: "worker-1",
      role: "worker",
      work_id: "w-a",
      parent_agent_id: "w-a-master",
      task_id: "t1",
      provider_id: "cursor-skill",
      permissions: { allowWrite: true },
      delegation: {
        delegation_id: "dlg-w1",
        role: "worker",
        objective: "impl",
        scope: [],
        out_of_scope: [],
        task_id: "t1",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "done",
      },
    });
    agents.activate("w-a", "worker-1");
    new TaskGraphStore(paths.taskGraphsDir).addTask("w-a", {
      task_id: "t1",
      goal_contract_id: "gc-a",
      goal_contract_version: 1,
      title: "impl",
      owner_agent_id: "worker-1",
    });

    const continuity = new ContinuityEngine(paths);
    const pkg = continuity.createHandoff({
      work_id: "w-a",
      agent_id: "worker-1",
      trigger: "LIMIT_REACHED",
      reason: "quota",
    });

    const envelope = new AdapterHandoffBridge(paths).buildEnvelope(pkg.handoff_id, "claude-code");
    expect(envelope.kind).toBe("CrossProviderHandoffEnvelope");
    expect(envelope.auto_swap).toBe(false);
    expect(envelope.from_adapter).toBe("cursor");
    expect(envelope.to_adapter).toBe("claude-code");
    expect(envelope.package_ref).toBe(pkg.handoff_id);

    const handoffEntries = new CoordinatorService(paths).ledger
      .read("w-a")
      .filter((e) => e.type === "handoff_recorded");
    expect(handoffEntries.length).toBeGreaterThanOrEqual(2);
  });
});
