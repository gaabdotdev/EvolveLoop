import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy } from "../../src/v3/hierarchy/spawn.js";
import { planSubtreeRecovery, recoverSubtree } from "../../src/v3/recovery/subtree.js";

describe("Subtree recovery (leader loss)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rec-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-r",
      objective: "recovery",
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
    new CoordinatorService(paths).registerWork("w-r", "gc-r", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-r-master",
      role: "master",
      work_id: "w-r",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-r", "w-r-master");
    spawnDomainHierarchy(paths, { work_id: "w-r", domains: ["backend"] });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("plans adopt_under_master when leader has descendants and master healthy", () => {
    const paths = resolveV3DataPaths(tmp);
    const leaderId = "w-r-leader-backend";
    const plan = planSubtreeRecovery(paths, "w-r", leaderId);
    expect(plan.kind).toBe("SubtreeRecoveryPlan");
    expect(plan.descendants.length).toBeGreaterThan(0);
    expect(plan.recommended_action).toBe("adopt_under_master");
    expect(plan.adopt_target).toBe("w-r-master");
  });

  it("applies adopt_under_master after simulated leader failure", () => {
    const paths = resolveV3DataPaths(tmp);
    const leaderId = "w-r-leader-backend";
    const result = recoverSubtree(paths, {
      work_id: "w-r",
      failed_parent_id: leaderId,
      action: "adopt_under_master",
    });
    expect(result.action).toBe("adopt_under_master");
    expect(result.adopted.length).toBeGreaterThan(0);

    const agents = new AgentRegistryStore(paths.agentsDir).load("w-r");
    expect(agents.agents.find((a) => a.agent_id === leaderId)?.state).toBe("FAILED");
    for (const a of result.adopted) {
      const orphan = agents.agents.find((x) => x.agent_id === a.orphan_id)!;
      expect(orphan.parent_agent_id).toBe("w-r-master");
      expect(orphan.state).toBe("ACTIVE");
    }
  });

  it("tick surfaces recovery_suggestions without auto-applying", () => {
    const paths = resolveV3DataPaths(tmp);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.setState("w-r", "w-r-leader-backend", "FAILED");
    const tick = new CoordinatorService(paths).tick("w-r");
    expect(tick.recovery_suggestions.some((s) => s.failed_parent_id === "w-r-leader-backend")).toBe(
      true,
    );
    expect(tick.limitations.some((l) => /auto-apply|exactly-once/i.test(l))).toBe(true);
    // orphans not created until recovery apply
    expect(tick.orphan_agents).toHaveLength(0);
  });
});
