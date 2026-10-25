import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  ExecutionEngine,
  ProviderRouter,
  PluginLoader,
  ObservableInferenceProvider,
  createDeterministicProvider,
} from "../../src/index.js";
import type { CapabilityIR, ProviderManifest } from "../../src/types/index.js";

describe("TASK-P0-07: Dynamic Discovery & Real Providers Unlocking", () => {
  const orchestratorRoot = resolve(__dirname, "../..");
  const providersDir = resolve(orchestratorRoot, "providers");

  it("PluginLoader loads observable-inference manifests without error", () => {
    const loader = new PluginLoader(orchestratorRoot);
    const inferenceManifest: ProviderManifest = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "ProviderManifest",
      metadata: { name: "test-inference", version: "1.0.0" },
      spec: {
        plugin: { type: "observable-inference" },
        capabilities: ["llm.complete"],
        deterministic: false,
      },
    };

    const runtime = loader.load(inferenceManifest);
    expect(runtime).toBeDefined();
    expect(runtime.id).toBe("test-inference");
    expect(runtime).toBeInstanceOf(ObservableInferenceProvider);
  });

  it("PluginLoader loads deterministic manifests without executor", () => {
    const loader = new PluginLoader(orchestratorRoot);
    const deterministicManifest: ProviderManifest = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "ProviderManifest",
      metadata: { name: "test-fs", version: "1.0.0" },
      spec: {
        plugin: { type: "deterministic" },
        capabilities: ["filesystem.read", "filesystem.write"],
        deterministic: true,
      },
    };

    const runtime = loader.load(deterministicManifest);
    expect(runtime).toBeDefined();
    expect(runtime.id).toBe("test-fs");
  });

  it("ExecutionEngine dynamically discovers and registers deterministic provider when jobsDir is absent", async () => {
    const emptyRegistry = {
      apiVersion: "capability-orchestrator.io/v2" as const,
      kind: "CapabilityRegistry" as const,
      metadata: { generated_at: new Date().toISOString() },
      capabilities: {},
    };

    const router = new ProviderRouter();
    const engine = new ExecutionEngine({
      registry: emptyRegistry,
      providers: router,
      discovery: {
        orchestratorProvidersDir: providersDir,
      },
    });

    const ir: CapabilityIR = {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "CapabilityGraph",
      metadata: { id: "feat-disc-test", feature: "Discovery Test", ir_version: "2.0.0" },
      spec: {
        nodes: [
          {
            id: "node-fs-read",
            capability: "filesystem.read",
            type: "worker",
            dependencies: [],
            inputs: [{ path: "package.json" }],
            definition_of_done: [{ id: "d1", check: "File read", verification: "automated" }],
          },
        ],
      },
    };

    const customPolicy = {
      apiVersion: "capability-orchestrator.io/v2" as const,
      kind: "ExecutionPolicy" as const,
      metadata: { id: "disc-policy" },
      spec: {
        provider_strategy: "quality_first" as const,
        execution_order: "topological" as const,
        parallelism: { max_parallel: 1 },
        failure_recovery: {
          strategy: "retry_node" as const,
          max_node_retries: 0,
          retry_delay_ms: 0,
        },
      },
    };

    const result = await engine.run({
      ir,
      policy_id: "disc-policy",
      custom_policies: [customPolicy],
    });

    expect(result.success).toBe(true);
    expect(result.graph.nodes[0].status).toBe("satisfied");
    expect(router.get("filesystem")).toBeDefined();
  });
});
