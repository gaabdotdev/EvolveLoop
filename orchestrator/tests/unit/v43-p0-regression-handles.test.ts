/**
 * V4.3 P0-4 / P0-5 — Public CLI regression checklist + Handles isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatJourneyHelp, formatAdvancedHelp } from "../../src/cli/help-usage.js";
import { handleAgentsSurface, normalizeAgentsGroup } from "../../src/cli/agents-surface.js";
import { handleConfigSurface } from "../../src/cli/config-surface.js";
import { handleHistorySurface } from "../../src/cli/tui/task-history.js";
import { handleWorkspaceProductSurface } from "../../src/cli/workspace-product-surface.js";
import { handleDeliverySurface } from "../../src/cli/delivery-surface.js";
import {
  attachAgentHandle,
  closeAgentViewer,
  classifyHandleLifecycle,
  buildAgentVsSessionView,
  isAgentHandlesEnabled,
} from "../../src/v3/agent-handles/index.js";
import { DEFAULT_PROFILE } from "../../src/config/profile.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { ApprovalFacade } from "../../src/v3/approvals/facade.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { V35_USAGE_GROUPS } from "../../src/cli/v35-commands.js";
import { matchTrivialIntent } from "../../src/v3/grill-me/trivial-bypass.js";
import { pauseJourneyTask, getJourneyPause, resumeJourneyTask } from "../../src/cli/tui/journey-pause.js";

describe("P0-4 public command regression checklist", () => {
  let ws: string;
  const prevEnv = process.env.EVOLVELOOP_AGENT_HANDLES;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-reg-"));
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.EVOLVELOOP_AGENT_HANDLES;
    else process.env.EVOLVELOOP_AGENT_HANDLES = prevEnv;
  });

  it("journey help lists pause/resume/delivery/history/agents/config/use/approvals", () => {
    const help = formatJourneyHelp();
    expect(help).toMatch(/evolve pause/);
    expect(help).toMatch(/evolve resume/);
    expect(help).toMatch(/delivery/);
    expect(help).toMatch(/history/);
    expect(help).toMatch(/agents/);
    expect(help).toMatch(/config/);
    expect(help).toMatch(/use/);
    expect(help).toMatch(/approvals/);
    expect(help).toMatch(/Handles/);
  });

  it("advanced help keeps L3 groups exit-stable (not deleted)", () => {
    const adv = formatAdvancedHelp();
    expect(adv).toMatch(/circuit/);
    expect(adv).toMatch(/harness/);
    expect(adv).toMatch(/sandbox/);
    for (const g of Object.keys(V35_USAGE_GROUPS).slice(0, 5)) {
      expect(adv.toLowerCase()).toContain(g);
    }
  });

  it("agents / config / history / use / delivery surfaces handle", () => {
    expect(normalizeAgentsGroup("agent")).toBe("agents");
    const agents = handleAgentsSurface(
      { group: "agents", command: "help", workspace: ws },
      { printJson: () => {} },
    );
    expect(agents.handled).toBe(true);

    const cfg = handleConfigSurface(
      { group: "config", command: "prefs", workspace: ws },
      { argv: ["node", "evolve", "config", "prefs", "--workspace", ws], printJson: () => {} },
    );
    expect(cfg.handled).toBe(true);

    const hist = handleHistorySurface(
      { group: "history", command: "list", workspace: ws },
      { argv: ["node", "evolve", "history", "list", "--workspace", ws], printJson: () => {} },
    );
    expect(hist.handled).toBe(true);

    const use = handleWorkspaceProductSurface(
      { group: "use", command: "active", workspace: ws },
      { argv: ["node", "evolve", "use", "active", "--workspace", ws], printJson: () => {} },
    );
    expect(use.handled).toBe(true);

    const del = handleDeliverySurface(
      { group: "delivery", command: "show", workspace: ws },
      { argv: ["node", "evolve", "delivery", "show", "--workspace", ws], printJson: () => {} },
    );
    expect(del.handled).toBe(true);
  });

  it("approvals facade still lists; pause/resume trivial match", () => {
    const store = new ApprovalStore(join(ws, "approvals"));
    const facade = new ApprovalFacade(store);
    expect(facade.listPending()).toEqual([]);
    expect(matchTrivialIntent("pause")?.kind).toBe("pause");
    expect(matchTrivialIntent("resume")?.kind).toBe("resume");
    pauseJourneyTask(ws, "cli");
    expect(getJourneyPause(ws).paused).toBe(true);
    resumeJourneyTask(ws, "cli");
    expect(getJourneyPause(ws).paused).toBe(false);
  });

  it("Handles OFF by default — journey not broken", () => {
    expect(DEFAULT_PROFILE.preferences?.agent_handles?.enabled).toBe(false);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      false,
    );
    const paths = resolveV3DataPaths(join(ws, ".evolveloop", "v3"));
    const agent = {
      agent_id: "a-off",
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
    const att = attachAgentHandle(agent, {
      deps: { workspace: ws, handlesEnabled: false },
    });
    expect(att.ok).toBe(false);
    expect(att.killed_agent).toBe(false);
    expect(att.session_cancelled).toBe(false);
    void paths;
  });
});

describe("P0-5 Handles closeViewer ≠ kill; REPLACED ≠ active", () => {
  it("closeViewer never kills or session-cancels", () => {
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
    const att = attachAgentHandle(agent, {
      deps: {
        handlesEnabled: true,
        hasBinary: (n) => n === "tmux",
        runAttach: () => ({ ok: true }),
      },
    });
    expect(att.killed_agent).toBe(false);
    const closed = att.closeViewer();
    expect(closed.killed_agent).toBe(false);
    expect(closed.session_cancelled).toBe(false);
    const direct = closeAgentViewer("a1");
    expect(direct.killed_agent).toBe(false);
    expect(direct.session_cancelled).toBe(false);
  });

  it("REPLACED lifecycle is not active", () => {
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
    expect(classifyHandleLifecycle(replaced)).not.toBe("active");
    const view = buildAgentVsSessionView(replaced);
    expect(view.handle_lifecycle).toBe("replaced");
    expect(view.handle_lifecycle_pt).toMatch(/substituído/);
  });

  it("Handles ON soft-fail when backends absent", () => {
    const agent = {
      agent_id: "a2",
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
    const att = attachAgentHandle(agent, {
      deps: {
        handlesEnabled: true,
        hasBinary: () => false,
      },
    });
    expect(att.backend).toBe("cli_fallback");
    expect(att.ok).toBe(true);
    expect(att.killed_agent).toBe(false);
    expect(att.message_pt).toMatch(/fallback|ausentes/i);
  });
});
