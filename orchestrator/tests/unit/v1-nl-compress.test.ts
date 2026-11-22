/**
 * V1-TOK-18 — NL compression never touches source code fences / extensions.
 */

import { describe, it, expect } from "vitest";
import { compressNaturalLanguage } from "../../src/v3/token-economy/index.js";

describe("V1-TOK-18 compressNaturalLanguage", () => {
  it("compresses prose while preserving fenced code", () => {
    const input = [
      "Please note that it is important to basically just really understand the flow.",
      "```ts",
      "const x = 1;",
      "function f() { return x; }",
      "```",
      "In order to continue, maybe you should simply check the path src/app.ts carefully.",
    ].join("\n");

    const result = compressNaturalLanguage(input, 0.45);
    expect(result.kind).toBe("CompressNaturalLanguageResult");
    expect(result.compressed).toBe(true);
    expect(result.text).toContain("```ts");
    expect(result.text).toContain("const x = 1;");
    expect(result.text).toContain("function f() { return x; }");
    expect(result.text).toContain("src/app.ts");
    expect(result.code_segments_preserved).toBeGreaterThan(0);
    expect(result.compressed_chars).toBeLessThan(result.original_chars);
    // Flourish should be reduced in NL parts
    expect(result.text.toLowerCase()).not.toContain("it is important to");
  });

  it("ratio near 1 is a no-op", () => {
    const text = "Hello world, this is a short note.";
    const result = compressNaturalLanguage(text, 1);
    expect(result.compressed).toBe(false);
    expect(result.text).toBe(text);
  });
});
