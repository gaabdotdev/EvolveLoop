/**
 * Adaptive Agent Teams — composition decision, not agent-count maximization.
 */

import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type { AgentTeamPlan, ProjectRecord, WorkflowRecord } from "./types.js";

export interface TeamComposeInput {
  workflow: WorkflowRecord;
  project: ProjectRecord;
  available_agents_slots: number;
  harness_available: boolean;
  risk: "low" | "medium" | "high";
  independent_task_count: number;
  requires_review: boolean;
  measurement?: {
    prior_delegation_success_rate?: number;
    provenance: "measured" | "estimated" | "unavailable";
  };
}

export class TeamComposer {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.teamPlansDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.paths.teamPlansDir, `${id}.json`);
  }

  get(id: string): AgentTeamPlan | undefined {
    const p = this.pathFor(id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as AgentTeamPlan;
  }

  list(workflowId?: string): AgentTeamPlan[] {
    let items = readdirSync(this.paths.teamPlansDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.teamPlansDir, f), "utf-8")) as AgentTeamPlan);
    if (workflowId) items = items.filter((p) => p.workflow_id === workflowId);
    return items;
  }

  compose(input: TeamComposeInput): AgentTeamPlan {
    const budgetAgents = input.workflow.budget.max_agents ?? 2;
    const projectCap = input.project.policy.max_agents;
    const hardCap = Math.min(budgetAgents, projectCap, input.available_agents_slots);

    const alternatives: string[] = [];
    let roles: AgentTeamPlan["roles"] = [];
    let justification = "";
    let expected_benefit = "";

    // Root-only when: low complexity, single task, tight budget, or no harness
    const rootOnly =
      hardCap <= 1 ||
      input.independent_task_count <= 1 ||
      !input.harness_available ||
      (input.risk === "low" && input.independent_task_count < 3);

    alternatives.push("root-only orchestrator");
    alternatives.push("orchestrator+implementer+reviewer");
    alternatives.push("orchestrator+parallel implementers");

    if (rootOnly) {
      roles = [
        {
          role: "orchestrator",
          count: 1,
          capabilities: ["plan", "implement", "verify"],
          budget: input.workflow.budget,
        },
      ];
      justification =
        hardCap <= 1
          ? "Budget/slots force root-only; spawning would violate limits"
          : input.independent_task_count <= 1
            ? "Single-task objective — coordination overhead exceeds benefit"
            : "Harness unavailable or low-risk single path — root-only";
      expected_benefit = "Minimize coordination cost; preserve quality via sequential work";
    } else if (input.requires_review || input.risk === "high") {
      const workers = Math.min(2, hardCap - 2);
      roles = [
        { role: "orchestrator", count: 1, capabilities: ["plan", "delegate"] },
        {
          role: "implementer",
          count: Math.max(1, workers),
          capabilities: ["implement"],
        },
        { role: "reviewer", count: 1, capabilities: ["review"] },
      ];
      // Clamp total
      const total = roles.reduce((s, r) => s + r.count, 0);
      if (total > hardCap) {
        roles = [
          { role: "orchestrator", count: 1, capabilities: ["plan", "implement", "verify"] },
          { role: "reviewer", count: 1, capabilities: ["review"] },
        ].slice(0, hardCap);
      }
      justification =
        "Risk/review requires independent reviewer; limited parallel implementers within caps";
      expected_benefit = "Quality via independent review; bounded parallelism";
    } else if (input.independent_task_count >= 3 && hardCap >= 3) {
      const workers = Math.min(input.independent_task_count, hardCap - 1);
      roles = [
        { role: "orchestrator", count: 1, capabilities: ["plan", "delegate"] },
        { role: "implementer", count: workers, capabilities: ["implement"] },
      ];
      justification = "Independent tasks justify parallel implementers under resource caps";
      expected_benefit = "Lower wall-clock via safe parallelism";
    } else {
      roles = [
        { role: "orchestrator", count: 1, capabilities: ["plan"] },
        { role: "implementer", count: 1, capabilities: ["implement"] },
      ];
      justification = "Default dual role within budget — modest delegation";
      expected_benefit = "Separation of plan/implement without fan-out";
    }

    // Measurement plane optional — never treat unavailable as measured success
    const meas = input.measurement;
    if (meas?.provenance === "unavailable") {
      justification += "; measurement UNAVAILABLE — no ROI numeric claim";
    } else if (meas?.provenance === "measured" && (meas.prior_delegation_success_rate ?? 1) < 0.4) {
      roles = [
        {
          role: "orchestrator",
          count: 1,
          capabilities: ["plan", "implement", "verify"],
        },
      ];
      justification =
        "Measured prior delegation success rate low — prefer root-only despite parallelism opportunity";
      expected_benefit = "Avoid known coordination failure mode";
    }

    const plan: AgentTeamPlan = {
      kind: "AgentTeamPlan",
      plan_id: `team-${randomUUID()}`,
      workflow_id: input.workflow.workflow_id,
      roles,
      justification,
      alternatives,
      expected_benefit,
      resources_planned: {
        agents: roles.reduce((s, r) => s + r.count, 0),
      },
      resources_allocated: {},
      decision_context: {
        hard_cap: hardCap,
        risk: input.risk,
        independent_task_count: input.independent_task_count,
        requires_review: input.requires_review,
        harness_available: input.harness_available,
        measurement: meas ?? { provenance: "unavailable" },
      },
      created_at: nowIso(),
    };
    atomicWriteJson(this.pathFor(plan.plan_id), plan);
    return plan;
  }

  recordOutcome(planId: string, outcome: string): AgentTeamPlan {
    const plan = this.get(planId);
    if (!plan) throw new Error(`TEAM_PLAN_NOT_FOUND:${planId}`);
    const next = { ...plan, outcome };
    atomicWriteJson(this.pathFor(planId), next);
    return next;
  }
}
