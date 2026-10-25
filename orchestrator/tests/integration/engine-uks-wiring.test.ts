import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ExecutionEngine,
  ProviderRouter,
  createMockProvider,
  UKSKnowledgeBackend,
  ShadowKnowledgeBackend,
  resolveKnowledgeBackend,
  ContextPackBuilder,
  Bm25Engine,
  HybridFusionEngine,
  ScopeEnforcer,
  writeAtomicJson,
  readJson,
  computeSha256,
  scanFile,
  scanDirectory,
} from "../../src/index.js";
import type { CapabilityIR } from "../../src/types/index.js";

describe("TASK-P0-08: UKS Core Runtime Wiring & Index Exports", () => {
  beforeEach(() => {
    delete process.env.EVOLVELOOP_UKS_DISABLED;
    delete process.env.KNOWLEDGE_BACKEND;
  });

  it("exports all core UKS classes, builders, and utilities from root orchestrator index", () => {
    expect(UKSKnowledgeBackend).toBeDefined();
    expect(ShadowKnowledgeBackend).toBeDefined();
    expect(resolveKnowledgeBackend).toBeDefined();
    expect(ContextPackBuilder).toBeDefined();
    expect(Bm25Engine).toBeDefined();
    expect(HybridFusionEngine).toBeDefined();
    expect(ScopeEnforcer).toBeDefined();
    expect(writeAtomicJson).toBeDefined();
    expect(readJson).toBeDefined();
    expect(computeSha256).toBeDefined();
    expect(scanFile).toBeDefined();
    expect(scanDirectory).toBeDefined();
  });

  it("ExecutionEngine initializes with UKSKnowledgeBackend by default", () => {
    const router = new ProviderRouter();
    router.register(createMockProvider("mock-cap"));

    const registry = {
      apiVersion: "capability-orchestrator.io/v2" as const,
      kind: "CapabilityRegistry" as const,
      metadata: { generated_at: new Date().toISOString() },
      capabilities: {
        "mock-cap": {
          providers: [{ id: "mock-cap", priority: 100, cost: "low", quality_score: 1.0, availability: "active" as const, version: "1.0.0" }],
        },
      },
    };

    const engine = new ExecutionEngine({
      registry,
      providers: router,
    });

    const backend = engine.getKnowledgeBackend();
    expect(backend).toBeDefined();
    expect(backend.id).toBe("uks");
    expect(backend).toBeInstanceOf(UKSKnowledgeBackend);
  });

  it("ExecutionEngine accepts custom knowledgeBackend instance and propagates to scheduler", async () => {
    const customBackend = new UKSKnowledgeBackend();
    let searchCalled = false;
    const originalSearch = customBackend.search.bind(customBackend);
    customBackend.search = async (q: string) => {
      searchCalled = true;
      return originalSearch(q);
    };

    const router = new ProviderRouter();
    router.register(createMockProvider("sample-cap"));

    const registry = {
      apiVersion: "capability-orchestrator.io/v2" as const,
      kind: "CapabilityRegistry" as const,
      metadata: { generated_at: new Date().toISOString() },
      capabilities: {
        "sample-cap": {
          providers: [{ id: "sample-cap", priority: 100, cost: "low", quality_score: 1.0, availability: "active" as const, version: "1.0.0" }],
        },
      },
    };

    const engine = new ExecutionEngine({
      registry,
      providers: router,
      knowledgeBackend: customBackend,
    });

    const ir: CapabilityIR = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "CapabilityGraph",
      metadata: { id: "feat-uks-test", feature: "UKS test", ir_version: "2.0.0" },
      spec: {
        nodes: [
          {
            id: "step-1",
            capability: "sample-cap",
            type: "worker",
            dependencies: [],
            definition_of_done: [{ id: "d1", check: "sample done", verification: "automated" }],
          },
        ],
      },
    };

    const customPolicy = {
      apiVersion: "capability-orchestrator.io/v2" as const,
      kind: "ExecutionPolicy" as const,
      metadata: { id: "policy-with-knowledge" },
      spec: {
        provider_strategy: "quality_first" as const,
        execution_order: "topological" as const,
        parallelism: { max_parallel: 1 },
        knowledge: { consult_before_schedule: true },
        failure_recovery: {
          strategy: "retry_node" as const,
          max_node_retries: 0,
          retry_delay_ms: 0,
        },
      },
    };

    const result = await engine.run({
      ir,
      policy_id: "policy-with-knowledge",
      custom_policies: [customPolicy],
    });

    expect(result.success).toBe(true);
    expect(searchCalled).toBe(true);
  });
});
