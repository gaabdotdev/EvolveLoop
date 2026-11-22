/**
 * V1-TOK-03 — Deterministic def/ref pre-resolution via tree-sitter (no grep/rg).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SYMBOL_MAP_ENGINE,
  resolveDefinitionSync,
  resolveReferencesSync,
  preResolveForTurn1,
  formatLocationCompact,
  symbolResolveUsesShellGrep,
  NullLanguageServerClient,
  resolveDefinition,
  resolveReferences,
} from "../../src/v3/token-economy/index.js";
import {
  buildMsoSymbolContext,
  prepareMsoAnalyzingPayload,
  serializeMsoSymbolContext,
} from "../../src/v3/mso/index.js";

const RESOLVE_SRC = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../src/v3/token-economy/symbol-resolve.ts",
);
const MAP_SRC = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../src/v3/token-economy/symbol-map.ts",
);

const MATH_TS = `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

const USE_TS = `import { add, multiply } from "./math.js";

export function sumThenDouble(x: number, y: number): number {
  const s = add(x, y);
  return multiply(s, 2);
}

export function justAdd(x: number, y: number): number {
  return add(x, y);
}
`;

describe("V1-TOK-03 symbol resolve (tree-sitter, no grep)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok-resolve-"));
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "math.ts"), MATH_TS, "utf-8");
    await fs.writeFile(path.join(tmp, "src", "use.ts"), USE_TS, "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("resolves definitions and cross-file references without shelling rg", () => {
    expect(SYMBOL_MAP_ENGINE).toBe("tree-sitter");
    expect(symbolResolveUsesShellGrep()).toBe(false);

    // Static contract: resolve path must not shell out (no child_process).
    for (const srcPath of [RESOLVE_SRC, MAP_SRC]) {
      const src = readFileSync(srcPath, "utf-8");
      expect(src).not.toMatch(/from ["']node:child_process["']/);
      expect(src).not.toMatch(/require\(["']child_process["']\)/);
      expect(src).not.toMatch(/spawnSync|execSync|execFileSync/);
    }

    const defs = resolveDefinitionSync(tmp, "src/math.ts", 1, "add", {
      search_files: ["src/math.ts", "src/use.ts"],
    });
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs.some((d) => d.path.includes("math.ts") && d.name === "add")).toBe(true);
    expect(defs.every((d) => d.engine === "tree-sitter")).toBe(true);

    const refs = resolveReferencesSync(tmp, "src/math.ts", "add", {
      search_files: ["src/math.ts", "src/use.ts"],
    });
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.every((r) => r.name === "add")).toBe(true);
    expect(refs.some((r) => r.path.includes("use.ts"))).toBe(true);
    // Definition site must not be classified as a reference
    expect(refs.every((r) => !(r.path.includes("math.ts") && r.line === 1))).toBe(true);
  });

  it("preResolveForTurn1 emits compact TSV defs/refs for multi-file workspace", () => {
    const turn1 = preResolveForTurn1({
      workspace_root: tmp,
      file_paths: ["src/math.ts", "src/use.ts"],
      symbols: ["add", "multiply"],
    });

    expect(turn1.kind).toBe("Turn1SymbolResolve");
    expect(turn1.engine).toBe("tree-sitter");
    expect(turn1.symbols).toEqual(["add", "multiply"]);
    expect(turn1.definitions.length).toBeGreaterThanOrEqual(2);
    expect(turn1.references.length).toBeGreaterThanOrEqual(2);

    const compact = turn1.compact.join("\n");
    expect(compact).toMatch(/^def\|/m);
    expect(compact).toMatch(/^ref\|/m);
    expect(compact).toContain("add");
    expect(compact).toContain("multiply");
    // No function bodies
    expect(compact).not.toContain("return a + b");
    expect(compact).not.toContain("sumThenDouble");

    const row = formatLocationCompact("def", turn1.definitions[0]!);
    expect(row.startsWith("def|")).toBe(true);
    expect(row.split("|").length).toBeGreaterThanOrEqual(5);
  });

  it("MSO ANALYZING injects resolved defs/refs on turn-1 context assembly", () => {
    const ctx = buildMsoSymbolContext({
      state: "ANALYZING",
      workspace_root: tmp,
      file_paths: ["src/math.ts", "src/use.ts"],
      resolve_symbols: ["add"],
    });

    expect(ctx.symbol_resolve.definitions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.symbol_resolve.references.length).toBeGreaterThanOrEqual(1);
    expect(ctx.symbol_resolve.compact.some((r) => r.startsWith("def|"))).toBe(true);
    expect(ctx.symbol_resolve.compact.some((r) => r.startsWith("ref|"))).toBe(true);

    const serialized = serializeMsoSymbolContext(ctx);
    expect(serialized.symbol_resolve).toBeDefined();
    const json = JSON.stringify(serialized);
    expect(json).not.toContain("return a + b");
    expect(json).not.toContain(MATH_TS);

    const prepared = prepareMsoAnalyzingPayload({
      state: "DECOMPOSING",
      workspace_root: tmp,
      file_paths: ["src/math.ts", "src/use.ts"],
      resolve_symbols: ["add", "multiply"],
    });
    expect(Array.isArray(prepared.payload.resolved_defs)).toBe(true);
    expect(Array.isArray(prepared.payload.resolved_refs)).toBe(true);
    expect((prepared.payload.resolved_defs as string[]).length).toBeGreaterThan(0);
    expect((prepared.payload.resolved_refs as string[]).length).toBeGreaterThan(0);
  });

  it("optional LSP stub is unused by default; NullLanguageServerClient returns null", async () => {
    const lsp = new NullLanguageServerClient();
    const defs = await resolveDefinition(tmp, "src/math.ts", 1, "add", { lsp });
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs[0]?.engine).toBe("tree-sitter");

    const refs = await resolveReferences(tmp, "src/use.ts", "multiply", {
      lsp,
      search_files: ["src/math.ts", "src/use.ts"],
    });
    expect(refs.some((r) => r.path.includes("use.ts"))).toBe(true);
    expect(refs.every((r) => r.engine === "tree-sitter")).toBe(true);
  });
});
