/**
 * V1-TOK-02 — Symbol map mandatory in ANALYZING/DECOMPOSING; no full files to MSO.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SYMBOL_MAP_ENGINE,
  getSymbolMapTreeSitterInitError,
  buildFileSymbolMap,
  buildRepoSymbolMap,
  formatSymbolMapCompact,
} from "../../src/v3/token-economy/index.js";
import {
  MSO_SYMBOL_MAP_STATES,
  requiresSymbolMap,
  buildMsoSymbolContext,
  serializeMsoSymbolContext,
  guardMsoContextAgainstFullFiles,
  prepareMsoAnalyzingPayload,
  MsoError,
} from "../../src/v3/mso/index.js";

const SAMPLE_TS = `/**
 * Sample module for symbol-map tests.
 */

export interface Greeter {
  greet(name: string): string;
}

export class HelloService {
  constructor(private readonly prefix: string) {}

  greet(name: string): string {
    return \`\${this.prefix} \${name}\`;
  }

  farewell(name: string): string {
    return \`bye \${name}\`;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}

export const multiply = (a: number, b: number) => a * b;
`;

describe("V1-TOK-02 symbol map + MSO analyzing context", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok-sym-"));
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "sample.ts"), SAMPLE_TS, "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("builds a compact symbol map for a sample TypeScript file via tree-sitter", () => {
    expect(getSymbolMapTreeSitterInitError()).toBeNull();
    expect(SYMBOL_MAP_ENGINE).toBe("tree-sitter");

    const map = buildFileSymbolMap(tmp, "src/sample.ts");
    expect(map.kind).toBe("FileSymbolMap");
    expect(map.engine).toBe("tree-sitter");
    expect(map.total_lines).toBeGreaterThan(10);
    expect(map.symbols.length).toBeGreaterThanOrEqual(3);

    const names = new Set(map.symbols.map((s) => s.name));
    expect(
      names.has("HelloService") || names.has("add") || names.has("Greeter") || names.has("multiply"),
    ).toBe(true);

    for (const s of map.symbols) {
      expect(s.start_line).toBeGreaterThanOrEqual(1);
      expect(s.end_line).toBeGreaterThanOrEqual(s.start_line);
      expect(s.signature.length).toBeGreaterThan(0);
      // Must not embed entire file in one signature
      expect(s.signature.includes("export function add") && s.signature.includes("multiply")).toBe(
        false,
      );
    }

    const compact = formatSymbolMapCompact(map);
    expect(compact).toContain("|");
    expect(compact).not.toContain("return `${this.prefix}");
    // Full function body should not appear in compact rows
    expect(compact.includes("return a + b")).toBe(false);
  });

  it("MSO ANALYZING/DECOMPOSING require symbol maps and exclude full file content", () => {
    expect(MSO_SYMBOL_MAP_STATES).toEqual(["ANALYZING", "DECOMPOSING"]);
    expect(requiresSymbolMap("ANALYZING")).toBe(true);
    expect(requiresSymbolMap("DECOMPOSING")).toBe(true);
    expect(requiresSymbolMap("DELEGATING")).toBe(false);

    for (const state of MSO_SYMBOL_MAP_STATES) {
      const ctx = buildMsoSymbolContext({
        state,
        workspace_root: tmp,
        file_paths: ["src/sample.ts"],
      });
      expect(ctx.kind).toBe("MsoSymbolContext");
      expect(ctx.state).toBe(state);
      expect(ctx.symbol_map.files).toHaveLength(1);
      expect(ctx.directory_tree).toContain("src");
      expect(ctx.compact.length).toBeGreaterThan(0);

      const serialized = serializeMsoSymbolContext(ctx);
      const json = JSON.stringify(serialized);
      expect(json).not.toContain(SAMPLE_TS);
      expect(json).not.toContain("return a + b");
      expect(serialized).not.toHaveProperty("content");
      expect(serialized).not.toHaveProperty("file_content");

      const prepared = prepareMsoAnalyzingPayload({
        state,
        workspace_root: tmp,
        file_paths: ["src/sample.ts"],
      });
      expect(prepared.payload.mso_state).toBe(state);
      expect(prepared.payload.symbol_context).toBeDefined();
      const payloadJson = JSON.stringify(prepared.payload);
      expect(payloadJson).not.toContain("return a + b");
      expect(payloadJson.includes(SAMPLE_TS)).toBe(false);
    }

    expect(() =>
      buildMsoSymbolContext({
        state: "DELEGATING",
        workspace_root: tmp,
        file_paths: ["src/sample.ts"],
      }),
    ).toThrow(MsoError);
  });

  it("guard rejects or strips full-file payloads intended for MSO", () => {
    const rejected = guardMsoContextAgainstFullFiles(
      {
        note: "ok",
        file_content: SAMPLE_TS,
      },
      { mode: "reject" },
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/FULL_FILE_FORBIDDEN|full-file|file body/i);

    const stripped = guardMsoContextAgainstFullFiles(
      {
        note: "ok",
        content: SAMPLE_TS,
        symbol_hint: "add",
      },
      { mode: "strip" },
    );
    expect(stripped.ok).toBe(true);
    expect(stripped.stripped_keys.some((k) => k.includes("content"))).toBe(true);
    expect(stripped.payload).toBeDefined();
    expect(stripped.payload!).not.toHaveProperty("content");
    expect(stripped.payload!.note).toBe("ok");

    expect(() =>
      prepareMsoAnalyzingPayload({
        state: "ANALYZING",
        workspace_root: tmp,
        file_paths: ["src/sample.ts"],
        extra: { content: SAMPLE_TS },
        guard_mode: "reject",
      }),
    ).toThrow(/full-file|FULL_FILE_FORBIDDEN|file body/i);
  });

  it("repo symbol map aggregates multiple files without bodies", () => {
    const repo = buildRepoSymbolMap(tmp, ["src/sample.ts"]);
    expect(repo.kind).toBe("RepoSymbolMap");
    expect(repo.engine).toBe("tree-sitter");
    expect(repo.files[0]?.engine).toBe("tree-sitter");
    expect(repo.compact.length).toBeGreaterThan(0);
    expect(formatSymbolMapCompact(repo)).not.toContain("return a * b");
  });
});
