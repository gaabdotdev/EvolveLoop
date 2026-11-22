/**
 * V1-TOK-10 — OperationalCallSpec: tool_choice required, stop sequences, no free prose.
 */

import { describe, it, expect } from "vitest";
import {
  FREE_PROSE_PROP_NAMES,
  DEFAULT_OPERATIONAL_STOP_SEQUENCES,
  buildOperationalCallSpec,
  stripFreeProseProps,
  schemaHasNoFreeProse,
  selectToolsForMsoState,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-10 operational call spec", () => {
  it("builder sets tool_choice required and stop sequences", () => {
    const spec = buildOperationalCallSpec({
      tools: selectToolsForMsoState("DELEGATING"),
    });
    expect(spec.kind).toBe("OperationalCallSpec");
    expect(spec.tool_choice).toBe("required");
    expect(Array.isArray(spec.stop)).toBe(true);
    expect(spec.stop.length).toBeGreaterThan(0);
    expect(spec.stop).toEqual([...DEFAULT_OPERATIONAL_STOP_SEQUENCES]);
    expect(spec.tools.length).toBeGreaterThan(0);
    expect(spec.tools.length).toBeLessThanOrEqual(4);
  });

  it("json schema has no free-prose properties", () => {
    const dirty = {
      type: "object" as const,
      properties: {
        op: { type: "string" },
        explanation: { type: "string" },
        summary: { type: "string" },
        thoughts: { type: "string" },
        path: { type: "string" },
      },
      required: ["op", "explanation"],
      additionalProperties: false as const,
    };
    const cleaned = stripFreeProseProps(dirty);
    expect(schemaHasNoFreeProse(cleaned)).toBe(true);
    expect(cleaned.properties).not.toHaveProperty("explanation");
    expect(cleaned.properties).not.toHaveProperty("summary");
    expect(cleaned.properties).not.toHaveProperty("thoughts");
    expect(cleaned.properties).toHaveProperty("op");
    expect(cleaned.required).toEqual(["op"]);

    const spec = buildOperationalCallSpec({ schema: dirty });
    expect(schemaHasNoFreeProse(spec.response_json_schema)).toBe(true);
    for (const name of FREE_PROSE_PROP_NAMES) {
      expect(spec.response_json_schema.properties).not.toHaveProperty(name);
    }
    expect(spec.forbid_free_prose_props).toEqual(FREE_PROSE_PROP_NAMES);
  });

  it("accepts custom stop sequences", () => {
    const spec = buildOperationalCallSpec({
      stop_sequences: ["<<<END_PATCH>>>"],
    });
    expect(spec.stop).toEqual(["<<<END_PATCH>>>"]);
  });

  it("rejects empty stop sequences", () => {
    expect(() => buildOperationalCallSpec({ stop_sequences: [] })).toThrow(/stop sequence/);
  });
});
