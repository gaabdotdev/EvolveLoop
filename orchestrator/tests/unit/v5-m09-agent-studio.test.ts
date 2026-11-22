/**
 * V5-M09 — Agent Studio declarative slice (no visual builder).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  AgentStudioError,
  assertAgentConfigCapabilities,
  exportAgentConfig,
  importAgentConfig,
  loadAgentConfig,
  loadTeamComposition,
  loadWorkflowYaml,
  parseAgentConfig,
  saveAgentConfig,
  saveTeamComposition,
  saveWorkflow,
  stripSecrets,
  validateAgentConfigCapabilities,
  type AgentConfig,
  type TeamComposition,
  type WorkflowModel,
} from "../../src/v3/agent-studio/index.js";

describe("V5-M09 Agent Studio", () => {
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

  function fresh(tag: string): string {
    const root = mkdtempSync(join(tmpdir(), `v5-m09-${tag}-`));
    dirs.push(root);
    return root;
  }

  it("paths.agentStudioDir additive", () => {
    const paths = resolveV3DataPaths(join(fresh("paths"), "v3"));
    expect(paths.agentStudioDir).toContain("agent-studio");
  });

  it("load/save/import/export strips secrets", () => {
    const dir = fresh("io");
    const path = join(dir, "agent.yaml");
    const dirty = {
      kind: "AgentConfig",
      name: "coder",
      adapter: "cursor",
      model_ref: "ollama/llama",
      tools_allowlist: ["fs.read"],
      api_key: "SECRET_SHOULD_NOT_PERSIST",
      limits: { max_attempts: 3 },
    };
    const cfg = parseAgentConfig(dirty);
    expect(cfg.notes?.some((n) => n.includes("stripped_secret"))).toBe(true);
    expect(JSON.stringify(cfg)).not.toContain("SECRET_SHOULD_NOT_PERSIST");

    const saved = saveAgentConfig(path, {
      ...cfg,
      // attempt to sneak secret back
      notes: [...(cfg.notes ?? []), "ok"],
    } as AgentConfig & { api_key?: string });
    expect(saved.stripped_keys.length).toBeGreaterThanOrEqual(0);
    const disk = readFileSync(path, "utf-8");
    expect(disk).not.toMatch(/SECRET_SHOULD_NOT_PERSIST/);

    const loaded = loadAgentConfig(path);
    expect(loaded.name).toBe("coder");
    expect(loaded.adapter).toBe("cursor");

    const exported = exportAgentConfig(loaded, "json");
    expect(exported).not.toMatch(/"api_key"\s*:/);
    expect(exported).not.toContain("SECRET_SHOULD_NOT_PERSIST");

    const imported = importAgentConfig(
      JSON.stringify({
        name: "imp",
        adapter: "claude-code",
        tools_allowlist: [],
        token: "nope",
      }),
      "json",
    );
    expect(imported.name).toBe("imp");
    expect(JSON.stringify(imported)).not.toContain("nope");

    const { cleaned, stripped_keys } = stripSecrets({
      password: "x",
      nested: { access_token: "y", keep: 1 },
    });
    expect(stripped_keys.length).toBeGreaterThanOrEqual(2);
    expect((cleaned as { nested: { keep: number } }).nested.keep).toBe(1);
  });

  it("team composition JSON round-trip", () => {
    const dir = fresh("team");
    const path = join(dir, "team.json");
    const team: TeamComposition = {
      kind: "TeamComposition",
      schema_version: "1.0.0",
      name: "core",
      agents: [
        { name: "planner", role: "plan" },
        { name: "implementer", role: "implement", agent_config_ref: "coder" },
      ],
      roles: ["plan", "implement"],
    };
    saveTeamComposition(path, team);
    const loaded = loadTeamComposition(path);
    expect(loaded.agents).toHaveLength(2);
    expect(loaded.roles).toEqual(["plan", "implement"]);
  });

  it("workflow YAML load — single canonical model", () => {
    const dir = fresh("wf");
    const path = join(dir, "flow.yaml");
    writeFileSync(
      path,
      [
        "kind: WorkflowModel",
        "name: ship",
        "nodes:",
        "  - id: start",
        "    type: start",
        "  - id: impl",
        "    type: task",
        "    agent: coder",
        "  - id: gate",
        "    type: approval",
        "    approval: human-1",
        "  - id: end",
        "    type: end",
        "edges:",
        "  - from: start",
        "    to: impl",
        "  - from: impl",
        "    to: gate",
        "  - from: gate",
        "    to: end",
        "approvals:",
        "  - id: human-1",
        "    required: true",
        "    description: Ship gate",
        "",
      ].join("\n"),
      "utf-8",
    );
    const wf = loadWorkflowYaml(path);
    expect(wf.kind).toBe("WorkflowModel");
    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(3);
    expect(wf.approvals[0]?.id).toBe("human-1");

    const out = join(dir, "flow-out.yaml");
    saveWorkflow(out, wf);
    const again = loadWorkflowYaml(out);
    expect(again.name).toBe("ship");
  });

  it("rejects config claiming pause when adapter cancel is unsupported", () => {
    // catalog: codex cancel = unsupported
    const bad: AgentConfig = {
      kind: "AgentConfig",
      schema_version: "1.0.0",
      name: "codex-pauser",
      adapter: "codex",
      tools_allowlist: [],
      capabilities_claimed: { pause: true },
    };
    const result = validateAgentConfigCapabilities(bad);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.claim === "pause")).toBe(true);
    expect(() => assertAgentConfigCapabilities(bad)).toThrow(AgentStudioError);

    // cursor cancel = partial → pause claim OK
    const ok: AgentConfig = {
      kind: "AgentConfig",
      schema_version: "1.0.0",
      name: "cursor-agent",
      adapter: "cursor",
      tools_allowlist: ["shell"],
      capabilities_claimed: { pause: true },
    };
    expect(validateAgentConfigCapabilities(ok).ok).toBe(true);
  });

  it("rejects unknown adapter when validating", () => {
    const cfg: AgentConfig = {
      kind: "AgentConfig",
      schema_version: "1.0.0",
      name: "x",
      adapter: "not-a-real-adapter",
      tools_allowlist: [],
      capabilities_claimed: { pause: true },
    };
    expect(() => validateAgentConfigCapabilities(cfg)).toThrow(/UNKNOWN_ADAPTER/);
  });
});
