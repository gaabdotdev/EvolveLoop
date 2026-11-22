/**
 * V4.2 P0 — Operational Excellence: prefs persist, validate, history,
 * honest metrics, workspace label.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildConfigPrefsView,
  setAgentHandlesPref,
  validateEvolveConfig,
  parseHandlesToggle,
  handleConfigSurface,
} from "../../src/cli/config-surface.js";
import {
  isAgentHandlesEnabled,
  resolveAgentHandlesPreference,
  workspaceConfigPath,
} from "../../src/v3/agent-handles/preference.js";
import { DEFAULT_PROFILE } from "../../src/config/profile.js";
import {
  loadEvolveLoopProfileDetailed,
  validateWorkspaceConfigFile,
} from "../../src/config/profile.js";
import {
  buildTaskHistoryView,
  handleHistorySurface,
  showHistoryEntry,
} from "../../src/cli/tui/task-history.js";
import { StateDb } from "../../src/v3/state-db/store.js";
import { formatCompactHonestTok } from "../../src/cli/tui/footer-compact.js";
import { renderCompactFooter } from "../../src/cli/tui/footer-compact.js";
import {
  formatDeliveryTokens,
  buildDeliveryCardView,
} from "../../src/cli/tui/delivery-card-view.js";
import { formatJourneyHelp, formatAdvancedHelp } from "../../src/cli/help-usage.js";
import { buildHomeResumeView } from "../../src/cli/tui/home-resume.js";
import { runSlashHandler } from "../../src/cli/tui/slash-handlers.js";
import { parseSlashCommand } from "../../src/cli/tui/slash-commands.js";
import type { WorkspaceSessionSnapshot } from "../../src/v3/evolve-shell/index.js";
import { buildFooterTelemetry } from "../../src/v3/evolve-shell/index.js";
import { defaultReadinessPrefs, buildReadinessReport, DEFAULT_LIMITS } from "../../src/v3/evolve-shell/first-run-setup.js";

describe("P0-1 prefs persist Agent Handles", () => {
  let ws: string;
  const prevEnv = process.env.EVOLVELOOP_AGENT_HANDLES;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v42-prefs-"));
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.EVOLVELOOP_AGENT_HANDLES;
    else process.env.EVOLVELOOP_AGENT_HANDLES = prevEnv;
  });

  it("setAgentHandlesPref writes workspace config and resolves ON/OFF", () => {
    const on = setAgentHandlesPref(ws, true);
    expect(on.enabled).toBe(true);
    expect(existsSync(on.path)).toBe(true);
    expect(on.consequence).toMatch(/ON/);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      true,
    );
    const raw = readFileSync(workspaceConfigPath(ws), "utf-8");
    expect(raw).toMatch(/agent_handles/);
    expect(raw).toMatch(/enabled:\s*true/);

    const off = setAgentHandlesPref(ws, false);
    expect(off.enabled).toBe(false);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      false,
    );
    expect(resolveAgentHandlesPreference({ workspace: ws }).source).toBe(
      "workspace",
    );
  });

  it("buildConfigPrefsView shows consequence without YAML edit", () => {
    setAgentHandlesPref(ws, false);
    const view = buildConfigPrefsView(ws);
    expect(view.agent_handles.enabled).toBe(false);
    expect(view.consequence).toMatch(/OFF/);
    expect(view.lines.join("\n")).toMatch(/evolve config set/);
  });

  it("parseHandlesToggle + /config handles via slash", () => {
    expect(parseHandlesToggle("on")).toBe(true);
    expect(parseHandlesToggle("off")).toBe(false);
    const result = runSlashHandler("config", {
      workspace: ws,
      args: "handles on",
    });
    expect(result.message).toMatch(/ON/);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      true,
    );
  });

  it("handleConfigSurface set via argv positionals", () => {
    const r = handleConfigSurface(
      { group: "config", command: "set", workspace: ws },
      {
        argv: [
          "node",
          "evolve.js",
          "config",
          "set",
          "agent-handles",
          "on",
          "--workspace",
          ws,
        ],
      },
    );
    expect(r.handled).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      true,
    );
  });
});

describe("P0-2 config validate actionable", () => {
  let dir: string;
  const prevProfile = process.env.EVOLVELOOP_PROFILE_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "v42-val-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevProfile === undefined) delete process.env.EVOLVELOOP_PROFILE_PATH;
    else process.env.EVOLVELOOP_PROFILE_PATH = prevProfile;
  });

  it("invalid YAML reports file + key + fix", () => {
    const bad = join(dir, "bad.yaml");
    writeFileSync(bad, "knowledge:\n  backend: wiki\nmemory: [\n  broken\n");
    process.env.EVOLVELOOP_PROFILE_PATH = bad;
    const detailed = loadEvolveLoopProfileDetailed({ path: bad });
    expect(detailed.used_fallback).toBe(true);
    expect(detailed.issues.length).toBeGreaterThan(0);
    expect(detailed.issues[0]!.file).toBe(bad);
    expect(detailed.issues[0]!.key).toBe("(parse)");
    expect(detailed.issues[0]!.fix).toMatch(/YAML|sintaxe/i);

    const result = validateEvolveConfig({
      workspace: dir,
      profile_path: bad,
    });
    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toMatch(/ERRO|Correção/);
    expect(result.lines.join("\n")).toContain(bad);
  });

  it("invalid agent_handles.enabled reports key + fix", () => {
    const p = join(dir, "prof.yaml");
    writeFileSync(
      p,
      [
        "id: t",
        'version: "1"',
        "knowledge:",
        "  backend: wiki",
        "memory:",
        "  enabled: false",
        "preferences:",
        "  agent_handles:",
        "    enabled: maybe",
        "",
      ].join("\n"),
    );
    const detailed = loadEvolveLoopProfileDetailed({ path: p });
    const issue = detailed.issues.find((i) =>
      i.key.includes("agent_handles"),
    );
    expect(issue).toBeTruthy();
    expect(issue!.fix).toMatch(/true\|false/);
  });

  it("invalid workspace config.yaml is actionable", () => {
    mkdirSync(join(dir, ".evolveloop"), { recursive: true });
    const cfg = workspaceConfigPath(dir);
    writeFileSync(cfg, "agent_handles: [\n");
    const issues = validateWorkspaceConfigFile(cfg);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
    expect(issues[0]!.fix.length).toBeGreaterThan(5);
  });
});

describe("P0-3 onboarding prefs in readiness", () => {
  it("default readiness prefs Handles OFF + consequence + hint", () => {
    const prefs = defaultReadinessPrefs();
    expect(prefs.agent_handles.enabled).toBe(false);
    expect(prefs.agent_handles.consequence).toMatch(/OFF/);
    expect(prefs.hint).toMatch(/evolve config set/);

    const report = buildReadinessReport({
      workspace: "/tmp/ws-ready",
      probes: [
        { id: "node", status: "ok", message: "v22" },
        { id: "workspace", status: "ok", message: "ok" },
      ],
      credentials: { path: "x", written: [], present_names: [] },
      limits: DEFAULT_LIMITS,
    });
    expect(report.prefs.agent_handles.enabled).toBe(false);
    expect(report.message_pt).toMatch(/Handles OFF/i);
    expect(report.limitations.some((l) => /Agent Handles/i.test(l))).toBe(true);
  });
});

describe("P0-4 history list", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v42-hist-"));
    mkdirSync(join(ws, ".evolveloop"), { recursive: true });
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("lists contracts and sessions with explicit limitations", async () => {
    const { runIntentFlow } = await import("../../src/v3/intake/intent-flow.js");
    runIntentFlow({
      workspace: ws,
      intent: "Implementar histórico mínimo de Tasks",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-hist-1",
    });
    const db = new StateDb(join(ws, ".evolveloop", "state.db"));
    try {
      const lease = db.acquireWorkspaceLease({
        workspace_id: ws,
        holder_id: "v42-hist",
        lease_ms: 60_000,
      });
      db.createMsoSession({
        workspace_id: ws,
        fencing_token: lease.fencing_token,
        holder_id: "v42-hist",
        goal_contract_id: "gc-hist-1",
        work_id: "w-1",
        session_id: "mso-hist-1",
      });
    } finally {
      db.close();
    }

    const view = buildTaskHistoryView(ws);
    expect(view.lines[0]).toBe("Histórico");
    expect(view.limitations.length).toBeGreaterThan(0);
    expect(view.lines.join("\n")).toMatch(/Limitação/);
    expect(view.entries.length).toBeGreaterThan(0);

    const shown = showHistoryEntry(ws, view.entries[0]!.id);
    expect(shown.found).toBe(true);
    expect(shown.lines.join("\n")).toMatch(/retomável|limitação/i);

    const handled = handleHistorySurface(
      { group: "history", command: "list", workspace: ws },
      { argv: ["node", "evolve.js", "history", "list", "--workspace", ws] },
    );
    expect(handled.handled).toBe(true);
    expect(handled.exitCode).toBe(0);

    const slash = parseSlashCommand("/history");
    expect(slash.kind).toBe("slash");
    if (slash.kind === "slash") expect(slash.command).toBe("history");
  });

  it("empty workspace states limitation explicitly", () => {
    const view = buildTaskHistoryView(ws);
    expect(view.entries).toHaveLength(0);
    expect(view.lines.join("\n")).toMatch(/sem state\.db|vazio|Limitação/i);
  });
});

describe("P0-5 honest metrics compact + Delivery", () => {
  it("formatCompactHonestTok labels reported / estimated / hides UNAVAILABLE", () => {
    expect(
      formatCompactHonestTok({ value: 1200, provenance: "reported" }),
    ).toBe("1.2k (reported)");
    expect(
      formatCompactHonestTok({ value: 800, provenance: "estimated" }),
    ).toBe("800 (estimated)");
    expect(
      formatCompactHonestTok({ provenance: "UNAVAILABLE" }),
    ).toBeUndefined();
  });

  it("compact footer executing includes provenance labels", () => {
    const tel = buildFooterTelemetry(
      {
        workspace: "/tmp/ws",
        initialized: true,
        state_db_path: "/tmp/ws/.evolveloop/state.db",
        state_db_exists: true,
        contracts_count: 0,
        message_pt: "ok",
      },
      {
        executing: true,
        mso_state: "DELEGATING",
        tasks: [{ name: "t1" }],
        tok_mso: { value: 1500, provenance: "reported" },
        tok_workers: { value: 400, provenance: "estimated" },
        mso_model: "ollama",
      },
    );
    const compact = renderCompactFooter(tel);
    expect(compact.mode).toBe("executing");
    expect(compact.lines.join("\n")).toMatch(/reported/);
    expect(compact.lines.join("\n")).toMatch(/estimated/);
  });

  it("Delivery tokens distinguish medido / estimado / indisponível", () => {
    expect(formatDeliveryTokens(10, 20)).toContain("reported");
    expect(
      formatDeliveryTokens(
        { value: 10, provenance: "reported" },
        { value: 5, provenance: "estimated" },
      ),
    ).toBe("Tokens: Orchestrator 10 (reported) · Agents 5 (estimated)");
    expect(formatDeliveryTokens(undefined, undefined)).toBe(
      "Tokens: Orchestrator — (indisponível) · Agents — (indisponível)",
    );
    const card = buildDeliveryCardView({
      status: "PASS",
      diff_stat: "a.ts | 1 +",
      verification: { command: "npm test", exit_code: 0 },
      tok_mso: { value: 42, provenance: "reported" },
      tok_workers: { provenance: "UNAVAILABLE" },
    });
    expect(card.tokens_line).toContain("reported");
    expect(card.tokens_line).toContain("indisponível");
  });
});

describe("P0-6 workspace label journey vs integration", () => {
  it("journey help distinguishes Workspace cwd vs evolve workspace", () => {
    const help = formatJourneyHelp();
    expect(help).toMatch(/Workspace:.*cwd/i);
    expect(help).toMatch(/evolve workspace.*= integration/i);
    expect(help).toMatch(/evolve history/);
    expect(help).toMatch(/evolve config/);

    const advanced = formatAdvancedHelp();
    expect(advanced).toContain("integration/worktree");
    expect(advanced).toContain("glossary");
  });

  it("home resume labels cwd Workspace ≠ integration", () => {
    const session: WorkspaceSessionSnapshot = {
      workspace: "/home/u/proj",
      initialized: false,
      state_db_path: "/home/u/proj/.evolveloop/state.db",
      state_db_exists: false,
      contracts_count: 0,
      message_pt: "novo",
    };
    const view = buildHomeResumeView(session, { home: "/home/u" });
    expect(view.lines.join("\n")).toMatch(/integration\/worktree/);
    expect(view.lines.join("\n")).toMatch(/evolve setup/);
  });
});
