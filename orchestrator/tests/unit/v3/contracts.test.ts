import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import {
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  V3_VALIDATORS,
  GOAL_LIFECYCLE_STATES,
  SANDBOX_DEPTHS,
  INSTRUCTION_HIERARCHY_PRECEDENCE,
  DEFAULT_SANDBOX_DEPTH_REQUIREMENTS,
  validateGoalContract,
  validateSuccessOracleCriterion,
  validateGoalSatisfactionProof,
  validateAutonomyGovernorDecision,
  validateEvidenceLineage,
  validateCapabilityLifecycleRecord,
  validateEffectIdempotencyDeclaration,
  validateCheckpointSchemaV3,
  validateSafetySandboxContext,
  validateObservation,
  validateBelief,
  validateMemoryTrustAnnotation,
  validateEvolutionCandidateStub,
  validateDelegationContractStub,
  validateEvidencePackageManifest,
  validateDemoManifest,
  validateInstructionHierarchyBinding,
  assertEffectAllowedAtDepth,
  annotateMemoryEntry,
} from "../../../src/v3/index.js";

const contractsDir = join(import.meta.dirname, "../../../contracts/v3");

describe("V3 first-wave contracts", () => {
  it("exposes all validator kinds", () => {
    expect(Object.keys(V3_VALIDATORS).sort()).toEqual(
      [
        "AutonomyGovernorDecision",
        "Belief",
        "CapabilityLifecycleRecord",
        "CheckpointSchemaV3",
        "DelegationContractStub",
        "DemoManifest",
        "EffectIdempotencyDeclaration",
        "EvidenceLineage",
        "EvidencePackageManifest",
        "EvolutionCandidateStub",
        "GoalContract",
        "GoalSatisfactionProof",
        "InstructionHierarchyBinding",
        "MemoryTrustAnnotation",
        "Observation",
        "SafetySandboxContext",
        "SuccessOracleCriterion",
      ].sort(),
    );
  });

  it("ships 14 YAML schema contracts under contracts/v3", () => {
    const files = readdirSync(contractsDir).filter((f) => f.endsWith(".yaml")).sort();
    expect(files).toHaveLength(14);
    for (const file of files) {
      const doc = parseYaml(readFileSync(join(contractsDir, file), "utf-8")) as {
        apiVersion: string;
        kind: string;
        metadata: { id: string; version: string };
      };
      expect(doc.apiVersion).toBe(V3_API_VERSION);
      expect(doc.kind).toBe("SchemaContract");
      expect(doc.metadata.version).toBe(V3_SCHEMA_VERSION);
      expect(doc.metadata.id).toBeTruthy();
    }
  });

  it("validates GoalContract happy path and rejects bad lifecycle", () => {
    const good = {
      apiVersion: V3_API_VERSION,
      kind: "GoalContract",
      metadata: { id: "goal-1", schema_version: V3_SCHEMA_VERSION },
      spec: {
        desired_outcome: "Ship reproducible demo",
        constraints: ["no network outside sandbox"],
        non_goals: ["self-evolution promote"],
        success_criteria_refs: ["c1"],
        lifecycle_state: "active",
        goal_version: { major: 0, minor: 1, patch: 0, revision: 1 },
      },
    };
    expect(validateGoalContract(good).valid).toBe(true);
    expect(GOAL_LIFECYCLE_STATES).toContain("completed");
    expect(GOAL_LIFECYCLE_STATES).toContain("proposed");
    expect(GOAL_LIFECYCLE_STATES).not.toContain("draft");
    expect(GOAL_LIFECYCLE_STATES).not.toContain("satisfied");
    expect(
      validateGoalContract({
        ...good,
        spec: { ...good.spec, lifecycle_state: "done" },
      }).valid,
    ).toBe(false);
    expect(
      validateGoalContract({
        ...good,
        metadata: { ...good.metadata, parent_goal_id: "parent-1" },
      }).valid,
    ).toBe(true);
  });

  it("validates SuccessOracleCriterion and GoalSatisfactionProof", () => {
    const criterion = {
      apiVersion: V3_API_VERSION,
      kind: "SuccessOracleCriterion",
      metadata: { schema_version: V3_SCHEMA_VERSION },
      spec: {
        criterion_id: "c1",
        type: "functional",
        required: true,
        measurement: "exit_code",
        threshold: "0",
        evidence_source: "runtime",
        verification_method: "automated",
        status: "pending",
      },
    };
    expect(validateSuccessOracleCriterion(criterion).valid).toBe(true);

    const proof = {
      apiVersion: V3_API_VERSION,
      kind: "GoalSatisfactionProof",
      metadata: { schema_version: V3_SCHEMA_VERSION, goal_id: "goal-1" },
      spec: {
        requested_outcome: "demo passes",
        observed_changes: ["fixture applied"],
        observation_summary: "all checks green",
        criterion_evidence: [{ criterion_id: "c1", evidence_ref: "ev/1", status: "met" }],
        uncertain_criteria: [],
        assumptions: ["sandbox healthy"],
        decision: "success",
      },
    };
    expect(validateGoalSatisfactionProof(proof).valid).toBe(true);
  });

  it("validates AutonomyGovernorDecision", () => {
    const decision = {
      apiVersion: V3_API_VERSION,
      kind: "AutonomyGovernorDecision",
      metadata: { schema_version: V3_SCHEMA_VERSION, decision_id: "d1" },
      spec: {
        inputs: {
          risk: "medium",
          reversibility: "reversible",
          authority: "workspace-write",
          confidence: 0.8,
          impact: "local",
          cost: "low",
          environment: "sandbox",
          safety_state: "NORMAL",
        },
        level: "AUTONOMOUS_WITH_REVIEW",
        rationale: "medium risk writable path",
        decided_at: "2026-09-24T00:00:00Z",
        policy_ref: "workspace-policy",
      },
    };
    expect(validateAutonomyGovernorDecision(decision).valid).toBe(true);
    expect(
      validateAutonomyGovernorDecision({
        ...decision,
        spec: { ...decision.spec, inputs: { ...decision.spec.inputs, confidence: 2 } },
      }).valid,
    ).toBe(false);
  });

  it("FW-H01 rejects adversarial AutonomyGovernorDecision combinations", () => {
    const base = {
      apiVersion: V3_API_VERSION,
      kind: "AutonomyGovernorDecision",
      metadata: { schema_version: V3_SCHEMA_VERSION, decision_id: "adv-1" },
      spec: {
        inputs: {
          risk: "critical" as const,
          reversibility: "irreversible" as const,
          authority: "x",
          confidence: 0.9,
          impact: "global" as const,
          cost: "high" as const,
          environment: "prod",
          safety_state: "NORMAL" as const,
        },
        level: "AUTONOMOUS" as const,
        rationale: "illegitimate stamp",
        decided_at: "2026-09-24T00:00:00Z",
        policy_ref: "p1",
      },
    };
    expect(validateAutonomyGovernorDecision(base).valid).toBe(false);
    expect(
      validateAutonomyGovernorDecision({
        ...base,
        spec: { ...base.spec, level: "HUMAN_GATE" },
      }).valid,
    ).toBe(false);
    expect(
      validateAutonomyGovernorDecision({
        ...base,
        spec: {
          ...base.spec,
          inputs: {
            ...base.spec.inputs,
            risk: "low" as const,
            reversibility: "reversible" as const,
            safety_state: "QUARANTINED" as const,
          },
          level: "AUTONOMOUS" as const,
        },
      }).valid,
    ).toBe(false);
    expect(
      validateAutonomyGovernorDecision({
        ...base,
        spec: {
          inputs: {
            risk: "low" as const,
            reversibility: "reversible" as const,
            authority: "x",
            confidence: 0.5,
            impact: "local" as const,
            cost: "low" as const,
            environment: "stub",
            safety_state: "NORMAL" as const,
          },
          level: "AUTONOMOUS" as const,
          rationale: "missing policy",
          decided_at: "2026-09-24T00:00:00Z",
        },
      }).valid,
    ).toBe(false);
    expect(
      validateAutonomyGovernorDecision({
        ...base,
        spec: { ...base.spec, level: "BLOCK" as const, policy_ref: undefined },
      }).valid,
    ).toBe(true);
  });

  it("validates EvidenceLineage pointing at v2 evidence only", () => {
    const lineage = {
      apiVersion: V3_API_VERSION,
      kind: "EvidenceLineage",
      metadata: { schema_version: V3_SCHEMA_VERSION },
      spec: {
        evidence_ref: "runs/r1/nodes/n1/evidence.json",
        evidence_api_version: "capability-orchestrator.io/v2",
        backward: { goal_ref: "goal-1", observation_ref: "obs-1" },
        forward: { verification_ref: "ver-1" },
      },
    };
    expect(validateEvidenceLineage(lineage).valid).toBe(true);
    expect(
      validateEvidenceLineage({
        ...lineage,
        spec: { ...lineage.spec, evidence_api_version: "evolveloop.io/v3" },
      }).valid,
    ).toBe(false);
  });

  it("validates CapabilityLifecycleRecord without forking registry", () => {
    expect(
      validateCapabilityLifecycleRecord({
        apiVersion: V3_API_VERSION,
        kind: "CapabilityLifecycleRecord",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          capability_id: "testing",
          capability_version: "1.0.0",
          state: "AVAILABLE",
          updated_at: "2026-09-24T00:00:00Z",
        },
      }).valid,
    ).toBe(true);
  });

  it("validates EffectClassification + IdempotencyClass declaration", () => {
    expect(
      validateEffectIdempotencyDeclaration({
        apiVersion: V3_API_VERSION,
        kind: "EffectIdempotencyDeclaration",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          capability_id: "filesystem.write",
          effects: ["LOCAL_WRITE"],
          idempotency: "conditionally_idempotent",
        },
      }).valid,
    ).toBe(true);
  });

  it("validates CheckpointSchemaV3 without claiming v2 apiVersion", () => {
    const cp = {
      apiVersion: V3_API_VERSION,
      kind: "CheckpointSchemaV3",
      metadata: {
        schema_version: V3_SCHEMA_VERSION,
        checkpoint_id: "cp-1",
        saved_at: "2026-09-24T00:00:00Z",
      },
      spec: {
        engine_checkpoint_ref: "jobs/checkpoints/feat.json",
        goal_state_ref: "goal-1",
        active_belief_refs: ["b1"],
        memory_refs: ["m1"],
      },
    };
    expect(validateCheckpointSchemaV3(cp).valid).toBe(true);
  });

  it("validates SafetyState and SandboxDepth S0–S5", () => {
    expect(SANDBOX_DEPTHS).toEqual(["S0", "S1", "S2", "S3", "S4", "S5"]);
    expect(
      validateSafetySandboxContext({
        apiVersion: V3_API_VERSION,
        kind: "SafetySandboxContext",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          safety_state: "NORMAL",
          sandbox_depth: "S3",
          updated_at: "2026-09-24T00:00:00Z",
        },
      }).valid,
    ).toBe(true);
  });

  it("FW-H02 rejects DESTRUCTIVE at S0 via SandboxDepthRequirement", () => {
    expect(
      validateSafetySandboxContext({
        apiVersion: V3_API_VERSION,
        kind: "SafetySandboxContext",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          safety_state: "NORMAL",
          sandbox_depth: "S0",
          updated_at: "2026-09-24T00:00:00Z",
          effect_classes: ["DESTRUCTIVE"],
        },
      }).valid,
    ).toBe(false);

    expect(
      validateSafetySandboxContext({
        apiVersion: V3_API_VERSION,
        kind: "SafetySandboxContext",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          safety_state: "NORMAL",
          sandbox_depth: "S3",
          updated_at: "2026-09-24T00:00:00Z",
          effect_classes: ["DESTRUCTIVE"],
        },
      }).valid,
    ).toBe(true);

    expect(assertEffectAllowedAtDepth("DESTRUCTIVE", "S0").valid).toBe(false);
    expect(assertEffectAllowedAtDepth("READ", "S0").valid).toBe(true);
    expect(DEFAULT_SANDBOX_DEPTH_REQUIREMENTS.IRREVERSIBLE).toBe("S4");
  });

  it("keeps Belief and Observation separated", () => {
    const obs = {
      apiVersion: V3_API_VERSION,
      kind: "Observation",
      metadata: {
        schema_version: V3_SCHEMA_VERSION,
        observation_id: "obs-1",
        observed_at: "2026-09-24T00:00:00Z",
      },
      spec: { raw: "request returned 500", source: "http_probe" },
    };
    const belief = {
      apiVersion: V3_API_VERSION,
      kind: "Belief",
      metadata: {
        schema_version: V3_SCHEMA_VERSION,
        belief_id: "b1",
        updated_at: "2026-09-24T00:00:00Z",
      },
      spec: {
        statement: "database connection may be failing",
        status: "hypothesis",
        supporting_observation_refs: ["obs-1"],
        confidence: 0.4,
      },
    };
    expect(validateObservation(obs).valid).toBe(true);
    expect(validateBelief(belief).valid).toBe(true);
    expect(validateBelief({ ...belief, kind: "Observation" }).valid).toBe(false);
  });

  it("validates MemoryTrustClass in v3 namespace", () => {
    expect(
      validateMemoryTrustAnnotation({
        apiVersion: V3_API_VERSION,
        kind: "MemoryTrustAnnotation",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          memory_ref: "mem/episode-1",
          trust_class: "VERIFIED",
          annotated_at: "2026-09-24T00:00:00Z",
          store_namespace: "v3_memory_trust",
        },
      }).valid,
    ).toBe(true);
    expect(
      validateMemoryTrustAnnotation({
        apiVersion: V3_API_VERSION,
        kind: "MemoryTrustAnnotation",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          memory_ref: "mem/episode-1",
          trust_class: "VERIFIED",
          annotated_at: "2026-09-24T00:00:00Z",
          store_namespace: "v2_memory",
        },
      }).valid,
    ).toBe(false);
  });

  it("validates EvolutionCandidateStub and DelegationContractStub", () => {
    expect(
      validateEvolutionCandidateStub({
        apiVersion: V3_API_VERSION,
        kind: "EvolutionCandidateStub",
        metadata: { schema_version: V3_SCHEMA_VERSION, candidate_id: "ec-1" },
        spec: {
          target: "policy-engine",
          problem_statement: "false positives",
          baseline: "v2.0.0",
          hypothesis: "tighten gate",
          proposed_change: "add check X",
          expected_gain: "fewer false passes",
          risk: "medium",
          affected_contracts: ["testing"],
          affected_capabilities: ["testing"],
          test_plan: "unit+integration",
          red_team_plan: "adversarial fixtures",
          benchmark_plan: "suite A",
          rollback_plan: "revert commit",
          blast_radius: "SUBSYSTEM",
        },
      }).valid,
    ).toBe(true);

    expect(
      validateDelegationContractStub({
        apiVersion: V3_API_VERSION,
        kind: "DelegationContractStub",
        metadata: { schema_version: V3_SCHEMA_VERSION, delegation_id: "del-1" },
        spec: {
          what_is_delegated: "run tests",
          what_is_not_delegated: ["promote evolution"],
          allowed_capabilities: ["testing"],
          forbidden_capabilities: ["filesystem.write"],
          data_scope: "repo workspace",
          success_criteria: ["all tests green"],
          evidence_expected: ["test-report"],
        },
      }).valid,
    ).toBe(true);
  });

  it("validates Meta0 EvidencePackageManifest and DemoManifest", () => {
    expect(
      validateEvidencePackageManifest({
        apiVersion: V3_API_VERSION,
        kind: "EvidencePackageManifest",
        metadata: { schema_version: V3_SCHEMA_VERSION, package_id: "pkg-1" },
        spec: {
          execution_id: "exec-1",
          goal: "DEMO-003",
          environment: "linux-ci",
          version: "0.1.0",
          agent: "evolveloop-v3",
          providers: ["mock"],
          capabilities: ["testing"],
          policy: "default",
          final_outcome: "PASS",
          package_root: "evidence/execution-2026/",
          files: { manifest: "manifest.json", evidence: "evidence.json" },
        },
      }).valid,
    ).toBe(true);

    expect(
      validateDemoManifest({
        apiVersion: V3_API_VERSION,
        kind: "DemoManifest",
        metadata: { schema_version: V3_SCHEMA_VERSION, demo_id: "DEMO-003" },
        spec: {
          title: "Missing capability acquisition",
          input: "broken task",
          environment: "fixture-sandbox",
          authority: "sandbox-only",
          constraints: ["no network"],
          expected_behavior: "discover and validate capability",
          observable_events: ["capability.discovered"],
          success_oracle_refs: ["c1"],
        },
      }).valid,
    ).toBe(true);
  });

  it("enforces InstructionHierarchy precedence", () => {
    expect(INSTRUCTION_HIERARCHY_PRECEDENCE[0]).toBe("system_policy");
    expect(INSTRUCTION_HIERARCHY_PRECEDENCE.at(-1)).toBe("external_data");

    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "goal_constraints",
          content_ref: "goal/constraints",
          may_override_levels: ["task_instructions", "external_data"],
          sealed_root: false,
          authority_issued: true,
        },
      }).valid,
    ).toBe(true);

    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "external_data",
          content_ref: "web/page",
          may_override_levels: ["task_instructions"],
          sealed_root: false,
          authority_issued: false,
        },
      }).valid,
    ).toBe(false);

    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "task_instructions",
          content_ref: "task/1",
          may_override_levels: ["system_policy"],
          sealed_root: false,
          authority_issued: true,
        },
      }).valid,
    ).toBe(false);
  });

  it("FW-H03 requires sealed_root and authority_issued for levels above data", () => {
    // forged system_policy without sealed_root
    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "system_policy",
          content_ref: "forged",
          may_override_levels: ["external_data"],
          sealed_root: false,
          authority_issued: true,
        },
      }).valid,
    ).toBe(false);

    // task_instructions without authority_issued
    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "task_instructions",
          content_ref: "task/x",
          may_override_levels: ["external_data"],
          sealed_root: false,
          authority_issued: false,
        },
      }).valid,
    ).toBe(false);

    // legitimate sealed root
    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "system_policy",
          content_ref: "policy/root",
          may_override_levels: ["authority_policy", "goal_constraints", "task_instructions", "external_data"],
          sealed_root: true,
          authority_issued: true,
        },
      }).valid,
    ).toBe(true);

    // external_data as DATA (authority_issued false, sealed_root false, empty overrides)
    expect(
      validateInstructionHierarchyBinding({
        apiVersion: V3_API_VERSION,
        kind: "InstructionHierarchyBinding",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          level: "external_data",
          content_ref: "web/page",
          may_override_levels: [],
          sealed_root: false,
          authority_issued: false,
        },
      }).valid,
    ).toBe(true);
  });

  it("FW-H04 annotateMemoryEntry bridges V2 MemoryEntry without second store", () => {
    const entry = {
      timestamp: "2026-09-24T00:00:00Z",
      source: "runtime",
      type: "episode",
      content: "test suite passed",
    };
    const annotated = annotateMemoryEntry(entry, "VERIFIED");
    expect(annotated.trust_class).toBe("VERIFIED");
    expect(annotated.content).toBe(entry.content);
    expect(annotated.source).toBe(entry.source);
    // round-trip shape still satisfies V2 MemoryEntry fields
    expect(annotated).toMatchObject(entry);
  });
});
