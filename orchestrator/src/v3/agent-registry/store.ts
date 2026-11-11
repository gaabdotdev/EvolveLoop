import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AgentRecord,
  AgentRegistrySnapshot,
  AgentRole,
  AgentState,
  DelegationContract,
} from "./types.js";

export class AgentRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

const TERMINAL: ReadonlySet<AgentState> = new Set([
  "COMPLETED",
  "CANCELLED",
  "REPLACED",
  "FAILED",
]);

export interface RegisterAgentInput {
  agent_id: string;
  role: AgentRole;
  work_id: string;
  domain?: string;
  parent_agent_id?: string;
  task_id?: string;
  provider_id?: string;
  model_id?: string;
  session_id?: string;
  permissions?: AgentRecord["permissions"];
  lease_ms?: number;
  delegation?: Omit<DelegationContract, "created_at" | "child_agent_id" | "parent_agent_id"> & {
    parent_agent_id?: string;
  };
}

export class AgentRegistryStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.json`);
  }

  create(workId: string): AgentRegistrySnapshot {
    if (existsSync(this.pathFor(workId))) {
      throw new AgentRegistryError("ALREADY_EXISTS", workId);
    }
    const snap: AgentRegistrySnapshot = {
      kind: "AgentRegistry",
      work_id: workId,
      agents: [],
      delegations: [],
      updated_at: nowIso(),
    };
    this.save(snap);
    return snap;
  }

  load(workId: string): AgentRegistrySnapshot {
    const path = this.pathFor(workId);
    if (!existsSync(path)) throw new AgentRegistryError("NOT_FOUND", workId);
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AgentRegistrySnapshot;
    if (parsed.kind !== "AgentRegistry") throw new AgentRegistryError("INVALID", path);
    return parsed;
  }

  ensure(workId: string): AgentRegistrySnapshot {
    if (!existsSync(this.pathFor(workId))) return this.create(workId);
    return this.load(workId);
  }

  register(input: RegisterAgentInput): AgentRegistrySnapshot {
    const snap = this.ensure(input.work_id);
    if (snap.agents.some((a) => a.agent_id === input.agent_id)) {
      throw new AgentRegistryError("DUPLICATE_AGENT", input.agent_id);
    }
    if (input.parent_agent_id) {
      const parent = snap.agents.find((a) => a.agent_id === input.parent_agent_id);
      if (!parent) throw new AgentRegistryError("PARENT_NOT_FOUND", input.parent_agent_id);
      if (TERMINAL.has(parent.state)) {
        throw new AgentRegistryError("PARENT_TERMINAL", input.parent_agent_id);
      }
      // Child permissions ⊆ parent
      const childPerms = input.permissions ?? {};
      for (const key of Object.keys(childPerms) as Array<keyof typeof childPerms>) {
        if (childPerms[key] === true && parent.permissions[key] !== true) {
          throw new AgentRegistryError(
            "PERMISSION_ESCALATION",
            `child cannot gain ${key} beyond parent`,
          );
        }
      }
      parent.child_agent_ids.push(input.agent_id);
      parent.updated_at = nowIso();
    }

    const ts = nowIso();
    const leaseMs = input.lease_ms ?? 120_000;
    const record: AgentRecord = {
      agent_id: input.agent_id,
      role: input.role,
      domain: input.domain,
      parent_agent_id: input.parent_agent_id,
      child_agent_ids: [],
      task_id: input.task_id,
      work_id: input.work_id,
      provider_id: input.provider_id,
      model_id: input.model_id,
      session_id: input.session_id,
      state: "INITIALIZING",
      last_heartbeat_at: ts,
      last_activity_at: ts,
      budget_consumed: {},
      permissions: input.permissions ?? {},
      lease_expires_at: new Date(Date.now() + leaseMs).toISOString(),
      created_at: ts,
      updated_at: ts,
    };

    if (input.delegation) {
      if (!input.parent_agent_id && !input.delegation.parent_agent_id) {
        throw new AgentRegistryError("DELEGATION_REQUIRES_PARENT", input.agent_id);
      }
      const delegation: DelegationContract = {
        ...input.delegation,
        parent_agent_id: input.parent_agent_id ?? input.delegation.parent_agent_id!,
        child_agent_id: input.agent_id,
        created_at: ts,
      };
      // Inherit: child permissions cannot exceed delegation either
      record.permissions = { ...record.permissions, ...delegation.permissions };
      record.delegation_id = delegation.delegation_id;
      record.task_id = record.task_id ?? delegation.task_id;
      snap.delegations.push(delegation);
    }

    // Active agents must have owner path: master may have no parent; others need parent+task+delegation
    if (record.role !== "master" && record.role !== "coordinator") {
      if (!record.parent_agent_id || !record.task_id || !record.delegation_id) {
        throw new AgentRegistryError(
          "INCOMPLETE_ACTIVATION",
          "non-master agents require parent, task_id, and delegation",
        );
      }
    }

    snap.agents.push(record);
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  activate(workId: string, agentId: string): AgentRegistrySnapshot {
    return this.setState(workId, agentId, "ACTIVE");
  }

  heartbeat(workId: string, agentId: string, leaseMs = 120_000): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const agent = snap.agents.find((a) => a.agent_id === agentId);
    if (!agent) throw new AgentRegistryError("NOT_FOUND", agentId);
    if (TERMINAL.has(agent.state)) {
      throw new AgentRegistryError("TERMINAL", agentId);
    }
    const ts = nowIso();
    agent.last_heartbeat_at = ts;
    agent.last_activity_at = ts;
    agent.lease_expires_at = new Date(Date.now() + leaseMs).toISOString();
    if (agent.state === "STALE" || agent.state === "INITIALIZING") agent.state = "ACTIVE";
    agent.updated_at = ts;
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  setState(workId: string, agentId: string, state: AgentState): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const agent = snap.agents.find((a) => a.agent_id === agentId);
    if (!agent) throw new AgentRegistryError("NOT_FOUND", agentId);
    agent.state = state;
    agent.updated_at = nowIso();
    agent.last_activity_at = agent.updated_at;
    snap.updated_at = agent.updated_at;
    this.save(snap);
    return snap;
  }

  setProviderId(workId: string, agentId: string, providerId: string): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const agent = snap.agents.find((a) => a.agent_id === agentId);
    if (!agent) throw new AgentRegistryError("NOT_FOUND", agentId);
    agent.provider_id = providerId;
    agent.updated_at = nowIso();
    agent.last_activity_at = agent.updated_at;
    snap.updated_at = agent.updated_at;
    this.save(snap);
    return snap;
  }

  /**
   * Accumulate reported consumption only. Callers must pass measured values —
   * never invent tokens/cost.
   */
  recordBudgetConsumption(
    workId: string,
    agentId: string,
    delta: { tokens?: number; cost_usd?: number; duration_ms?: number },
  ): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const agent = snap.agents.find((a) => a.agent_id === agentId);
    if (!agent) throw new AgentRegistryError("NOT_FOUND", agentId);
    if (delta.tokens != null) {
      agent.budget_consumed.tokens = (agent.budget_consumed.tokens ?? 0) + delta.tokens;
    }
    if (delta.cost_usd != null) {
      agent.budget_consumed.cost_usd = (agent.budget_consumed.cost_usd ?? 0) + delta.cost_usd;
    }
    if (delta.duration_ms != null) {
      agent.budget_consumed.duration_ms = (agent.budget_consumed.duration_ms ?? 0) + delta.duration_ms;
    }
    const ts = nowIso();
    agent.updated_at = ts;
    agent.last_activity_at = ts;
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  /**
   * Mark agents with expired leases as STALE (session event, not task failure).
   */
  markStale(workId: string, now = Date.now()): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const ts = new Date(now).toISOString();
    let changed = false;
    for (const agent of snap.agents) {
      if (TERMINAL.has(agent.state)) continue;
      if (!agent.lease_expires_at) continue;
      if (Date.parse(agent.lease_expires_at) < now && agent.state !== "STALE") {
        agent.state = "STALE";
        agent.updated_at = ts;
        changed = true;
      }
    }
    if (changed) {
      snap.updated_at = ts;
      this.save(snap);
    }
    return snap;
  }

  /**
   * When a parent fails/stops: mark active descendants ORPHANED until adopted/cancelled.
   */
  reconcileParentFailure(
    workId: string,
    parentAgentId: string,
    action: "orphan" | "cancel",
  ): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const parent = snap.agents.find((a) => a.agent_id === parentAgentId);
    if (!parent) throw new AgentRegistryError("NOT_FOUND", parentAgentId);
    const ts = nowIso();
    const stack = [...parent.child_agent_ids];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const child = snap.agents.find((a) => a.agent_id === id);
      if (!child || TERMINAL.has(child.state)) continue;
      child.state = action === "cancel" ? "CANCELLED" : "ORPHANED";
      child.updated_at = ts;
      stack.push(...child.child_agent_ids);
    }
    if (!TERMINAL.has(parent.state)) {
      parent.state = "FAILED";
      parent.updated_at = ts;
    }
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  adoptOrphan(
    workId: string,
    orphanId: string,
    newParentId: string,
  ): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const orphan = snap.agents.find((a) => a.agent_id === orphanId);
    const parent = snap.agents.find((a) => a.agent_id === newParentId);
    if (!orphan) throw new AgentRegistryError("NOT_FOUND", orphanId);
    if (!parent) throw new AgentRegistryError("PARENT_NOT_FOUND", newParentId);
    if (orphan.state !== "ORPHANED") {
      throw new AgentRegistryError("NOT_ORPHAN", orphanId);
    }
    if (TERMINAL.has(parent.state)) {
      throw new AgentRegistryError("PARENT_TERMINAL", newParentId);
    }
    const ts = nowIso();
    if (orphan.parent_agent_id) {
      const old = snap.agents.find((a) => a.agent_id === orphan.parent_agent_id);
      if (old) {
        old.child_agent_ids = old.child_agent_ids.filter((id) => id !== orphanId);
        old.updated_at = ts;
      }
    }
    orphan.parent_agent_id = newParentId;
    orphan.state = "ACTIVE";
    orphan.updated_at = ts;
    parent.child_agent_ids.push(orphanId);
    parent.updated_at = ts;
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  listActive(workId: string): AgentRecord[] {
    return this.load(workId).agents.filter(
      (a) => !TERMINAL.has(a.state) && a.state !== "ORPHANED",
    );
  }

  /**
   * Mark source REPLACED and point lineage at substitute (already registered).
   * Transfers child ownership to the substitute.
   */
  replaceAgent(workId: string, fromAgentId: string, toAgentId: string): AgentRegistrySnapshot {
    const snap = this.load(workId);
    const from = snap.agents.find((a) => a.agent_id === fromAgentId);
    const to = snap.agents.find((a) => a.agent_id === toAgentId);
    if (!from) throw new AgentRegistryError("NOT_FOUND", fromAgentId);
    if (!to) throw new AgentRegistryError("NOT_FOUND", toAgentId);
    const ts = nowIso();
    from.state = "REPLACED";
    from.replaced_by = toAgentId;
    from.updated_at = ts;
    to.replace_of = fromAgentId;
    to.task_id = to.task_id ?? from.task_id;
    to.state = "ACTIVE";
    to.updated_at = ts;
    to.last_activity_at = ts;
    // Move children
    for (const childId of from.child_agent_ids) {
      const child = snap.agents.find((a) => a.agent_id === childId);
      if (!child || TERMINAL.has(child.state)) continue;
      child.parent_agent_id = toAgentId;
      child.updated_at = ts;
      if (!to.child_agent_ids.includes(childId)) to.child_agent_ids.push(childId);
    }
    from.child_agent_ids = [];
    // Ensure parent lists the substitute
    if (from.parent_agent_id) {
      const parent = snap.agents.find((a) => a.agent_id === from.parent_agent_id);
      if (parent) {
        if (!parent.child_agent_ids.includes(toAgentId)) parent.child_agent_ids.push(toAgentId);
        parent.updated_at = ts;
      }
    }
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  private save(snap: AgentRegistrySnapshot): void {
    atomicWrite(this.pathFor(snap.work_id), JSON.stringify(snap, null, 2));
  }
}
