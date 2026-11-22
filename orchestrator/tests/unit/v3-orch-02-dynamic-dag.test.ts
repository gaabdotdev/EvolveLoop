/**
 * V3-ORCH-02 — Auto-Replanejamento Dinâmico de DAG.
 * proposeDagMutation + validateMutationDeterministic (cycles / budget / permissions).
 */
import { describe, it, expect } from "vitest";
import {
  proposeDagMutation,
  validateMutationDeterministic,
  applyOpsToNodes,
  computeDagDepth,
  computeMaxFanOut,
  defaultBudgetPolicy,
  defaultPermissionPolicy,
  DYNAMIC_DAG_SCHEMA_VERSION,
  DynamicDagError,
  type MutableDagNode,
  type DagMutationOp,
} from "../../src/v3/task-graph/index.js";
import {
  proposeDagMutation as proposeFromMso,
  validateMutationDeterministic as validateFromMso,
} from "../../src/v3/mso/index.js";

function linearChain(n: number): MutableDagNode[] {
  const nodes: MutableDagNode[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `t${i}`;
    nodes.push({
      task_id: id,
      title: id,
      depends_on: i === 1 ? [] : [`t${i - 1}`],
      parent_task_id: i === 1 ? undefined : `t${i - 1}`,
    });
  }
  return nodes;
}

function diamond(): MutableDagNode[] {
  return [
    { task_id: "A", title: "A", depends_on: [] },
    { task_id: "B", title: "B", depends_on: ["A"], parent_task_id: "A" },
    { task_id: "C", title: "C", depends_on: ["A"], parent_task_id: "A" },
    { task_id: "D", title: "D", depends_on: ["B", "C"], parent_task_id: "A" },
  ];
}

describe("V3-ORCH-02 Dynamic DAG mutation", () => {
  it("proposeDagMutation is deterministic (same proposal_id)", () => {
    const ops: DagMutationOp[] = [
      {
        op: "add_task",
        task: {
          task_id: "E",
          title: "extra",
          depends_on: ["D"],
          parent_task_id: "A",
        },
      },
    ];
    const a = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "split work",
      ops,
      proposed_at: "2026-11-21T23:00:00.000Z",
    });
    const b = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "split work",
      ops,
      proposed_at: "2099-01-01T00:00:00.000Z", // proposed_at excluded from hash body
    });
    expect(a.schema_version).toBe(DYNAMIC_DAG_SCHEMA_VERSION);
    expect(a.proposal_id).toMatch(/^[a-f0-9]{64}$/);
    expect(a.proposal_id).toBe(b.proposal_id);
    expect(a.kind).toBe("DagMutationProposal");

    // mso re-export
    const c = proposeFromMso({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "split work",
      ops,
    });
    expect(c.proposal_id).toBe(a.proposal_id);
  });

  it("proposeDagMutation rejects empty work_id", () => {
    expect(() =>
      proposeDagMutation({
        work_id: "",
        proposer_task_id: "A",
        proposer_role: "worker",
        rationale: "x",
        ops: [],
      }),
    ).toThrow(DynamicDagError);
  });

  it("accepts add_task that keeps DAG acyclic within budget", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "add verify after D",
      ops: [
        {
          op: "add_task",
          task: {
            task_id: "V",
            title: "verify",
            depends_on: ["D"],
            parent_task_id: "A",
            estimated_tokens: 100,
          },
        },
      ],
      proposed_at: "2026-11-21T23:00:00.000Z",
    });

    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_tasks: 10, max_depth: 8, max_fan_out: 8 }),
      permissions: defaultPermissionPolicy(),
    });

    expect(result.accepted).toBe(true);
    expect(result.codes).toEqual([]);
    expect(result.resulting_task_count).toBe(5);
    expect(result.projected_tokens_added).toBe(100);
    expect(result.projected_nodes?.map((n) => n.task_id).sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
      "V",
    ]);
    expect(computeDagDepth(result.projected_nodes!)).toBe(result.resulting_depth);
  });

  it("rejects CYCLE when add_dependency closes a loop", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "bad cycle A←D",
      ops: [{ op: "add_dependency", task_id: "A", depends_on_task_id: "D" }],
      proposed_at: "2026-11-21T23:00:00.000Z",
    });

    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy(),
    });

    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("CYCLE");
    expect(result.reasons.some((r) => /cycle/i.test(r))).toBe(true);
  });

  it("rejects CYCLE on set_depends_on mutual edge", () => {
    const nodes = linearChain(2);
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "t1",
      proposer_role: "planner",
      rationale: "mutual",
      ops: [
        { op: "set_depends_on", task_id: "t1", depends_on: ["t2"] },
        { op: "set_depends_on", task_id: "t2", depends_on: ["t1"] },
      ],
    });
    const result = validateFromMso({
      proposal,
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy(),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("CYCLE");
  });

  it("rejects BUDGET_MAX_TASKS", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "overflow",
      ops: [
        { op: "add_task", task: { task_id: "E1", title: "e1", depends_on: ["A"] } },
        { op: "add_task", task: { task_id: "E2", title: "e2", depends_on: ["A"] } },
      ],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_tasks: 4 }),
      permissions: defaultPermissionPolicy(),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("BUDGET_MAX_TASKS");
    expect(result.resulting_task_count).toBe(6);
  });

  it("rejects BUDGET_MAX_DEPTH", () => {
    const nodes = linearChain(3); // depth 2
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "t3",
      proposer_role: "worker",
      rationale: "deepen",
      ops: [
        {
          op: "add_task",
          task: {
            task_id: "t4",
            title: "t4",
            depends_on: ["t3"],
            parent_task_id: "t3",
          },
        },
      ],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_depth: 2, max_tasks: 10 }),
      permissions: defaultPermissionPolicy(),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("BUDGET_MAX_DEPTH");
    expect(result.resulting_depth).toBe(3);
  });

  it("rejects BUDGET_MAX_FAN_OUT", () => {
    const nodes: MutableDagNode[] = [
      { task_id: "root", title: "root", depends_on: [] },
      { task_id: "a", title: "a", depends_on: ["root"] },
      { task_id: "b", title: "b", depends_on: ["root"] },
    ];
    expect(computeMaxFanOut(nodes)).toBe(2);

    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "root",
      proposer_role: "leader",
      rationale: "too wide",
      ops: [
        { op: "add_task", task: { task_id: "c", title: "c", depends_on: ["root"] } },
      ],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_fan_out: 2, max_tasks: 10 }),
      permissions: defaultPermissionPolicy(),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("BUDGET_MAX_FAN_OUT");
    expect(result.resulting_max_fan_out).toBe(3);
  });

  it("rejects BUDGET_MAX_MUTATIONS and BUDGET_TOKENS", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "costly",
      ops: [
        {
          op: "add_task",
          task: {
            task_id: "X",
            title: "x",
            depends_on: ["A"],
            estimated_tokens: 5000,
          },
        },
      ],
    });

    const mutations = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_mutations: 2, mutations_applied: 2 }),
      permissions: defaultPermissionPolicy(),
    });
    expect(mutations.accepted).toBe(false);
    expect(mutations.codes).toContain("BUDGET_MAX_MUTATIONS");

    const tokens = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ token_budget_remaining: 100 }),
      permissions: defaultPermissionPolicy(),
    });
    expect(tokens.accepted).toBe(false);
    expect(tokens.codes).toContain("BUDGET_TOKENS");
    expect(tokens.projected_tokens_added).toBe(5000);
  });

  it("rejects PERMISSION_ROLE and PERMISSION_OP", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "B",
      proposer_role: "auxiliary",
      rationale: "aux cannot",
      ops: [{ op: "remove_task", task_id: "C" }],
    });

    const role = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy({
        allowed_roles: ["master", "leader", "planner"],
      }),
    });
    expect(role.accepted).toBe(false);
    expect(role.codes).toContain("PERMISSION_ROLE");

    const opDenied = validateMutationDeterministic({
      proposal: proposeDagMutation({
        work_id: "w1",
        proposer_task_id: "B",
        proposer_role: "worker",
        rationale: "no remove",
        ops: [{ op: "remove_task", task_id: "C" }],
      }),
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy({
        allowed_roles: ["worker"],
        allowed_ops: ["add_task", "add_dependency"],
      }),
    });
    expect(opDenied.accepted).toBe(false);
    expect(opDenied.codes).toContain("PERMISSION_OP");
  });

  it("rejects PERMISSION_SCOPE when restrict_to_subtree and touch outside", () => {
    const nodes = diamond();
    // Proposer B — subtree is {B} only (no children via parent_task_id).
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "B",
      proposer_role: "worker",
      rationale: "touch C",
      ops: [{ op: "set_depends_on", task_id: "C", depends_on: ["B"] }],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy({ restrict_to_subtree: true }),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("PERMISSION_SCOPE");
  });

  it("allows subtree-scoped add_task under proposer", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "child of A",
      ops: [
        {
          op: "add_task",
          task: {
            task_id: "E",
            title: "E",
            depends_on: ["B"],
            parent_task_id: "A",
          },
        },
      ],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes,
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy({ restrict_to_subtree: true }),
    });
    expect(result.accepted).toBe(true);
  });

  it("validation is deterministic across repeated calls", () => {
    const nodes = diamond();
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "worker",
      rationale: "cycle+budget",
      ops: [
        { op: "add_dependency", task_id: "A", depends_on_task_id: "D" },
        {
          op: "add_task",
          task: { task_id: "Z", title: "z", depends_on: ["D"], estimated_tokens: 9 },
        },
      ],
    });
    const input = {
      proposal,
      nodes,
      budget: defaultBudgetPolicy({ max_tasks: 4, token_budget_remaining: 1 }),
      permissions: defaultPermissionPolicy({ allowed_roles: ["leader"] as const }),
    };
    const a = validateMutationDeterministic(input);
    const b = validateMutationDeterministic(input);
    expect(a).toEqual(b);
    expect(a.accepted).toBe(false);
    expect(a.codes.length).toBeGreaterThan(0);
  });

  it("applyOpsToNodes remove_task strips deps from survivors", () => {
    const nodes = diamond();
    const applied = applyOpsToNodes(nodes, [{ op: "remove_task", task_id: "B" }]);
    expect(applied.codes).toEqual([]);
    expect(applied.nodes.map((n) => n.task_id).sort()).toEqual(["A", "C", "D"]);
    const d = applied.nodes.find((n) => n.task_id === "D")!;
    expect(d.depends_on).toEqual(["C"]);
  });

  it("rejects EMPTY_OPS", () => {
    const proposal = proposeDagMutation({
      work_id: "w1",
      proposer_task_id: "A",
      proposer_role: "leader",
      rationale: "noop",
      ops: [],
    });
    const result = validateMutationDeterministic({
      proposal,
      nodes: diamond(),
      budget: defaultBudgetPolicy(),
      permissions: defaultPermissionPolicy(),
    });
    expect(result.accepted).toBe(false);
    expect(result.codes).toContain("EMPTY_OPS");
  });
});
