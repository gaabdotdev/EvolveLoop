/**
 * Adaptive Agent Teams + topology versioning.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import type { FabricDataPaths } from "../paths.js";
import type { AgentTeam, TeamTopology } from "../types.js";

export interface TopologyLimits {
  max_depth: number;
  max_fanout: number;
  max_agents_per_team: number;
  global_concurrency: number;
}

const DEFAULT_LIMITS: TopologyLimits = {
  max_depth: 3,
  max_fanout: 8,
  max_agents_per_team: 16,
  global_concurrency: 32,
};

export class TeamRegistry {
  constructor(
    private readonly paths: FabricDataPaths,
    private readonly limits: TopologyLimits = DEFAULT_LIMITS,
  ) {}

  private path(id: string): string {
    return join(this.paths.teamsDir, `${id}.json`);
  }

  get(teamId: string): AgentTeam | undefined {
    const p = this.path(teamId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as AgentTeam;
  }

  list(): AgentTeam[] {
    return readdirSync(this.paths.teamsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.teamsDir, f), "utf8")) as AgentTeam);
  }

  create(input: {
    objective: string;
    member_agent_ids: string[];
    task_ids?: string[];
    topology: TeamTopology;
    owner: string;
    budgets?: Record<string, number>;
    parent_team_id?: string;
  }): AgentTeam {
    const depth = input.parent_team_id ? (this.get(input.parent_team_id)?.depth ?? 0) + 1 : 0;
    if (depth > this.limits.max_depth) throw new Error("max_depth");
    if (input.member_agent_ids.length > this.limits.max_agents_per_team) throw new Error("max_agents");
    if (input.parent_team_id && !this.get(input.parent_team_id)) throw new Error("orphan_parent");
    // Prevent orphan teams without owner
    if (!input.owner) throw new Error("owner_required");

    const team: AgentTeam = {
      kind: "AgentTeam",
      team_id: `team_${randomUUID()}`,
      objective: input.objective,
      member_agent_ids: input.member_agent_ids,
      task_ids: input.task_ids ?? [],
      topology: input.topology,
      topology_version: 1,
      owner: input.owner,
      budgets: input.budgets ?? {},
      policies: { limits: this.limits },
      state: "forming",
      evidence_refs: [],
      parent_team_id: input.parent_team_id,
      depth,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    atomicWriteJson(this.path(team.team_id), team);
    return team;
  }

  changeTopology(teamId: string, topology: TeamTopology, opts?: { transfer_owner?: string }): AgentTeam {
    const team = this.get(teamId);
    if (!team) throw new Error("team_not_found");
    team.topology = topology;
    team.topology_version += 1;
    team.state = "reconfiguring";
    if (opts?.transfer_owner) team.owner = opts.transfer_owner;
    team.updated_at = nowIso();
    team.evidence_refs.push(`topology:${team.topology_version}:${topology}`);
    atomicWriteJson(this.path(teamId), team);
    team.state = "active";
    team.updated_at = nowIso();
    atomicWriteJson(this.path(teamId), team);
    return team;
  }
}
