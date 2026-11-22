/**
 * V5-M10 — Integrated production-readiness scenario (section 8).
 * Fixture-based REAL persistence; no paid APIs; no forged PASS.
 *
 * LIMITATION: live multi-harness Cursor+Antigravity not run in this suite.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessSessionStore } from "../../src/v3/adapters/drivers/process-sessions.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import {
  exportAgentConfig,
  loadTeamComposition,
  loadWorkflowYaml,
  parseAgentConfig,
  saveAgentConfig,
  saveTeamComposition,
  saveWorkflow,
  stripSecrets,
  type TeamComposition,
  type WorkflowModel,
} from "../../src/v3/agent-studio/index.js";
import {
  replaceAgentPreservingWork,
} from "../../src/v3/agent-orchestration/index.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { ApprovalFacade } from "../../src/v3/approvals/facade.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import {
  authorizeToolUnderPolicy,
  openGovernance,
} from "../../src/v3/governance/index.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { openModelProviderFreedom } from "../../src/v3/model-registry/index.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import { openToolFreedom } from "../../src/v3/tool-registry/index.js";
import {
  getWorkDelivery,
  projectFromAgentClaim,
} from "../../src/v3/verification/index.js";
import { PersistentWorkRuntime } from "../../src/v3/work-runtime/index.js";

const WORK_ID = "w-m10-integrated";
const SECRET_MARKER = "SECRET_M10_MUST_NOT_LEAK";

describe("V5-M10 integrated scenario (fixture persistence)", () => {
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
    const ws = mkdtempSync(join(tmpdir(), `v5-m10-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("section 8 end-to-end: registries → Work → Attempt → fail → replace → policy → approval → delivery → restart → export", () => {
    // 1. Create workspace temp
    const ws = freshWorkspace("scenario");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    const studioDir = rt.paths.agentStudioDir;

    // 2. Register agents / providers / tools via registries
    const { providers, models } = openModelProviderFreedom(rt.paths.modelRegistryDir);
    const pSnap = providers.seed();
    const mSnap = models.seed();
    expect(pSnap.kind).toBe("ProviderRegistry");
    expect(mSnap.kind).toBe("ModelRegistry");
    expect(pSnap.providers.map((p) => p.provider_id)).toEqual(
      expect.arrayContaining(["freellmapi", "ollama", "custom"]),
    );

    const tools = openToolFreedom(rt.paths.toolRegistryDir);
    tools.registry.seed();
    tools.assignments.assignToolsToAgent("agent-m10", ["shell.exec", "fs.read"]);
    expect(tools.agentMayUseTool("agent-m10", "shell.exec").allowed).toBe(true);
    expect(tools.agentMayUseTool("agent-other", "shell.exec").allowed).toBe(false);

    const agents = new AgentRegistryStore(rt.paths.agentsDir);

    // 3. Create team + workflow YAML (Agent Studio)
    const agentPath = join(studioDir, "agents", "coder.yaml");
    const dirtyCfg = parseAgentConfig({
      kind: "AgentConfig",
      name: "coder",
      adapter: "cursor",
      model_ref: "ollama/llama",
      tools_allowlist: ["shell.exec", "fs.read"],
      api_key: SECRET_MARKER,
      limits: { max_attempts: 2 },
    });
    expect(JSON.stringify(dirtyCfg)).not.toContain(SECRET_MARKER);
    saveAgentConfig(agentPath, dirtyCfg);

    const team: TeamComposition = {
      kind: "TeamComposition",
      schema_version: "1.0.0",
      name: "m10-core",
      agents: [
        { name: "planner", role: "plan", agent_config_ref: "coder" },
        { name: "implementer", role: "implement", agent_config_ref: "coder" },
      ],
      roles: ["plan", "implement"],
      // sneak secret into notes shape via cast — stripSecrets on save must drop secret keys
    };
    const teamPath = join(studioDir, "teams", "m10-core.json");
    saveTeamComposition(teamPath, {
      ...team,
      api_key: SECRET_MARKER,
    } as TeamComposition & { api_key?: string });
    const teamDisk = readFileSync(teamPath, "utf-8");
    expect(teamDisk).not.toContain(SECRET_MARKER);

    const workflow: WorkflowModel = {
      kind: "WorkflowModel",
      schema_version: "1.0.0",
      name: "m10-ship",
      nodes: [
        { id: "start", type: "start" },
        { id: "impl", type: "task", agent: "coder" },
        { id: "gate", type: "approval", approval: "human-1" },
        { id: "end", type: "end" },
      ],
      edges: [
        { from: "start", to: "impl" },
        { from: "impl", to: "gate" },
        { from: "gate", to: "end" },
      ],
      approvals: [{ id: "human-1", required: true }],
    };
    const wfPath = join(studioDir, "workflows", "m10-ship.yaml");
    saveWorkflow(wfPath, workflow);
    expect(existsSync(wfPath)).toBe(true);
    const loadedWf = loadWorkflowYaml(wfPath);
    expect(loadedWf.nodes).toHaveLength(4);

    // 4. Open Work + graph
    const work = rt.open({
      work_id: WORK_ID,
      objective: "V5-M10 integrated production-readiness scenario",
      criteria: [
        {
          id: "c1",
          description: "local delivery verifiable",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
      tasks: [
        { task_id: "t-plan", title: "Plan", task_kind: "plan" },
        {
          task_id: "t-impl",
          title: "Implement",
          task_kind: "implement",
          depends_on: ["t-plan"],
        },
      ],
    });
    expect(work.work_state).toBe("IN_PROGRESS");
    expect(work.liveness.durable).toBe(true);
    const graph = rt.graph(WORK_ID);
    expect(graph.source).toBe("TaskGraphStore");
    expect(graph.tasks.map((t) => t.task_id).sort()).toEqual(["t-impl", "t-plan"]);

    agents.register({
      agent_id: `${WORK_ID}-master`,
      role: "master",
      work_id: WORK_ID,
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate(WORK_ID, `${WORK_ID}-master`);
    spawnDomainHierarchy(rt.paths, { work_id: WORK_ID, domains: ["backend"] });
    approveDomainPlan(rt.paths, WORK_ID, "backend", 1);
    const plannerId = `${WORK_ID}-planner-backend`;
    new TaskGraphStore(rt.paths.taskGraphsDir).setTaskState(
      WORK_ID,
      "plan-backend",
      "TRUE_PASS",
    );

    // 5. Create Attempt + bind ProcessSession fixture process
    const sessionStore = new ProcessSessionStore(rt.paths.processSessionsDir);
    const session_id = "sess-m10-fixture";
    sessionStore.upsert({
      kind: "ProcessSessionRecord",
      session_id,
      work_id: WORK_ID,
      task_id: "t-impl",
      adapter_id: "cursor",
      agent_id: plannerId,
      status: "running",
      started_at: new Date().toISOString(),
      command: ["echo", "m10-fixture"],
      limitations: ["fixture_no_live_multi_harness"],
    });
    const attempt = rt.createAttempt({
      work_id: WORK_ID,
      task_id: "t-impl",
      agent_id: plannerId,
      executor_id: plannerId,
      adapter_id: "cursor",
      execution_mode: "unknown",
      status: "pending",
      idempotency_key: "m10-bind",
    });
    const bound = rt.bindProcessSession({
      attempt_id: attempt.attempt_id,
      process_session_id: session_id,
    });
    expect(bound.process_session_id).toBe(session_id);
    expect(bound.execution_mode).toBe("harness");
    expect(bound.status).toBe("running");

    // 6. Fail attempt → Work still open
    const { attempt: failed, work: afterFail } = rt.failAttempt(
      bound.attempt_id,
      "m10_fixture_fail",
    );
    expect(failed.status).toBe("failed");
    expect(afterFail.work_state).toBe("IN_PROGRESS");
    expect(afterFail.work_state).not.toBe("TRUE_FULL_PASS");
    expect(afterFail.liveness.durable).toBe(true);

    // 7. Replace agent (continuity) → Work preserved
    const runningForReplace = rt.createAttempt({
      work_id: WORK_ID,
      task_id: "plan-backend",
      agent_id: plannerId,
      executor_id: plannerId,
      adapter_id: "cursor",
      execution_mode: "harness",
      status: "running",
      idempotency_key: "m10-replace-run",
    });
    const continuity = new ContinuityEngine(rt.paths);
    const replaced = replaceAgentPreservingWork(rt, continuity, {
      work_id: WORK_ID,
      agent_id: plannerId,
      trigger: "LIMIT_REACHED",
      reason: "V5-M10 integrated replace",
      next_action: "continue under substitute",
    });
    expect(replaced.work_preserved).toBe(true);
    expect(replaced.work_after.work_id).toBe(WORK_ID);
    expect(replaced.work_after.work_state).toBe("IN_PROGRESS");
    expect(replaced.to_agent_id).toBeTruthy();
    expect(rt.getAttempt(runningForReplace.attempt_id).status).toBe("superseded");
    const planTask = rt.listTasks(WORK_ID).find((t) => t.task_id === "plan-backend");
    expect(planTask?.state).toBe("TRUE_PASS");

    // 8. Policy deny tool
    const { policy, audit } = openGovernance(rt.paths.governanceDir);
    policy.upsert({
      scope: "work",
      work_id: WORK_ID,
      deny_tool_ids: ["shell.exec"],
    });
    const denied = authorizeToolUnderPolicy(
      policy,
      tools.registry,
      tools.assignments,
      {
        agent_id: "agent-m10",
        tool_id: "shell.exec",
        work_id: WORK_ID,
      },
      { audit },
    );
    expect(denied.verdict).toBe("deny");
    expect(denied.reason).toMatch(/policy_denied/);
    expect(audit.read().some((e) => e.audit_kind === "policy_deny_tool")).toBe(true);

    // 9. Approval with work_id
    const approvalStore = new ApprovalStore(rt.paths.approvalsDir);
    const approvalFacade = new ApprovalFacade(approvalStore);
    const approval = approvalFacade.create({
      work_id: WORK_ID,
      attempt_id: failed.attempt_id,
      agent_id: plannerId,
      operation: "shell.execute",
      resource: ws,
      justification: "M10 integrated approval card",
    });
    expect(approval.work_id).toBe(WORK_ID);
    expect(approval.attempt_id).toBe(failed.attempt_id);

    // 10. Delivery local_execution PASS path OR UNVERIFIED honesty
    const claim = projectFromAgentClaim({
      workspace: ws,
      work_id: WORK_ID,
      agent_claim_pass: true,
      kick_started: true,
    });
    expect(claim.status).toBe("UNVERIFIED");
    expect(claim.status).not.toBe("PASS");
    expect(claim.provenance).toBe("absent");

    const pass = getWorkDelivery(WORK_ID, {
      workspaceRoot: ws,
      run: "true",
    });
    expect(pass.status).toBe("PASS");
    expect(pass.provenance).toBe("local_execution");
    expect(pass.agent_claim_cannot_pass).toBe(true);

    const unverified = getWorkDelivery(WORK_ID, { workspaceRoot: ws });
    // Without a fresh run argument, honesty may still surface prior local evidence
    // or absent — never forge PASS from agent claim alone (asserted above).
    expect(unverified.status).not.toBeUndefined();
    if (unverified.provenance === "absent") {
      expect(unverified.status).not.toBe("PASS");
    }

    // 11. Restart simulation (re-open Work from disk)
    const objective = rt.read(WORK_ID).objective;
    rt.close();
    const rt2 = new PersistentWorkRuntime({ workspaceRoot: ws });
    const recovered = rt2.read(WORK_ID);
    expect(recovered.work_id).toBe(WORK_ID);
    expect(recovered.objective).toBe(objective);
    expect(recovered.liveness.durable).toBe(true);
    expect(recovered.work_state).toBe("IN_PROGRESS");
    expect(rt2.listAttempts(WORK_ID).length).toBeGreaterThanOrEqual(2);
    expect(rt2.graph(WORK_ID).tasks.length).toBeGreaterThanOrEqual(2);

    // 12. Export team/workflow without secrets
    const teamLoaded = loadTeamComposition(teamPath);
    const teamExport = JSON.stringify(teamLoaded, null, 2);
    expect(teamExport).not.toContain(SECRET_MARKER);
    expect(teamExport).not.toMatch(/"api_key"\s*:/);

    const wfLoaded = loadWorkflowYaml(wfPath);
    const wfExport = JSON.stringify(wfLoaded);
    expect(wfExport).not.toContain(SECRET_MARKER);

    const agentExport = exportAgentConfig(
      parseAgentConfig({
        name: "coder",
        adapter: "cursor",
        tools_allowlist: ["fs.read"],
        password: SECRET_MARKER,
      }),
      "json",
    );
    expect(agentExport).not.toContain(SECRET_MARKER);
    const { stripped_keys } = stripSecrets({
      token: SECRET_MARKER,
      keep: "ok",
    });
    expect(stripped_keys.length).toBeGreaterThanOrEqual(1);

    // LIMITATION documented in assertion comment + expect below is informational
    expect(
      "LIMITATION: live multi-harness Cursor+Antigravity not run",
    ).toMatch(/LIMITATION/);

    rt2.close();
  });
});
