/**
 * V1-TOK-09 — TSV / positional compact format round-trip.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  encodeTsvRow,
  decodeTsvRow,
  encodeSymbolTsv,
  decodeSymbolTsv,
  buildFileSymbolMap,
  formatLocationCompact,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-09 TSV / positional compact", () => {
  it("encodeTsvRow / decodeTsvRow round-trip", () => {
    const fields = ["src/a.ts", "42", "fooBar", "with|pipe", "line\nbreak"];
    const row = encodeTsvRow(fields);
    expect(row.includes("|")).toBe(true);
    expect(decodeTsvRow(row)).toEqual(fields);
  });

  it("encodeSymbolTsv / decodeSymbolTsv round-trip (path|line|symbol)", () => {
    const row = encodeSymbolTsv("orchestrator/src/x.ts", 17, "selectToolsForMsoState");
    expect(row).toBe("orchestrator/src/x.ts|17|selectToolsForMsoState");
    expect(decodeSymbolTsv(row)).toEqual({
      path: "orchestrator/src/x.ts",
      line: 17,
      symbol: "selectToolsForMsoState",
    });
  });

  it("decodeSymbolTsv rejects invalid rows", () => {
    expect(decodeSymbolTsv("only|two")).toBeNull();
    expect(decodeSymbolTsv("p|0|sym")).toBeNull();
    expect(decodeSymbolTsv("p|nope|sym")).toBeNull();
  });

  it("empty fields preserved", () => {
    const row = encodeTsvRow(["a", "", "c"]);
    expect(decodeTsvRow(row)).toEqual(["a", "", "c"]);
  });

  it("symbol-map compact rows use positional encode", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok09-"));
    try {
      await fs.writeFile(
        path.join(tmp, "sample.ts"),
        "export function alpha() { return 1; }\nexport class Beta {}\n",
        "utf-8",
      );
      const map = buildFileSymbolMap(tmp, "sample.ts");
      expect(map.compact.length).toBeGreaterThan(0);
      for (const row of map.compact) {
        const parts = decodeTsvRow(row);
        expect(parts.length).toBeGreaterThanOrEqual(5);
        expect(parts[0]).toContain("sample.ts");
        expect(Number(parts[1])).toBeGreaterThan(0);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("formatLocationCompact is positional TSV", () => {
    const row = formatLocationCompact("def", {
      path: "a.ts",
      line: 3,
      column: 1,
      name: "alpha",
      kind: "function",
      engine: "tree-sitter",
    });
    expect(decodeTsvRow(row)).toEqual(["def", "a.ts", "3", "1", "alpha", "function"]);
  });
});
