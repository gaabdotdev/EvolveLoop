/**
 * V3-MEM-04 — Local Multi-Hop Synthesis.
 * Offline deterministic path is mandatory; live Ollama is optional (probe).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  HybridGraphStore,
  decisionNodeId,
  testNodeId,
  fileNodeId,
  expandGraph,
  fingerprintEvidence,
  synthesizeDeterministicStub,
  synthesizeLocal,
  probeOllama,
  runMultiHopSynthesis,
  MultiHopSynthesisError,
  type ClosedDossier,
} from "../../src/v3/memory/index.js";

function seedComplexGraph(store: HybridGraphStore): void {
  // a → b → c (3-hop chain for File nodes); decisions/tests on b and c
  store.ingestCodeDeps("src/a.ts", ["src/b.ts"]);
  store.ingestCodeDeps("src/b.ts", ["src/c.ts"]);
  store.linkDecision("dec-auth", ["src/b.ts"], ["tests/b-auth.test.ts"]);
  store.linkDecision("dec-sandbox", ["src/c.ts"], ["tests/c-sandbox.test.ts"]);
  store.linkSymbolReference(fileNodeId("src/b.ts"), "rotateCredentials");
}

describe("V3-MEM-04 Multi-Hop Synthesis (offline)", () => {
  let store: HybridGraphStore;

  beforeEach(() => {
    store = new HybridGraphStore(":memory:", "proj-mem04");
    seedComplexGraph(store);
  });

  afterEach(() => {
    store.close();
  });

  it("expandGraph collects evidence with stable hop ordering", () => {
    const exp2 = expandGraph(store, "src/a.ts", 2);
    expect(exp2.start_file).toBe("src/a.ts");
    expect(exp2.start_node_id).toBe(fileNodeId("src/a.ts"));
    expect(exp2.max_hops).toBe(2);
    expect(exp2.evidence.length).toBeGreaterThan(0);

    const keys = exp2.evidence.map((e) => `${e.hops}|${e.kind}|${e.node_id}`);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));

    // hop1: File:src/b.ts (+ maybe Decision/Test attached? Decision is DECIDES from dec→b, so undirected hop1 from a is only b)
    expect(exp2.evidence.some((e) => e.node_id === fileNodeId("src/b.ts") && e.hops === 1)).toBe(
      true,
    );
    // hop2: Decision on b, Test on b, File c, Symbol on b
    expect(
      exp2.evidence.some((e) => e.node_id === decisionNodeId("dec-auth") && e.hops === 2),
    ).toBe(true);
    expect(
      exp2.evidence.some((e) => e.node_id === testNodeId("tests/b-auth.test.ts") && e.hops === 2),
    ).toBe(true);

    // 3 hops reaches dec-sandbox on c
    const exp3 = expandGraph(store, "src/a.ts", 3);
    expect(
      exp3.evidence.some((e) => e.node_id === decisionNodeId("dec-sandbox") && e.hops === 3),
    ).toBe(true);
    // Same fingerprint for identical expansion
    const again = expandGraph(store, "src/a.ts", 2);
    expect(fingerprintEvidence(exp2.evidence)).toBe(fingerprintEvidence(again.evidence));
  });

  it("expandGraph rejects invalid hops", () => {
    expect(() => expandGraph(store, "src/a.ts", 0)).toThrow(MultiHopSynthesisError);
    expect(() => expandGraph(store, "src/a.ts", -1)).toThrow(MultiHopSynthesisError);
  });

  it("expandGraph empty neighborhood → empty evidence", () => {
    const orphan = expandGraph(store, "src/orphan.ts", 2);
    expect(orphan.evidence).toEqual([]);
    expect(orphan.nodes_visited).toBe(1);
  });

  it("synthesizeDeterministicStub closes dossier with STATUS documented", () => {
    const expansion = expandGraph(store, "src/a.ts", 2);
    const dossier = synthesizeDeterministicStub(
      "Which decisions protect the auth path from a.ts?",
      expansion,
    );

    expect(dossier.closed).toBe(true);
    expect(dossier.status).toBe("CLOSED_DETERMINISTIC_STUB");
    expect(dossier.synthesizer).toBe("deterministic_stub");
    expect(dossier.evidence_count).toBe(expansion.evidence.length);
    expect(dossier.citations.length).toBe(expansion.evidence.length);
    expect(dossier.answer).toContain("STATUS=CLOSED_DETERMINISTIC_STUB");
    expect(dossier.answer).toContain(decisionNodeId("dec-auth"));
    expect(dossier.limitations.some((l) => l.includes("CLOSED_DETERMINISTIC_STUB"))).toBe(true);
    expect(dossier.schema_version).toBe("1");
    // Deterministic: same inputs → same fingerprint + answer
    const again = synthesizeDeterministicStub(
      "Which decisions protect the auth path from a.ts?",
      expansion,
    );
    expect(again.evidence_fingerprint).toBe(dossier.evidence_fingerprint);
    expect(again.answer).toBe(dossier.answer);
  });

  it("synthesizeLocal forceStub never calls network and stays CLOSED_DETERMINISTIC_STUB", async () => {
    let fetchCalls = 0;
    const fetchFn: typeof fetch = async () => {
      fetchCalls += 1;
      throw new Error("network should not be touched");
    };
    const expansion = expandGraph(store, "src/a.ts", 2);
    const dossier = await synthesizeLocal({
      question: "Close a local dossier for sandbox decisions near a.ts",
      expansion,
      ollama: { forceStub: true, fetchFn },
    });
    expect(fetchCalls).toBe(0);
    expect(dossier.status).toBe("CLOSED_DETERMINISTIC_STUB");
    expect(dossier.closed).toBe(true);
  });

  it("synthesizeLocal falls back to stub when Ollama probe fails", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new Error("ECONNREFUSED simulated");
    };
    const expansion = expandGraph(store, "src/a.ts", 2);
    const dossier = await synthesizeLocal({
      question: "complex multi-hop question",
      expansion,
      ollama: { fetchFn, timeoutMs: 500 },
    });
    expect(dossier.closed).toBe(true);
    expect(dossier.status).toBe("CLOSED_DETERMINISTIC_STUB");
    expect(dossier.limitations.some((l) => l.includes("ollama_probe=UNREACHABLE"))).toBe(true);
    expect(dossier.limitations).toContain("fell_back_to_deterministic_stub");
  });

  it("OPEN_INSUFFICIENT_EVIDENCE when no graph hits", async () => {
    const expansion = expandGraph(store, "src/missing.ts", 2);
    const dossier = await synthesizeLocal({
      question: "anything",
      expansion,
      ollama: { forceStub: true },
    });
    expect(dossier.closed).toBe(false);
    expect(dossier.status).toBe("OPEN_INSUFFICIENT_EVIDENCE");
    expect(dossier.citations).toEqual([]);
  });

  it("runMultiHopSynthesis end-to-end offline closes complex question", async () => {
    const dossier: ClosedDossier = await runMultiHopSynthesis({
      question:
        "What decisions and tests protect dependencies reachable from src/a.ts within 3 hops?",
      start_file: "src/a.ts",
      hops: 3,
      graph: store,
      ollama: { forceStub: true },
    });
    expect(dossier.closed).toBe(true);
    expect(dossier.status).toBe("CLOSED_DETERMINISTIC_STUB");
    expect(dossier.hops_used).toBe(3);
    expect(dossier.citations.some((c) => c.node_id === decisionNodeId("dec-auth"))).toBe(true);
    expect(dossier.citations.some((c) => c.node_id === decisionNodeId("dec-sandbox"))).toBe(true);
    expect(dossier.citations.some((c) => c.kind === "Test")).toBe(true);
    // Offline path must not claim Ollama / remote providers
    expect(dossier.synthesizer).toBe("deterministic_stub");
    expect(dossier.status).not.toBe("CLOSED_OLLAMA");
  });

  it("probeOllama reports UNREACHABLE honestly with injected fetch", async () => {
    const probe = await probeOllama({
      fetchFn: async () => {
        throw new Error("offline");
      },
      timeoutMs: 200,
    });
    expect(probe.ok).toBe(false);
    expect(probe.code).toBe("UNREACHABLE");
  });

  it("synthesizeLocal closes CLOSED_OLLAMA when generate returns reasoning-only tokens", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "bonsai-64k:latest" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/generate") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: "<think>\ninternal chain only, truncated",
            done: true,
            done_reason: "length",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("nope", { status: 404 });
    };

    const dossier = await runMultiHopSynthesis({
      question: "decisions near a.ts",
      start_file: "src/a.ts",
      hops: 2,
      graph: store,
      ollama: { fetchFn, timeoutMs: 5_000, model: "bonsai-64k:latest" },
    });
    expect(dossier.status).toBe("CLOSED_OLLAMA");
    expect(dossier.closed).toBe(true);
    expect(dossier.synthesizer).toBe("ollama");
    expect(dossier.limitations).toContain("model_visible_answer_empty_after_think_strip");
    expect(dossier.answer).toContain("STATUS=CLOSED_OLLAMA");
    expect(dossier.citations.length).toBeGreaterThan(0);
  });
});

describe("V3-MEM-04 Multi-Hop Synthesis (live Ollama optional)", () => {
  it(
    "probe Ollama; if ready close dossier via synthesizeLocal else document UNAVAILABLE",
    async () => {
      const store = new HybridGraphStore(":memory:", "proj-mem04-live");
      try {
        store.ingestCodeDeps("src/core.ts", ["src/dep.ts"]);
        store.linkDecision("dec-live", ["src/core.ts"], ["tests/core.test.ts"]);

        const probe = await probeOllama({ timeoutMs: 4_000 });
        console.log("MEM04_OLLAMA_PROBE_JSON=" + JSON.stringify(probe));

        if (!probe.ok) {
          console.log("MEM04_LIVE_STATUS=UNAVAILABLE");
          // Suite stays green — offline path already covers CLOSED_DETERMINISTIC_STUB.
          expect(probe.ok).toBe(false);
          return;
        }

        const dossier = await runMultiHopSynthesis({
          question: "Summarize decisions protecting src/core.ts",
          start_file: "src/core.ts",
          hops: 2,
          graph: store,
          ollama: { timeoutMs: 60_000 },
        });

        console.log(
          "MEM04_LIVE_DOSSIER_JSON=" +
            JSON.stringify({
              status: dossier.status,
              closed: dossier.closed,
              synthesizer: dossier.synthesizer,
              evidence_count: dossier.evidence_count,
              model: dossier.model,
              limitations: dossier.limitations,
            }),
        );

        expect(dossier.closed).toBe(true);
        expect(["CLOSED_OLLAMA", "CLOSED_DETERMINISTIC_STUB"]).toContain(dossier.status);
        expect(dossier.citations.length).toBeGreaterThan(0);
        // Prefer CLOSED_OLLAMA when probe was OK; stub fallback is still a closed dossier.
        console.log(`MEM04_LIVE_STATUS=${dossier.status}`);
      } finally {
        store.close();
      }
    },
    120_000,
  );
});
