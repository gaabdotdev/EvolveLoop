/**
 * V5-M04 — Tool Registry & assignment (deny-by-default; MCP honesty).
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  agentMayUseTool,
  assignToolsToAgent,
  invokeMcpTool,
  listTools,
  openToolFreedom,
  registerMcpServer,
  registerTool,
  ToolRegistryError,
} from "../../src/v3/tool-registry/index.js";

describe("V5-M04 Tool Registry & assignment", () => {
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

  function freshRoot(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m04-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("seeds shell.exec + fs.read stubs with honest contracts", () => {
    const { registry } = openToolFreedom(freshRoot("seed"));
    const snap = registry.seed();
    expect(snap.kind).toBe("ToolRegistry");
    const ids = listTools(registry).map((t) => t.tool_id);
    expect(ids).toEqual(["fs.read", "shell.exec"]);

    const shell = registry.get("shell.exec");
    expect(shell.implementation).toBe("native_stub");
    expect(shell.honesty).toBe("partial");
    expect(shell.capability_action).toBe("shell.execute");
    expect(shell.limitations.some((l) => /stub/i.test(l))).toBe(true);

    const fsRead = registry.get("fs.read");
    expect(fsRead.implementation).toBe("native_stub");
    expect(fsRead.honesty).toBe("partial");
    expect(fsRead.capability_action).toBe("filesystem.read");
  });

  it("registerTool + listTools persist JSON", () => {
    const root = freshRoot("reg");
    const tf = openToolFreedom(root);
    tf.registry.seed();
    registerTool(tf.registry, {
      tool_id: "other.custom",
      display_name: "Custom",
      tool_kind: "other",
      implementation: "unsupported",
      honesty: "unsupported",
      notes: ["test"],
      limitations: ["no invoke"],
      enabled: true,
    });
    const ids = tf.listTools().map((t) => t.tool_id);
    expect(ids).toContain("other.custom");
    expect(ids).toContain("shell.exec");
    expect(existsSync(join(root, "tools.json"))).toBe(true);
    const raw = JSON.parse(readFileSync(join(root, "tools.json"), "utf-8"));
    expect(raw.kind).toBe("ToolRegistry");
  });

  it("assignToolsToAgent then agentMayUseTool allow; deny-by-default otherwise", () => {
    const tf = openToolFreedom(freshRoot("assign"));
    tf.registry.seed();

    const deniedNoAssign = tf.agentMayUseTool("agent-a", "shell.exec");
    expect(deniedNoAssign.allowed).toBe(false);
    expect(deniedNoAssign.verdict).toBe("deny");
    expect(deniedNoAssign.reason).toBe("no_assignment_deny_default");

    assignToolsToAgent(tf.assignments, "agent-a", ["shell.exec"]);
    const allowed = agentMayUseTool(tf.registry, tf.assignments, {
      agent_id: "agent-a",
      tool_id: "shell.exec",
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe("assigned_and_enabled");

    const deniedOther = tf.agentMayUseTool("agent-a", "fs.read");
    expect(deniedOther.allowed).toBe(false);
    expect(deniedOther.reason).toBe("tool_not_in_allowlist");

    const deniedOtherAgent = tf.agentMayUseTool("agent-b", "shell.exec");
    expect(deniedOtherAgent.allowed).toBe(false);
    expect(deniedOtherAgent.reason).toBe("no_assignment_deny_default");
  });

  it("empty allowlist and unknown tool deny", () => {
    const tf = openToolFreedom(freshRoot("deny"));
    tf.registry.seed();
    tf.assignToolsToAgent("agent-z", []);
    expect(tf.agentMayUseTool("agent-z", "shell.exec").allowed).toBe(false);
    expect(tf.agentMayUseTool("agent-z", "shell.exec").reason).toBe(
      "tool_not_in_allowlist",
    );
    expect(tf.agentMayUseTool("agent-z", "nope").reason).toBe("tool_not_registered");
  });

  it("registerMcpServer records config as unsupported; invoke refused", () => {
    const tf = openToolFreedom(freshRoot("mcp"));
    tf.registry.seed();

    const rec = registerMcpServer(tf.mcp, {
      server_id: "playwright",
      display_name: "Playwright MCP",
      config: { command: "npx", args: ["@playwright/mcp"] },
      notes: ["from test"],
    }, { toolRegistry: tf.registry });

    expect(rec.kind).toBe("McpServerRecord");
    expect(rec.honesty).toBe("unsupported");
    expect(rec.invoke_supported).toBe(false);
    expect(rec.config.command).toBe("npx");
    expect(rec.limitations.some((l) => /ADR-004|LIMITATION-mcp/i.test(l))).toBe(
      true,
    );

    const mirrored = tf.registry.get("mcp.playwright");
    expect(mirrored.honesty).toBe("unsupported");
    expect(mirrored.enabled).toBe(false);
    expect(mirrored.implementation).toBe("mcp_config");

    // Assigned but disabled → still deny
    tf.assignToolsToAgent("agent-mcp", ["mcp.playwright"]);
    const deniedDisabled = tf.agentMayUseTool("agent-mcp", "mcp.playwright");
    expect(deniedDisabled.allowed).toBe(false);
    expect(deniedDisabled.reason).toBe("tool_disabled");

    expect(() => invokeMcpTool("playwright", "browser_navigate", {})).toThrow(
      ToolRegistryError,
    );
    try {
      invokeMcpTool("playwright", "browser_navigate", {});
    } catch (e) {
      expect(e).toBeInstanceOf(ToolRegistryError);
      expect((e as ToolRegistryError).code).toBe("MCP_INVOKE_UNSUPPORTED");
    }
  });

  it("openToolFreedom helpers + toolRegistryDir path separate from agents", () => {
    const root = freshRoot("paths");
    const paths = resolveV3DataPaths(join(root, "v3"));
    expect(paths.toolRegistryDir).toContain("tool-registry");
    expect(paths.toolRegistryDir).not.toBe(paths.agentsDir);
    expect(paths.toolRegistryDir).not.toBe(paths.modelRegistryDir);

    const tf = openToolFreedom(paths.toolRegistryDir);
    tf.registry.seed();
    tf.registerTool({
      tool_id: "extra.tool",
      display_name: "Extra",
      tool_kind: "other",
      honesty: "unknown",
    });
    tf.assignToolsToAgent("ag-1", ["fs.read", "extra.tool"]);
    expect(tf.agentMayUseTool("ag-1", "fs.read").allowed).toBe(true);
    expect(tf.agentMayUseTool("ag-1", "shell.exec").allowed).toBe(false);

    const mcp = tf.registerMcpServer({
      server_id: "context7",
      config: { transport: "stdio" },
    });
    expect(mcp.invoke_supported).toBe(false);
  });

  it("no global allowlist: assigning one agent does not grant another", () => {
    const tf = openToolFreedom(freshRoot("noglobal"));
    tf.registry.seed();
    tf.assignToolsToAgent("only-one", ["fs.read", "shell.exec"]);
    expect(tf.agentMayUseTool("only-one", "fs.read").allowed).toBe(true);
    expect(tf.agentMayUseTool("someone-else", "fs.read").allowed).toBe(false);
    expect(tf.agentMayUseTool("someone-else", "shell.exec").allowed).toBe(false);
  });
});
