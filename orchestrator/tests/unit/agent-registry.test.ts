import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRegistryStore, AgentRegistryError } from "../../src/v3/agent-registry/index.js";

describe("AgentRegistryStore", () => {
  let tmp: string;
  let store: AgentRegistryStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-reg-"));
    store = new AgentRegistryStore(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("registers master and child with delegation; blocks permission escalation", () => {
    store.create("w1");
    store.register({
      agent_id: "master-1",
      role: "master",
      work_id: "w1",
      permissions: { allowWrite: true, allowSpawn: true },
    });
    store.activate("w1", "master-1");

    store.register({
      agent_id: "leader-1",
      role: "leader",
      work_id: "w1",
      parent_agent_id: "master-1",
      task_id: "t-plan",
      permissions: { allowWrite: true },
      delegation: {
        delegation_id: "dlg-1",
        role: "leader",
        objective: "lead backend",
        scope: ["backend"],
        out_of_scope: [],
        task_id: "t-plan",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "done",
      },
    });

    expect(() =>
      store.register({
        agent_id: "bad",
        role: "worker",
        work_id: "w1",
        parent_agent_id: "leader-1",
        task_id: "t-impl",
        permissions: { allowShell: true },
        delegation: {
          delegation_id: "dlg-bad",
          role: "worker",
          objective: "x",
          scope: [],
          out_of_scope: [],
          task_id: "t-impl",
          authorized_inputs: [],
          deliverables: [],
          criteria_ids: [],
          permissions: { allowShell: true },
          budget: {},
          expected_evidence: [],
          termination_condition: "x",
        },
      }),
    ).toThrow(AgentRegistryError);
  });

  it("marks stale on expired lease and reconciles orphans on parent failure", () => {
    store.create("w2");
    store.register({
      agent_id: "m",
      role: "master",
      work_id: "w2",
      permissions: { allowSpawn: true, allowWrite: true },
      lease_ms: 1,
    });
    store.activate("w2", "m");
    store.register({
      agent_id: "child",
      role: "worker",
      work_id: "w2",
      parent_agent_id: "m",
      task_id: "t1",
      permissions: { allowWrite: true },
      lease_ms: 60_000,
      delegation: {
        delegation_id: "d1",
        role: "worker",
        objective: "work",
        scope: [],
        out_of_scope: [],
        task_id: "t1",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "x",
      },
    });
    store.activate("w2", "child");

    store.markStale("w2", Date.now() + 10);
    expect(store.load("w2").agents.find((a) => a.agent_id === "m")?.state).toBe("STALE");

    store.reconcileParentFailure("w2", "m", "orphan");
    const snap = store.load("w2");
    expect(snap.agents.find((a) => a.agent_id === "m")?.state).toBe("FAILED");
    expect(snap.agents.find((a) => a.agent_id === "child")?.state).toBe("ORPHANED");
  });
});
