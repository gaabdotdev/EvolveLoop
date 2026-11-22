/**
 * REMED-M4 — First-run setup: Agent Handles preference (ON/OFF/skip→OFF).
 * Workspace persist; profile untouched; backend-absent warning; presented==persisted.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatAgentHandlesChoicePrompt,
  HANDLES_ON_NO_BACKEND_WARNING,
  prefsForHandles,
  runFirstRunSetup,
  type ProbeResult,
} from "../../src/v3/evolve-shell/first-run-setup.js";
import {
  HANDLES_CONSEQUENCE_OFF,
  HANDLES_CONSEQUENCE_ON,
  isAgentHandlesEnabled,
  resolveAgentHandlesPreference,
  workspaceConfigPath,
} from "../../src/v3/agent-handles/preference.js";
import {
  buildConfigPrefsView,
  setAgentHandlesPref,
} from "../../src/cli/config-surface.js";
import { DEFAULT_PROFILE } from "../../src/config/profile.js";

const OK_PROBES: ProbeResult[] = [
  { id: "node", status: "ok", message: "v22" },
  { id: "workspace", status: "ok", message: "ok" },
];

const MUX_PRESENT = { tmux: true, zellij: false, any: true };
const MUX_ABSENT = { tmux: false, zellij: false, any: false };

describe("REMED-M4 first-run Agent Handles preference", () => {
  let ws: string;
  const prevEnv = process.env.EVOLVELOOP_AGENT_HANDLES;
  const prevProfile = process.env.EVOLVELOOP_PROFILE_PATH;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "remed-m4-"));
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
    delete process.env.EVOLVELOOP_PROFILE_PATH;
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.EVOLVELOOP_AGENT_HANDLES;
    else process.env.EVOLVELOOP_AGENT_HANDLES = prevEnv;
    if (prevProfile === undefined) delete process.env.EVOLVELOOP_PROFILE_PATH;
    else process.env.EVOLVELOOP_PROFILE_PATH = prevProfile;
  });

  it("ON: persists workspace enabled:true and presents matching prefs", async () => {
    const report = await runFirstRunSetup({
      workspace: ws,
      non_interactive: true,
      agent_handles_enabled: true,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });

    expect(report.prefs.agent_handles.enabled).toBe(true);
    expect(report.prefs.agent_handles.consequence).toBe(HANDLES_CONSEQUENCE_ON);
    expect(report.message_pt).toMatch(/Agent Handles ON/);
    expect(report.limitations.some((l) => l.includes(HANDLES_ON_NO_BACKEND_WARNING))).toBe(
      false,
    );

    const cfg = workspaceConfigPath(ws);
    expect(existsSync(cfg)).toBe(true);
    expect(readFileSync(cfg, "utf-8")).toMatch(/enabled:\s*true/);
    const resolved = resolveAgentHandlesPreference({
      workspace: ws,
      profile: DEFAULT_PROFILE,
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe("workspace");
    // presented == persisted
    expect(report.prefs.agent_handles.enabled).toBe(resolved.enabled);
  });

  it("OFF: persists workspace enabled:false with OFF consequence", async () => {
    const report = await runFirstRunSetup({
      workspace: ws,
      non_interactive: true,
      agent_handles_enabled: false,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });

    expect(report.prefs.agent_handles.enabled).toBe(false);
    expect(report.prefs.agent_handles.consequence).toBe(HANDLES_CONSEQUENCE_OFF);
    expect(report.message_pt).toMatch(/Agent Handles OFF/);
    expect(readFileSync(workspaceConfigPath(ws), "utf-8")).toMatch(/enabled:\s*false/);
    expect(
      isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE }),
    ).toBe(false);
    expect(report.prefs.agent_handles.enabled).toBe(
      resolveAgentHandlesPreference({ workspace: ws }).enabled,
    );
  });

  it("skip / absence → OFF (never ON by default)", async () => {
    const skipped = await runFirstRunSetup({
      workspace: ws,
      non_interactive: false,
      ask_agent_handles: () => undefined,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });
    expect(skipped.prefs.agent_handles.enabled).toBe(false);
    expect(skipped.message_pt).toMatch(/OFF/);

    const absent = await runFirstRunSetup({
      workspace: join(ws, "absent"),
      non_interactive: true,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });
    expect(absent.prefs.agent_handles.enabled).toBe(false);
    expect(
      resolveAgentHandlesPreference({ workspace: join(ws, "absent") }).enabled,
    ).toBe(false);
  });

  it("ask false → OFF; ask true → ON", async () => {
    const off = await runFirstRunSetup({
      workspace: join(ws, "ask-off"),
      non_interactive: false,
      ask_agent_handles: () => false,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });
    expect(off.prefs.agent_handles.enabled).toBe(false);

    const on = await runFirstRunSetup({
      workspace: join(ws, "ask-on"),
      non_interactive: false,
      ask_agent_handles: async () => true,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });
    expect(on.prefs.agent_handles.enabled).toBe(true);
    expect(on.prefs.agent_handles.enabled).toBe(
      resolveAgentHandlesPreference({ workspace: join(ws, "ask-on") }).enabled,
    );
  });

  it("workspace override does not mutate global profile", async () => {
    const profilePath = join(ws, "profile.yaml");
    const profileBody = [
      "id: remed-m4",
      'version: "1"',
      "knowledge:",
      "  backend: wiki",
      "memory:",
      "  enabled: false",
      "preferences:",
      "  agent_handles:",
      "    enabled: false",
      "",
    ].join("\n");
    writeFileSync(profilePath, profileBody, "utf-8");
    process.env.EVOLVELOOP_PROFILE_PATH = profilePath;

    await runFirstRunSetup({
      workspace: ws,
      non_interactive: true,
      agent_handles_enabled: true,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });

    expect(readFileSync(profilePath, "utf-8")).toBe(profileBody);
    expect(readFileSync(workspaceConfigPath(ws), "utf-8")).toMatch(/enabled:\s*true/);
    expect(
      resolveAgentHandlesPreference({ workspace: ws }).source,
    ).toBe("workspace");
  });

  it("ON without mux backend → actionable warning (not claimed fully functional)", async () => {
    const report = await runFirstRunSetup({
      workspace: ws,
      non_interactive: true,
      agent_handles_enabled: true,
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_ABSENT,
    });

    expect(report.prefs.agent_handles.enabled).toBe(true);
    expect(report.limitations).toContain(HANDLES_ON_NO_BACKEND_WARNING);
    expect(HANDLES_ON_NO_BACKEND_WARNING).toMatch(/tmux|Zellij/i);
    expect(HANDLES_ON_NO_BACKEND_WARNING).toMatch(
      /evolve config set agent-handles off|Instale tmux/i,
    );
    // still persisted as chosen ON — warning is honest about backend gap
    expect(report.prefs.agent_handles.enabled).toBe(
      resolveAgentHandlesPreference({ workspace: ws }).enabled,
    );
  });

  it("presented prefs match config surface consequences (shared copy)", () => {
    const prompt = formatAgentHandlesChoicePrompt().join("\n");
    expect(prompt).toContain("[on]");
    expect(prompt).toContain("[off]");
    expect(prompt).toMatch(/skip.*OFF/i);
    expect(prompt).toContain(HANDLES_CONSEQUENCE_ON);
    expect(prompt).toContain(HANDLES_CONSEQUENCE_OFF);
    expect(prompt).toMatch(/config set agent-handles/);

    expect(prefsForHandles(true).agent_handles.consequence).toBe(
      HANDLES_CONSEQUENCE_ON,
    );
    expect(prefsForHandles(false).agent_handles.consequence).toBe(
      HANDLES_CONSEQUENCE_OFF,
    );

    setAgentHandlesPref(ws, true);
    const view = buildConfigPrefsView(ws);
    expect(view.consequence).toBe(HANDLES_CONSEQUENCE_ON);
    expect(view.hint_cli).toMatch(/config set agent-handles/);
  });

  it("does not break credentials / limits when setting Handles", async () => {
    const report = await runFirstRunSetup({
      workspace: ws,
      non_interactive: true,
      agent_handles_enabled: true,
      credentials: [{ name: "OPENROUTER_API_KEY", value: "sk-remed-m4-secret" }],
      limits: { max_parallel_tasks: 3 },
      probes: () => OK_PROBES,
      detect_mux_backend: () => MUX_PRESENT,
    });

    expect(report.credentials.written).toContain("OPENROUTER_API_KEY");
    expect(report.credentials.present_names).toContain("OPENROUTER_API_KEY");
    expect(JSON.stringify(report)).not.toContain("sk-remed-m4-secret");
    expect(report.limits.max_parallel_tasks).toBe(3);
    expect(existsSync(join(ws, ".evolveloop", "credentials.env"))).toBe(true);
    expect(existsSync(join(ws, ".evolveloop", "limits.json"))).toBe(true);
    expect(report.prefs.agent_handles.enabled).toBe(true);
  });
});
