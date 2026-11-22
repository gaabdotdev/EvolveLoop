/**
 * V1-TOK-01 — Context slicing: outlineFile + readLines (≤80), no unrestricted read_file.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  READ_LINES_HARD_CAP,
  outlineFile,
  readLines,
  createAgentFileTools,
  denyUnrestrictedReadFile,
  readFile as bannedReadFile,
  ContextSlicingError,
} from "../../src/v3/token-economy/index.js";
import { EngineeringWorkspace } from "../../src/v3/engineering/index.js";

const SAMPLE_TS = `/**
 * Sample module for outline tests.
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

# Not a markdown heading in TS
`;

describe("V1-TOK-01 context slicing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok-slice-"));
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "sample.ts"), SAMPLE_TS, "utf-8");

    const lines: string[] = [];
    for (let i = 1; i <= 120; i++) lines.push(`line-${i}`);
    await fs.writeFile(path.join(tmp, "src", "long.txt"), lines.join("\n") + "\n", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("outlineFile returns structure with signatures and line ranges (not full body)", () => {
    const outline = outlineFile(tmp, "src/sample.ts");
    expect(outline.kind).toBe("OutlineFileResult");
    expect(outline.total_lines).toBeGreaterThan(10);
    expect(outline.entries.length).toBeGreaterThanOrEqual(3);

    const kinds = new Set(outline.entries.map((e) => e.kind));
    expect(kinds.has("interface") || kinds.has("class") || kinds.has("function")).toBe(true);

    for (const e of outline.entries) {
      expect(e.start_line).toBeGreaterThanOrEqual(1);
      expect(e.end_line).toBeGreaterThanOrEqual(e.start_line);
      expect(e.signature.length).toBeGreaterThan(0);
      expect(e.signature.length).toBeLessThanOrEqual(200);
      // Must not dump entire file as a single signature blob
      expect(e.signature.includes("export function add") && e.signature.includes("multiply")).toBe(
        false,
      );
    }

    const add = outline.entries.find((e) => e.name === "add" || e.signature.includes("function add"));
    expect(add).toBeDefined();
    expect(add!.end_line - add!.start_line).toBeLessThan(outline.total_lines);
  });

  it("readLines enforces ≤80 lines and returns content in range", () => {
    expect(READ_LINES_HARD_CAP).toBe(80);
    const ok = readLines(tmp, "src/long.txt", 1, 80);
    expect(ok.rejected).toBe(false);
    expect(ok.truncated).toBe(false);
    expect(ok.lines).toHaveLength(80);
    expect(ok.lines[0]).toBe("line-1");
    expect(ok.lines[79]).toBe("line-80");
  });

  it("oversized range is rejected by default (documented contract)", () => {
    const big = readLines(tmp, "src/long.txt", 1, 81);
    expect(big.rejected).toBe(true);
    expect(big.truncated).toBe(false);
    expect(big.lines).toHaveLength(0);
    expect(big.error_code).toBe("RANGE_EXCEEDS_CAP");
    expect(big.error).toMatch(/exceeds hard cap 80/);
  });

  it("oversized range can truncate with explicit truncated flag", () => {
    const trunc = readLines(tmp, "src/long.txt", 10, 100, { on_oversized: "truncate" });
    expect(trunc.rejected).toBe(false);
    expect(trunc.truncated).toBe(true);
    expect(trunc.lines).toHaveLength(80);
    expect(trunc.start_line).toBe(10);
    expect(trunc.end_line).toBe(89);
    expect(trunc.lines[0]).toBe("line-10");
    expect(trunc.lines[79]).toBe("line-89");
  });

  it("path is confined to workspace (escape rejected)", async () => {
    const outside = path.join(os.tmpdir(), `v1-tok-outside-${Date.now()}.txt`);
    await fs.writeFile(outside, "secret\n", "utf-8");
    try {
      expect(() => outlineFile(tmp, outside)).toThrow(ContextSlicingError);
      expect(() => outlineFile(tmp, outside)).toThrow(/PATH_ESCAPE/);

      const escaped = readLines(tmp, path.join("..", path.basename(outside)), 1, 1);
      // ../ may resolve outside tmp depending on layout; assert escape or not-found
      expect(escaped.rejected).toBe(true);
      expect(["PATH_ESCAPE", "NOT_FOUND"]).toContain(escaped.error_code);

      const viaDots = readLines(tmp, "../../../etc/passwd", 1, 1);
      expect(viaDots.rejected).toBe(true);
      expect(viaDots.error_code).toBe("PATH_ESCAPE");
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("agent tools expose outline + readLines only; unrestricted readFile denied", () => {
    const tools = createAgentFileTools(tmp);
    expect(typeof tools.outlineFile).toBe("function");
    expect(typeof tools.readLines).toBe("function");
    expect(tools).not.toHaveProperty("readFile");

    const outline = tools.outlineFile("src/sample.ts");
    expect(outline.entries.length).toBeGreaterThan(0);

    const denied = tools.readLines("src/long.txt", 1, 100);
    expect(denied.rejected).toBe(true);
    expect(denied.error_code).toBe("RANGE_EXCEEDS_CAP");

    expect(() => denyUnrestrictedReadFile("src/sample.ts")).toThrow(/UNRESTRICTED_READ_DENIED/);
    expect(() => bannedReadFile(tmp, "src/sample.ts")).toThrow(/UNRESTRICTED_READ_DENIED/);
  });

  it("EngineeringWorkspace wires enforcement: readFile denied, host + slice APIs work", () => {
    const ws = new EngineeringWorkspace(tmp);
    expect(() => ws.readFile("src/sample.ts")).toThrow(/UNRESTRICTED_READ_DENIED/);

    const host = ws.readFileHost("src/sample.ts");
    expect(host).toContain("HelloService");

    const outline = ws.outlineFile("src/sample.ts");
    expect(outline.total_lines).toBeGreaterThan(0);

    const slice = ws.readLines("src/long.txt", 1, 5);
    expect(slice.rejected).toBe(false);
    expect(slice.lines).toEqual(["line-1", "line-2", "line-3", "line-4", "line-5"]);

    const agent = ws.agentFileTools();
    expect(agent.readLines("src/long.txt", 1, 81).rejected).toBe(true);
  });
});
