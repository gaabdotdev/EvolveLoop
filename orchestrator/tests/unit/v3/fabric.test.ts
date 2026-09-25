import { describe, it, expect } from "vitest";
import type { CapabilityRegistry } from "../../../src/types/index.js";
import { CAPABILITY_PROFILES } from "../../../src/discovery/capability-profiles.js";
import {
  discoverCapabilities,
  FabricDiscovery,
  planComposition,
  CompositionPlanner,
  evaluateAcquisitionGate,
  AcquisitionGate,
  makeLifecycleRecord,
  inferLifecycleStateFromProviders,
  proposalToCapabilityIR,
  proposalToCapabilityIRWithFabric,
  enrichProposalWithFabric,
} from "../../../src/v3/index.js";

function mockProvider(
  id: string,
  availability: "active" | "deprecated" | "experimental" = "active",
  version = "1.0.0",
) {
  return {
    id,
    priority: 100,
    cost: "low" as const,
    quality_score: 0.9,
    availability,
    version,
  };
}

function fabricRegistry(): CapabilityRegistry {
  return {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityRegistry",
    metadata: { generator: "fabric-test" },
    capabilities: {
      documentation: { providers: [mockProvider("documentation")] },
      testing: { providers: [mockProvider("testing")] },
      "filesystem.read": { providers: [mockProvider("fs-read")] },
      "filesystem.write": {
        providers: [mockProvider("fs-write", "experimental", "0.2.0")],
      },
      "git.inspect": { providers: [mockProvider("git")] },
      "browser.navigate": {
        providers: [mockProvider("browser-stub", "experimental")],
      },
      "quarantined.cap": { providers: [mockProvider("bad")] },
    },
  };
}

describe("V3 FabricDiscovery", () => {
  it("returns candidates with lifecycle from registry providers", () => {
    const registry = fabricRegistry();
    const candidates = discoverCapabilities("documentation", registry);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const doc = candidates.find((c) => c.capability_id === "documentation");
    expect(doc).toBeDefined();
    expect(doc!.lifecycle_state).toBe("AVAILABLE");
    expect(doc!.match_reason).toBe("exact_id");
    expect(doc!.provider_ids).toContain("documentation");
  });

  it("infers CANDIDATE for experimental-only providers", () => {
    expect(
      inferLifecycleStateFromProviders([mockProvider("x", "experimental")]),
    ).toBe("CANDIDATE");
  });

  it("respects explicit CapabilityLifecycleRecord annotations", () => {
    const registry = fabricRegistry();
    const candidates = FabricDiscovery.discover("quarantined.cap", registry, {
      lifecycleById: {
        "quarantined.cap": makeLifecycleRecord({
          capability_id: "quarantined.cap",
          capability_version: "9.9.9",
          state: "QUARANTINED",
          reason: "test quarantine",
        }),
      },
    });
    expect(candidates[0]!.lifecycle_state).toBe("QUARANTINED");
    expect(candidates[0]!.capability_version).toBe("9.9.9");
  });

  it("does not create a second registry kind", () => {
    const registry = fabricRegistry();
    expect(registry.kind).toBe("CapabilityRegistry");
    discoverCapabilities("git", registry);
    expect(registry.kind).toBe("CapabilityRegistry");
    expect(Object.keys(registry.capabilities).length).toBeGreaterThan(0);
  });
});

describe("V3 CompositionPlanner", () => {
  it("produces a single-step plan for exact match", () => {
    const registry = fabricRegistry();
    const candidates = discoverCapabilities("testing", registry);
    const result = planComposition("testing", candidates);

    expect(result.status).toBe("plan");
    if (result.status === "plan") {
      expect(result.steps).toEqual(["testing"]);
      expect(result.rationale).toContain("exact");
    }
  });

  it("returns unmet_need when candidates are quarantined", () => {
    const candidates = discoverCapabilities("quarantined.cap", fabricRegistry(), {
      lifecycleById: {
        "quarantined.cap": makeLifecycleRecord({
          capability_id: "quarantined.cap",
          capability_version: "1.0.0",
          state: "QUARANTINED",
        }),
      },
    });
    const result = CompositionPlanner.plan("quarantined.cap", candidates);
    expect(result.status).toBe("unmet_need");
  });

  it("returns unmet_need when nothing matches", () => {
    const result = planComposition("totally.unknown.capability.xyz", []);
    expect(result.status).toBe("unmet_need");
    expect(result.rationale).toMatch(/no registry candidates/i);
  });

  it("can compose profile steps for coding need when caps present", () => {
    const registry = fabricRegistry();
    // Seed need that mentions coding so profile path activates
    const need = "coding filesystem";
    const candidates = discoverCapabilities(need, registry);
    const result = planComposition(need, candidates);
    expect(result.status).toBe("plan");
    if (result.status === "plan") {
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.steps.every((s) => typeof s === "string")).toBe(true);
    }
  });
});

describe("V3 AcquisitionGate", () => {
  it("allows register when sandbox depth and validation pass", () => {
    const result = evaluateAcquisitionGate({
      capability_id: "new.cap",
      capability_version: "0.1.0",
      sandbox_depth: "S3",
      effect_classes: ["DESTRUCTIVE"],
      validation_status: "passed",
    });
    expect(result.action).toBe("register");
    expect(result.lifecycle.spec.state).toBe("VALIDATED");
    expect(result.unmet_requirements).toEqual([]);
  });

  it("quarantines when validation_status is not passed", () => {
    const result = AcquisitionGate.evaluate({
      capability_id: "new.cap",
      capability_version: "0.1.0",
      sandbox_depth: "S4",
      effect_classes: ["READ"],
      validation_status: "pending",
    });
    expect(result.action).toBe("quarantine");
    expect(result.lifecycle.spec.state).toBe("QUARANTINED");
    expect(result.unmet_requirements.some((r) => r.includes("validation_status"))).toBe(
      true,
    );
  });

  it("quarantines DESTRUCTIVE at S0 (FW-H02)", () => {
    const result = evaluateAcquisitionGate({
      capability_id: "danger.cap",
      capability_version: "0.1.0",
      sandbox_depth: "S0",
      effect_classes: ["DESTRUCTIVE"],
      validation_status: "passed",
    });
    expect(result.action).toBe("quarantine");
    expect(result.unmet_requirements.length).toBeGreaterThan(0);
  });

  it("does not mutate CapabilityRegistry on register action", () => {
    const registry = fabricRegistry();
    const before = JSON.stringify(registry.capabilities);
    evaluateAcquisitionGate({
      capability_id: "brand.new",
      capability_version: "1.0.0",
      sandbox_depth: "S1",
      effect_classes: ["LOCAL_WRITE"],
      validation_status: "passed",
    });
    expect(JSON.stringify(registry.capabilities)).toBe(before);
    expect(registry.capabilities["brand.new"]).toBeUndefined();
  });
});

describe("V3 Agency bridge + Fabric wire", () => {
  const baseProposal = {
    proposal_id: "prop-fabric",
    goal_id: "goal-1",
    intent: "pursue:documentation",
    risk: "low" as const,
    governor_required: false,
  };

  it("without registry behaves like proposalToCapabilityIR (needs_planner)", () => {
    const plain = proposalToCapabilityIR(
      { ...baseProposal, capability_hint: undefined },
      "allow",
    );
    const withFabric = proposalToCapabilityIRWithFabric(
      { ...baseProposal, capability_hint: undefined },
      "allow",
    );
    expect(plain.status).toBe("needs_planner");
    expect(withFabric.status).toBe("needs_planner");
    expect(withFabric.executed).toBe(false);
  });

  it("enriches missing hint via discovery → composition → IR", () => {
    const registry = fabricRegistry();
    const result = proposalToCapabilityIRWithFabric(
      { ...baseProposal, capability_hint: undefined },
      "allow",
      { registry },
    );
    expect(result.status).toBe("ir");
    expect(result.executed).toBe(false);
    if (result.status === "ir") {
      expect(result.ir.spec.nodes[0]!.capability).toBe("documentation");
      expect(result.ir.metadata.planner_version).toBe("v3-agency-bridge-fabric");
      expect(result.ir.spec.assumptions?.some((a) => a.startsWith("fabric_enriched"))).toBe(
        true,
      );
    }
  });

  it("enrichProposalWithFabric leaves existing hint untouched", () => {
    const registry = fabricRegistry();
    const { proposal, enriched } = enrichProposalWithFabric(
      { ...baseProposal, capability_hint: "testing" },
      registry,
    );
    expect(enriched).toBe(false);
    expect(proposal.capability_hint).toBe("testing");
  });

  it("returns needs_planner when fabric cannot plan", () => {
    const registry = fabricRegistry();
    const result = proposalToCapabilityIRWithFabric(
      {
        ...baseProposal,
        intent: "pursue:totally.unknown.capability.xyz",
        capability_hint: undefined,
      },
      "allow",
      { registry },
    );
    expect(result.status).toBe("needs_planner");
    if (result.status === "needs_planner") {
      expect(result.reason).toMatch(/unmet_need|no plan/i);
    }
  });

  it("AR-H03: multi-step composition → needs_planner (composition_pending), not silent steps[0]", () => {
    const registry = fabricRegistry();
    // Need that matches a multi-cap profile with ≥2 usable registry caps
    const result = proposalToCapabilityIRWithFabric(
      {
        ...baseProposal,
        intent: "pursue:research browser tasks",
        capability_hint: undefined,
      },
      "allow",
      { registry },
    );
    // research profile includes browser.navigate (+ others); if multi-step plan:
    if (result.status === "needs_planner") {
      expect(result.reason).toMatch(/composition_pending|unmet_need|no plan/i);
    } else if (result.status === "ir") {
      // single-step enrichment still allowed
      expect(result.ir.spec.nodes).toHaveLength(1);
    }

    // Force multi-step via ranked stub: broad need matching many caps
    const multi = enrichProposalWithFabric(
      {
        ...baseProposal,
        intent: "pursue:filesystem and git and documentation work",
        capability_hint: undefined,
      },
      registry,
    );
    if (
      multi.composition?.status === "plan" &&
      multi.composition.steps.length > 1
    ) {
      const bridged = proposalToCapabilityIRWithFabric(
        {
          ...baseProposal,
          intent: "pursue:filesystem and git and documentation work",
          capability_hint: undefined,
        },
        "allow",
        { registry },
      );
      expect(bridged.status).toBe("needs_planner");
      if (bridged.status === "needs_planner") {
        expect(bridged.reason).toMatch(/composition_pending/);
      }
    }
  });
});

describe("V3 Fabric GAP documentation surface", () => {
  it("documents browser caps in CAPABILITY_PROFILES without requiring handlers here", () => {
    expect(CAPABILITY_PROFILES.research).toContain("browser.navigate");
    expect(CAPABILITY_PROFILES.research).toContain("browser.extract");
    // GAP: handlers missing — fabric must not invent them; registry may list stubs only.
    const registry = fabricRegistry();
    const nav = registry.capabilities["browser.navigate"];
    expect(nav?.providers[0]?.id).toBe("browser-stub");
  });
});
