/**
 * V4.2 P1 — workspace switch, isolation, history show, continuity UI,
 * taxonomy, compat smokes, help journey examples.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWorkspaceProductView,
  confirmWorkspaceUse,
  recordRecentWorkspace,
  handleWorkspaceProductSurface,
  normalizeWorkspaceIntegrationGroup,
  integrationAliasNote,
} from "../../src/cli/workspace-product-surface.js";
import {
  buildTaskHistoryView,
  showHistoryEntry,
} from "../../src/cli/tui/task-history.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/store.js";
import {
  formatContinuityLimitation,
} from "../../src/v3/continuity/limitation-ui.js";
import {
  buildAgentVsSessionView,
  formatAgentInspectHuman,
} from "../../src/v3/agent-handles/index.js";
import type { AgentRecord } from "../../src/v3/agent-registry/types.js";
import type { HandoffPackage } from "../../src/v3/continuity/types.js";
import { formatJourneyHelp, formatAdvancedHelp } from "../../src/cli/help-usage.js";
import { resolveLayoutMode } from "../../src/cli/tui/layout-narrow.js";

function stubAgent(partial: Partial<AgentRecord> & { agent_id: string }): AgentRecord {
  return {
    agent_id: partial.agent_id,
    work_id: partial.work_id ?? "w-1",
    role: partial.role ?? "worker",
    state: partial.state ?? "REPLACED",
    session_id: partial.session_id,
    task_id: partial.task_id ?? "t-1",
    replaced_by: partial.replaced_by,
    replace_of: partial.replace_of,
    parent_agent_id: undefined,
    child_agent_ids: [],
    delegation_id: undefined,
    permissions: {},
    budget_consumed: {},
    last_heartbeat_at: "2026-01-01T00:00:00.000Z",
    last_activity_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function stubHandoff(partial?: Partial<HandoffPackage>): HandoffPackage {
  return {
    kind: "HandoffPackage",
    handoff_id: "ho-1",
    work_id: "w-1",
    goal_contract_id: "gc-1",
    goal_contract_version: 1,
    task_id: "t-1",
    from_agent_id: "a-old",
    from_role: "worker",
    from_state: "LIMIT_REACHED",
    trigger: "LIMIT_REACHED",
    reason: "limit",
    verified_task_state: "IN_PROGRESS",
    verified_progress: {
      evidence_ids: ["ev-1"],
      decisions: ["d1"],
      next_action: "Continuar verificação",
    },
    permissions: {},
    budget_consumed: {},
    child_agent_ids: [],
    created_at: "2026-01-01T00:00:00.000Z",
    status: "applied",
    to_agent_id: "a-new",
    applied_at: "2026-01-01T00:01:00.000Z",
    ...partial,
  };
}

describe("P1-1 switch workspace thin CLI", () => {
  let home: string;
  let ws: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "v42-home-"));
    ws = mkdtempSync(join(tmpdir(), "v42-ws-"));
    mkdirSync(join(ws, ".evolveloop"), { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  });

  it("lists active + recent and confirms path with --workspace hint", () => {
    recordRecentWorkspace(ws, { home });
    const view = buildWorkspaceProductView(ws, { home });
    expect(view.active).toBe(ws);
    expect(view.lines.join("\n")).toMatch(/Ativo:/);
    expect(view.lines.join("\n")).toMatch(/evolve --workspace/);
    expect(view.isolation_note).toMatch(/state\.db/);

    const confirmed = confirmWorkspaceUse(ws, { home });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.lines.join("\n")).toMatch(/confirmado/i);
    expect(confirmed.lines.join("\n")).toMatch(/evolve --workspace/);
  });

  it("handleWorkspaceProductSurface list/active/use", () => {
    const listed = handleWorkspaceProductSurface(
      { group: "use", command: "list", workspace: ws },
      {
        argv: ["node", "evolve.js", "use", "list", "--workspace", ws],
        printJson: () => undefined,
      },
    );
    expect(listed.handled).toBe(true);
    expect(listed.exitCode).toBe(0);

    const switched = handleWorkspaceProductSurface(
      { group: "switch", command: ws, workspace: ws },
      {
        argv: ["node", "evolve.js", "switch", ws],
        printJson: () => undefined,
      },
    );
    expect(switched.handled).toBe(true);
    expect(switched.exitCode).toBe(0);
  });

  it("missing path fails with actionable message", () => {
    const r = confirmWorkspaceUse(join(ws, "nope-missing"));
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join("\n")).toMatch(/não existe/);
  });
});

describe("P1-2 isolation state.db scoped", () => {
  let a: string;
  let b: string;

  beforeEach(() => {
    a = mkdtempSync(join(tmpdir(), "v42-iso-a-"));
    b = mkdtempSync(join(tmpdir(), "v42-iso-b-"));
    mkdirSync(join(a, ".evolveloop"), { recursive: true });
    mkdirSync(join(b, ".evolveloop"), { recursive: true });
  });

  afterEach(() => {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  });

  it("contract in workspace A does not appear in B", async () => {
    const { runIntentFlow } = await import("../../src/v3/intake/intent-flow.js");
    runIntentFlow({
      workspace: a,
      intent: "Task só no workspace A",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-iso-a",
    });

    expect(existsSync(defaultStateDbPath(a))).toBe(true);
    expect(defaultStateDbPath(a)).not.toBe(defaultStateDbPath(b));

    const viewA = buildTaskHistoryView(a);
    expect(viewA.entries.some((e) => e.id === "gc-iso-a" || e.id.startsWith("gc-iso-a"))).toBe(
      true,
    );
    expect(viewA.limitations.join("\n")).toMatch(/Isolamento|scoped/i);

    const viewB = buildTaskHistoryView(b);
    expect(viewB.entries.some((e) => e.id.includes("gc-iso-a"))).toBe(false);
    // B may have empty state.db after StateDb construct in detect — history without db
    expect(viewB.lines.join("\n")).not.toMatch(/gc-iso-a/);
  });
});

describe("P1-3 history show human with evidence", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v42-hist-show-"));
    mkdirSync(join(ws, ".evolveloop"), { recursive: true });
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("show includes estado, evidências section, limitações", async () => {
    const { runIntentFlow } = await import("../../src/v3/intake/intent-flow.js");
    runIntentFlow({
      workspace: ws,
      intent: "Inspecionar histórico com evidências",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-show-1",
    });

    const db = new StateDb(defaultStateDbPath(ws));
    try {
      const lease = db.acquireWorkspaceLease({
        workspace_id: ws,
        holder_id: "v42-show",
        lease_ms: 60_000,
      });
      db.createMsoSession({
        workspace_id: ws,
        fencing_token: lease.fencing_token,
        holder_id: "v42-show",
        goal_contract_id: "gc-show-1",
        work_id: "w-show-1",
        session_id: "mso-show-1",
      });
      db.upsertEvidenceRecord({
        work_id: "w-show-1",
        evidence_id: "ev-show-1",
        goal_contract_id: "gc-show-1",
        kind: "acceptance-evidence",
        payload: { note: "smoke" },
      });
    } finally {
      db.close();
    }

    const shown = showHistoryEntry(ws, "mso-show-1");
    expect(shown.found).toBe(true);
    expect(shown.lines.join("\n")).toMatch(/estado:/);
    expect(shown.lines.join("\n")).toMatch(/Evidências/);
    expect(shown.lines.join("\n")).toMatch(/Limitação/);
    expect(shown.evidence_ids?.includes("ev-show-1")).toBe(true);
  });
});

describe("P1-4 continuity REPLACED 3 lines", () => {
  it("formatContinuityLimitation returns preservado / perdido / próximo", () => {
    const lim = formatContinuityLimitation({
      kind: "handoff",
      handoff: stubHandoff(),
    });
    expect(lim.lines).toHaveLength(3);
    expect(lim.lines[0]).toMatch(/^Preservado:/);
    expect(lim.lines[1]).toMatch(/^Perdido:/);
    expect(lim.lines[2]).toMatch(/^Próximo:/);
  });

  it("inspect REPLACED includes continuity block", () => {
    const agent = stubAgent({
      agent_id: "a-old",
      state: "REPLACED",
      replaced_by: "a-new",
    });
    const view = buildAgentVsSessionView(agent);
    expect(view.continuity_limitation).toBeTruthy();
    expect(view.continuity_limitation!.lines).toHaveLength(3);

    const human = formatAgentInspectHuman(agent);
    expect(human.lines.join("\n")).toMatch(/Continuidade \(REPLACED\)/);
    expect(human.lines.join("\n")).toMatch(/Preservado:/);
    expect(human.lines.join("\n")).toMatch(/Perdido:/);
    expect(human.lines.join("\n")).toMatch(/Próximo:/);
  });
});

describe("P1-5 taxonomy workspace vs integration", () => {
  it("integration aliases to workspace with note", () => {
    const n = normalizeWorkspaceIntegrationGroup("integration");
    expect(n.group).toBe("workspace");
    expect(n.aliased_from_integration).toBe(true);
    expect(integrationAliasNote()).toMatch(/integration/);
    expect(integrationAliasNote()).toMatch(/Workspace produto|evolve use/);

    const advanced = formatAdvancedHelp();
    expect(advanced).toContain('"integration"');
    expect(advanced).toMatch(/alias → workspace|preferido/);
    expect(advanced).toMatch(/evolve use/);
  });
});

describe("P1-6 compat smokes (honest)", () => {
  it("Node major is documented as number", () => {
    const major = Number(process.versions.node.split(".")[0]);
    expect(Number.isFinite(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(18);
  });

  it("narrow layout smoke", () => {
    const narrow = resolveLayoutMode(40);
    expect(narrow.narrow).toBe(true);
    expect(narrow.degradation_notice).toMatch(/estreito/);
    const wide = resolveLayoutMode(100);
    expect(wide.narrow).toBe(false);
  });

  it("path with space works for confirmWorkspaceUse", () => {
    const root = mkdtempSync(join(tmpdir(), "v42-space-"));
    const spaced = join(root, "ws with space");
    mkdirSync(spaced, { recursive: true });
    try {
      const r = confirmWorkspaceUse(spaced, { record: false });
      expect(r.ok).toBe(true);
      expect(r.path).toContain("ws with space");
      expect(r.state_db_path).toContain("ws with space");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("P1-7 help journey examples", () => {
  it("journey includes prefs, history, switch workspace examples", () => {
    const help = formatJourneyHelp();
    expect(help).toMatch(/Exemplos/);
    expect(help).toMatch(/config set agent-handles/);
    expect(help).toMatch(/history list/);
    expect(help).toMatch(/evolve use/);
    const advanced = JSON.parse(formatAdvancedHelp()) as {
      journey_examples: string[];
    };
    expect(advanced.journey_examples.length).toBeGreaterThanOrEqual(3);
  });
});
