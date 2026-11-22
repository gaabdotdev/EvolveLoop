/**
 * V4.1 P1 — Approvals facade, pause labels, Agent Handles (default off),
 * inspect Agent≠Session, attach fallback, viewer close ≠ kill.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import {
  ApprovalFacade,
  formatApprovalCardLines,
  toApprovalCardView,
} from "../../src/v3/approvals/facade.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  attachAgentHandle,
  closeAgentViewer,
  formatAgentInspectHuman,
  formatAgentsListHuman,
  isAgentHandlesEnabled,
  resolveAgentHandlesPreference,
  classifyHandleLifecycle,
  buildAgentVsSessionView,
  writeWorkspaceAgentHandles,
} from "../../src/v3/agent-handles/index.js";
import { approvalSmokeLines } from "../../src/cli/tui/approval-display.js";
import {
  TASK_CONTROL_SHORTCUTS,
  parseTaskControlLine,
  taskControlMessage,
} from "../../src/cli/tui/task-controls.js";
import { loadEvolveLoopProfile, DEFAULT_PROFILE } from "../../src/config/profile.js";
import { normalizeAgentsGroup } from "../../src/cli/agents-surface.js";

describe("P1-3 Handles preference default OFF", () => {
  const prevEnv = process.env.EVOLVELOOP_AGENT_HANDLES;
  const prevProfile = process.env.EVOLVELOOP_PROFILE_PATH;
  const prevAgents = process.env.AGENTS_ROOT;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.EVOLVELOOP_AGENT_HANDLES;
    else process.env.EVOLVELOOP_AGENT_HANDLES = prevEnv;
    if (prevProfile === undefined) delete process.env.EVOLVELOOP_PROFILE_PATH;
    else process.env.EVOLVELOOP_PROFILE_PATH = prevProfile;
    if (prevAgents === undefined) delete process.env.AGENTS_ROOT;
    else process.env.AGENTS_ROOT = prevAgents;
  });

  it("default profile / DEFAULT_PROFILE → handles disabled", () => {
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
    delete process.env.EVOLVELOOP_PROFILE_PATH;
    expect(DEFAULT_PROFILE.preferences?.agent_handles?.enabled).toBe(false);
    expect(resolveAgentHandlesPreference({ profile: DEFAULT_PROFILE }).enabled).toBe(
      false,
    );
    expect(isAgentHandlesEnabled({ profile: DEFAULT_PROFILE })).toBe(false);
  });

  it("workspace override can enable without profile rewrite", () => {
    const ws = mkdtempSync(join(tmpdir(), "el-handles-ws-"));
    try {
      delete process.env.EVOLVELOOP_AGENT_HANDLES;
      writeWorkspaceAgentHandles(ws, true);
      expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
        true,
      );
      writeWorkspaceAgentHandles(ws, false);
      expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
        false,
      );
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("loads preferences.agent_handles from profile yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-prof-"));
    const yamlPath = join(dir, "default.yaml");
    writeFileSync(
      yamlPath,
      [
        "id: test",
        'version: "1"',
        "knowledge:",
        "  backend: wiki",
        "memory:",
        "  enabled: false",
        "preferences:",
        "  agent_handles:",
        "    enabled: false",
        "",
      ].join("\n"),
    );
    process.env.EVOLVELOOP_PROFILE_PATH = yamlPath;
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
    const p = loadEvolveLoopProfile();
    expect(p.preferences?.agent_handles?.enabled).toBe(false);
  });
});

describe("P1-4 inspect distinguishes Agent vs Session", () => {
  it("human inspect separates Agent state from ProcessSession", () => {
    const agent = {
      agent_id: "worker-1",
      role: "worker" as const,
      child_agent_ids: [] as string[],
      work_id: "w1",
      session_id: "sess-orch-1",
      state: "ACTIVE" as const,
      last_heartbeat_at: "2026-01-01T00:00:00.000Z",
      last_activity_at: "2026-01-01T00:00:00.000Z",
      budget_consumed: {},
      permissions: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const sessions = [
      {
        kind: "ProcessSessionRecord" as const,
        session_id: "ps-1",
        work_id: "w1",
        task_id: "t1",
        adapter_id: "cursor" as const,
        agent_id: "worker-1",
        pid: 4242,
        status: "running" as const,
        started_at: "2026-01-01T00:00:00.000Z",
        command: ["echo", "hi"],
        limitations: [],
      },
    ];
    const human = formatAgentInspectHuman(agent, { processSessions: sessions });
    const blob = human.lines.join("\n");
    expect(blob).toMatch(/Agent state: ACTIVE/);
    expect(blob).toMatch(/ProcessSession: ps-1 \(running, pid=4242\)/);
    expect(blob).toMatch(/Agent state .*≠.*Session/i);
    expect(human.view.agent_state).toBe("ACTIVE");
    expect(human.view.process_session?.status).toBe("running");
    expect(human.view.agent_session_id).toBe("sess-orch-1");
  });
});

describe("P1-5 attach fallback + viewer close ≠ kill", () => {
  it("without tmux/zellij → cli_fallback and does not kill", () => {
    const agent = {
      agent_id: "a1",
      role: "worker" as const,
      child_agent_ids: [] as string[],
      work_id: "w1",
      state: "ACTIVE" as const,
      last_heartbeat_at: "t",
      last_activity_at: "t",
      budget_consumed: {},
      permissions: {},
      created_at: "t",
      updated_at: "t",
    };
    const result = attachAgentHandle(agent, {
      deps: {
        handlesEnabled: true,
        hasBinary: () => false,
      },
    });
    expect(result.backend).toBe("cli_fallback");
    expect(result.ok).toBe(true);
    expect(result.killed_agent).toBe(false);
    expect(result.session_cancelled).toBe(false);

    const closed = result.closeViewer();
    expect(closed.killed_agent).toBe(false);
    expect(closed.session_cancelled).toBe(false);
    expect(closed.message_pt).toMatch(/≠ kill/i);
  });

  it("closeAgentViewer never signals session-cancel", () => {
    const r = closeAgentViewer("any-id");
    expect(r.killed_agent).toBe(false);
    expect(r.session_cancelled).toBe(false);
  });

  it("Handles OFF → soft fail, Task not broken (exit semantics ok)", () => {
    const agent = {
      agent_id: "a1",
      role: "master" as const,
      child_agent_ids: [] as string[],
      work_id: "w1",
      state: "ACTIVE" as const,
      last_heartbeat_at: "t",
      last_activity_at: "t",
      budget_consumed: {},
      permissions: {},
      created_at: "t",
      updated_at: "t",
    };
    const result = attachAgentHandle(agent, {
      deps: { handlesEnabled: false, hasBinary: () => true },
    });
    expect(result.backend).toBe("none");
    expect(result.ok).toBe(false);
    expect(result.killed_agent).toBe(false);
    expect(result.message_pt).toMatch(/OFF/i);
  });

  it("mocked tmux attach still closes viewer without kill", () => {
    const agent = {
      agent_id: "a1",
      role: "worker" as const,
      child_agent_ids: [] as string[],
      work_id: "w1",
      state: "ACTIVE" as const,
      last_heartbeat_at: "t",
      last_activity_at: "t",
      budget_consumed: {},
      permissions: {},
      created_at: "t",
      updated_at: "t",
    };
    let cancelled = false;
    const result = attachAgentHandle(agent, {
      deps: {
        handlesEnabled: true,
        hasBinary: (n) => n === "tmux",
        runAttach: () => {
          // Simulate viewer; must NOT call session-cancel.
          return { ok: true };
        },
      },
    });
    expect(result.backend).toBe("tmux");
    const closed = result.closeViewer();
    expect(closed.session_cancelled).toBe(false);
    expect(cancelled).toBe(false);
    void cancelled;
  });
});

describe("P1-6 replaced vs active presentation", () => {
  it("REPLACED / replaced_by → handle histórico", () => {
    const replaced = {
      agent_id: "old",
      role: "worker" as const,
      child_agent_ids: [] as string[],
      work_id: "w1",
      state: "REPLACED" as const,
      replaced_by: "new",
      last_heartbeat_at: "t",
      last_activity_at: "t",
      budget_consumed: {},
      permissions: {},
      created_at: "t",
      updated_at: "t",
    };
    expect(classifyHandleLifecycle(replaced)).toBe("replaced");
    const view = buildAgentVsSessionView(replaced);
    expect(view.handle_lifecycle_pt).toMatch(/substituído/);
    expect(view.replaced_by).toBe("new");
  });
});

describe("P1-1 Approval facade + TUI smoke", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "el-apr-facade-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("card exposes o quê / porquê / impacto; approve/reject", () => {
    const store = new ApprovalStore(dir);
    const facade = new ApprovalFacade(store);
    const apr = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:leftpad",
      justification: "precisa da dep",
      impact: "Instala pacote no workspace",
      risk: "medium",
      test_provider: true,
    });
    const card = toApprovalCardView(apr);
    expect(card.what).toContain("package.install");
    expect(card.why).toBe("precisa da dep");
    expect(card.impact).toContain("Instala");
    const lines = formatApprovalCardLines(card);
    expect(lines.join("\n")).toMatch(/O quê:/);
    expect(lines.join("\n")).toMatch(/Porquê:/);
    expect(lines.join("\n")).toMatch(/Impacto:/);
    expect(approvalSmokeLines(card).join("\n")).toMatch(/approve/);

    expect(facade.listPending("w1")).toHaveLength(1);
    facade.approve(apr.approval_id, "test");
    expect(facade.listPending("w1")).toHaveLength(0);
  });
});

describe("P1-2 pause/cancel labels", () => {
  it("shortcuts distinguish destructive vs navigation", () => {
    expect(TASK_CONTROL_SHORTCUTS).toMatch(/Pause Task/);
    expect(TASK_CONTROL_SHORTCUTS).toMatch(/destrutivo/);
    expect(TASK_CONTROL_SHORTCUTS).toMatch(/Detach/);
    expect(taskControlMessage("detach").destructive).toBe(false);
    expect(taskControlMessage("interrupt").destructive).toBe(true);
    expect(taskControlMessage("pause").message_pt).toMatch(/Task em pausa/);
    expect(parseTaskControlLine("pausar")).toBe("pause");
    expect(parseTaskControlLine("cancelar")).toBe("cancel");
    expect(parseTaskControlLine("continuar")).toBe("resume");
  });
});

describe("agents alias + list human", () => {
  it("normalizeAgentsGroup maps agent → agents", () => {
    expect(normalizeAgentsGroup("agent")).toBe("agents");
    expect(normalizeAgentsGroup("agents")).toBe("agents");
  });

  it("list human works without crashing when empty", () => {
    const tmp = mkdtempSync(join(tmpdir(), "el-agents-list-"));
    try {
      const paths = resolveV3DataPaths(tmp);
      const human = formatAgentsListHuman(paths);
      expect(human.handles_enabled).toBe(false);
      expect(human.lines.join("\n")).toMatch(/Handles: OFF/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("list includes registered agents", () => {
    const tmp = mkdtempSync(join(tmpdir(), "el-agents-list2-"));
    try {
      const paths = resolveV3DataPaths(tmp);
      const store = new AgentRegistryStore(paths.agentsDir);
      store.create("w1");
      store.register({
        agent_id: "master-1",
        role: "master",
        work_id: "w1",
      });
      const human = formatAgentsListHuman(paths, { work_id: "w1" });
      expect(human.agents).toHaveLength(1);
      expect(human.lines.join("\n")).toMatch(/master-1/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
