/**
 * V2-MEM-02 — Hybrid Graph Code + Decisions.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  HybridGraphStore,
  HybridGraphError,
  extractImportsFromSource,
  fileNodeId,
  decisionNodeId,
  testNodeId,
  normalizeGraphPath,
} from "../../src/v3/memory/index.js";

describe("V2-MEM-02 HybridGraphStore", () => {
  let store: HybridGraphStore;

  beforeEach(() => {
    store = new HybridGraphStore(":memory:", "proj-alpha");
  });

  afterEach(() => {
    store.close();
  });

  it("2 hops finds decision + test via DEPENDS_ON intermediate file", () => {
    // a.ts → b.ts (hop 1); decision/test attached to b (hop 2 from a)
    store.ingestCodeDeps("src/a.ts", ["src/b.ts"]);
    store.linkDecision("dec-sandbox", ["src/b.ts"], ["tests/b.test.ts"]);

    const exp = store.expandTwoHops("src/a.ts");
    expect(exp.start_file).toBe("src/a.ts");
    expect(exp.decisions.map((d) => d.node_id)).toEqual([decisionNodeId("dec-sandbox")]);
    expect(exp.tests.map((t) => t.node_id)).toEqual([testNodeId("tests/b.test.ts")]);
    expect(exp.decisions[0]!.hops).toBe(2);
    expect(exp.tests[0]!.hops).toBe(2);
    expect(exp.hits.map((h) => h.kind).sort()).toEqual(["Decision", "Test"]);
  });

  it("project_id isolation — other project cannot see edges/nodes", () => {
    store.ingestCodeDeps("src/secret.ts", ["src/dep.ts"]);
    store.linkDecision("dec-secret", ["src/secret.ts"], ["tests/secret.test.ts"]);

    const beta = new HybridGraphStore(":memory:", "proj-beta");
    try {
      const empty = beta.expandTwoHops("src/secret.ts");
      expect(empty.hits).toEqual([]);
      expect(empty.decisions).toEqual([]);
      expect(empty.tests).toEqual([]);
      expect(beta.listNodes()).toEqual([]);
      expect(beta.listEdges()).toEqual([]);

      expect(() =>
        store.expandTwoHops("src/secret.ts", { project_id: "proj-beta" }),
      ).toThrow(HybridGraphError);
    } finally {
      beta.close();
    }
  });

  it("stable ordering of multi-hit expansion", () => {
    store.ingestCodeDeps("src/core.ts", ["src/x.ts", "src/y.ts"]);
    // Attach decisions/tests with ids that would shuffle if unordered.
    store.linkDecision("dec-zulu", ["src/x.ts"], ["tests/z.test.ts"]);
    store.linkDecision("dec-alpha", ["src/y.ts"], ["tests/a.test.ts"]);
    store.linkDecision("dec-mid", ["src/core.ts"], ["tests/m.test.ts"]); // hop 1

    const exp = store.expandTwoHops("src/core.ts");
    const again = store.expandTwoHops("src/core.ts");

    expect(exp.hits.map((h) => `${h.hops}:${h.kind}:${h.node_id}`)).toEqual(
      again.hits.map((h) => `${h.hops}:${h.kind}:${h.node_id}`),
    );

    // hops ASC, then kind ASC (Decision < Test), then node_id ASC
    const keys = exp.hits.map((h) => `${h.hops}|${h.kind}|${h.node_id}`);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);

    // Hop-1 decision on core itself comes before hop-2
    expect(exp.decisions[0]!.node_id).toBe(decisionNodeId("dec-mid"));
    expect(exp.decisions[0]!.hops).toBe(1);
    expect(exp.decisions.slice(1).every((d) => d.hops === 2)).toBe(true);
  });

  it("no edges → empty expansion", () => {
    // Start file may not even exist as a node
    const exp = store.expandTwoHops("src/orphan.ts");
    expect(exp.hits).toEqual([]);
    expect(exp.decisions).toEqual([]);
    expect(exp.tests).toEqual([]);
    expect(exp.start_node_id).toBe(fileNodeId("src/orphan.ts"));
  });

  it("extractImportsFromSource + ingestCodeDepsFromSource are deterministic", () => {
    const source = `
      import { foo } from "./foo.js";
      import type { Bar } from "../types/bar";
      export { baz } from "./baz";
      const x = require("./legacy");
      void import("./dyn");
      import "side-effect";
      import lodash from "lodash";
    `;
    const specs = extractImportsFromSource(source);
    expect(specs).toContain("./foo.js");
    expect(specs).toContain("../types/bar");
    expect(specs).toContain("./baz");
    expect(specs).toContain("./legacy");
    expect(specs).toContain("./dyn");
    expect(specs).toContain("side-effect");
    expect(specs).toContain("lodash");
    // stable unique order of first appearance
    expect(specs).toEqual([...new Set(specs)]);

    const result = store.ingestCodeDepsFromSource("src/pkg/entry.ts", source);
    expect(result.file_node_id).toBe(fileNodeId("src/pkg/entry.ts"));
    // Only relative imports become DEPENDS_ON targets
    expect(result.import_node_ids).toEqual(
      [
        fileNodeId("src/pkg/foo.js"),
        fileNodeId("src/types/bar"),
        fileNodeId("src/pkg/baz"),
        fileNodeId("src/pkg/legacy"),
        fileNodeId("src/pkg/dyn"),
      ].sort((a, b) => a.localeCompare(b)),
    );
    expect(result.edges.every((e) => e.edge_type === "DEPENDS_ON")).toBe(true);
  });

  it("linkDecision creates DECIDES + PROTECTS + REFERENCES", () => {
    const linked = store.linkDecision(
      "dec-1",
      ["src/a.ts", "src/b.ts"],
      ["tests/a.test.ts"],
    );
    expect(linked.decision_node_id).toBe(decisionNodeId("dec-1"));
    expect(linked.file_node_ids).toEqual(
      [fileNodeId("src/a.ts"), fileNodeId("src/b.ts")].sort((a, b) => a.localeCompare(b)),
    );
    expect(linked.test_node_ids).toEqual([testNodeId("tests/a.test.ts")]);

    const types = linked.edges.map((e) => e.edge_type).sort();
    expect(types).toContain("DECIDES");
    expect(types).toContain("PROTECTS");
    expect(types).toContain("REFERENCES");

    const direct = store.expandTwoHops("src/a.ts");
    expect(direct.decisions.some((d) => d.hops === 1)).toBe(true);
    expect(direct.tests.some((t) => t.hops === 1)).toBe(true);
  });

  it("requires project_id and rejects empty", () => {
    expect(() => new HybridGraphStore(":memory:", "")).toThrow(HybridGraphError);
    expect(() => new HybridGraphStore(":memory:", "   ")).toThrow(HybridGraphError);
  });

  it("normalizeGraphPath is stable", () => {
    expect(normalizeGraphPath("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeGraphPath("src\\\\a.ts")).toBe("src/a.ts");
  });
});
