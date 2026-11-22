/**
 * V1-TOK-07 — Lazy Tool Schemas: ≤4 tools per official MSO state, only relevant ones.
 */

import { describe, it, expect } from "vitest";
import { MSO_STATES } from "../../src/v3/mso/states.js";
import {
  LAZY_TOOLS_MAX,
  MSO_STATE_TOOL_NAMES,
  selectToolsForMsoState,
  selectToolNamesForMsoState,
  listLazyToolCatalogNames,
} from "../../src/v3/token-economy/index.js";
import { EngineeringWorkspace } from "../../src/v3/engineering/index.js";
import { prepareMsoAnalyzingPayload } from "../../src/v3/mso/analyzing-context.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("V1-TOK-07 lazy tool schemas", () => {
  it("each official MSO state returns ≤4 tools", () => {
    for (const state of MSO_STATES) {
      const tools = selectToolsForMsoState(state);
      expect(tools.length).toBeLessThanOrEqual(LAZY_TOOLS_MAX);
      expect(tools.length).toBe(MSO_STATE_TOOL_NAMES[state].length);
      expect(tools.length).toBeGreaterThan(0);
    }
  });

  it("returns only relevant tools per state", () => {
    const analyzing = selectToolNamesForMsoState("ANALYZING");
    expect(analyzing).toEqual([
      "outline_file",
      "read_lines",
      "resolve_definition",
      "resolve_references",
    ]);
    expect(analyzing).not.toContain("surgical_edit");
    expect(analyzing).not.toContain("run_tests");

    const delegating = selectToolNamesForMsoState("DELEGATING");
    expect(delegating).toContain("surgical_edit");
    expect(delegating).toContain("run_tests");
    expect(delegating).not.toContain("resolve_definition");
    expect(delegating.length).toBeLessThanOrEqual(4);

    const loading = selectToolNamesForMsoState("LOADING_GOALS");
    expect(loading).toContain("load_goal_document");
    expect(loading).not.toContain("surgical_edit");
  });

  it("tool schemas are function-type with additionalProperties false", () => {
    const tools = selectToolsForMsoState("VALIDATING");
    for (const t of tools) {
      expect(t.type).toBe("function");
      expect(t.function.name.length).toBeGreaterThan(0);
      expect(t.function.parameters.additionalProperties).toBe(false);
    }
  });

  it("rejects unknown MSO state", () => {
    expect(() => selectToolsForMsoState("NOT_A_STATE")).toThrow(/invalid MSO state/);
  });

  it("catalog is larger than any single state subset", () => {
    const catalog = listLazyToolCatalogNames();
    expect(catalog.length).toBeGreaterThan(LAZY_TOOLS_MAX);
    for (const state of MSO_STATES) {
      expect(selectToolNamesForMsoState(state).length).toBeLessThan(catalog.length);
    }
  });

  it("wires through EngineeringWorkspace.agentToolsForMsoState", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok07-ws-"));
    try {
      const ws = new EngineeringWorkspace(tmp);
      const tools = ws.agentToolsForMsoState("ANALYZING");
      expect(tools.length).toBeLessThanOrEqual(4);
      expect(tools.map((t) => t.function.name)).toContain("outline_file");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("wires tools into prepareMsoAnalyzingPayload", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok07-mso-"));
    try {
      await fs.writeFile(
        path.join(tmp, "a.ts"),
        "export function foo() { return 1; }\n",
        "utf-8",
      );
      const { payload } = prepareMsoAnalyzingPayload({
        state: "ANALYZING",
        workspace_root: tmp,
        file_paths: ["a.ts"],
        pre_resolve: false,
      });
      const tools = payload.tools as { function: { name: string } }[];
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeLessThanOrEqual(4);
      expect(tools.map((t) => t.function.name)).toEqual([
        "outline_file",
        "read_lines",
        "resolve_definition",
        "resolve_references",
      ]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
