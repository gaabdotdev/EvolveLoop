import { describe, expect, it } from "vitest";
import {
  buildWorkerEvidence,
  unverifiedDodChecks,
  validateEvidenceV21,
} from "../../src/evidence/builders.js";
import type { EvidenceCheck, GraphNode } from "../../src/types/index.js";

function makeWorkerNode(): GraphNode {
  return {
    id: "worker-node-1",
    capability: "backend.code-gen",
    type: "worker",
    dependencies: [],
    definition_of_done: [
      { id: "dod-tests", check: "unit tests must pass", verification: "automated" },
      { id: "dod-review", check: "peer review required", verification: "manual" },
    ],
    status: "running",
    retry_count: 0,
  };
}

describe("TASK-P0-06 (OBS-002): Eliminating blind tautological DoD auto-approval", () => {
  it("unverifiedDodChecks marks automated checks as skip and manual checks as manual", () => {
    const node = makeWorkerNode();
    const unverified = unverifiedDodChecks(node.definition_of_done);

    expect(unverified).toEqual([
      {
        dod_id: "dod-tests",
        result: "skip",
        verification: "automated",
        details: "not_observed",
      },
      {
        dod_id: "dod-review",
        result: "manual",
        verification: "manual",
        details: "manual_not_observed",
      },
    ]);
  });

  it("buildWorkerEvidence without explicit checks does not mark automated checks as pass", () => {
    const node = makeWorkerNode();
    const evidence = buildWorkerEvidence(node, "run-1", "test-provider", 120);

    // Must not be auto-approved
    expect(evidence.spec.status).toBe("partial");
    expect(evidence.spec.confidence).toBeLessThan(0.5);
    expect(evidence.spec.coverage).toBe(0);

    const automatedCheck = evidence.spec.checks.find((c) => c.dod_id === "dod-tests");
    expect(automatedCheck?.result).toBe("skip");
    expect(automatedCheck?.result).not.toBe("pass");

    // Validation must fail closed
    const validation = validateEvidenceV21(evidence, node.definition_of_done, node, 0.5);
    expect(validation.valid).toBe(false);
  });

  it("buildWorkerEvidence accepts explicit checks and marks complete when all checks pass", () => {
    const node = makeWorkerNode();
    const explicitChecks: EvidenceCheck[] = [
      {
        dod_id: "dod-tests",
        result: "pass",
        verification: "automated",
        details: "Vitest suite executed: 42 passed",
      },
      {
        dod_id: "dod-review",
        result: "pass",
        verification: "manual",
        details: "Signed off by security reviewer",
      },
    ];

    const evidence = buildWorkerEvidence(
      node,
      "run-2",
      "test-provider",
      150,
      { files_created: ["/tmp/output.ts"], files_modified: [], commands_run: ["npm test"] },
      explicitChecks,
    );

    expect(evidence.spec.status).toBe("complete");
    expect(evidence.spec.confidence).toBe(0.9);
    expect(evidence.spec.coverage).toBe(1);
    expect(evidence.spec.checks).toEqual(explicitChecks);

    const validation = validateEvidenceV21(evidence, node.definition_of_done, node, 0.5);
    expect(validation.valid).toBe(true);
  });

  it("buildWorkerEvidence with empty definition_of_done defaults to complete", () => {
    const emptyDodNode: GraphNode = {
      id: "node-nodod",
      capability: "misc",
      type: "worker",
      dependencies: [],
      definition_of_done: [],
      status: "running",
      retry_count: 0,
    };

    const evidence = buildWorkerEvidence(emptyDodNode, "run-3", "test-provider", 50);
    expect(evidence.spec.status).toBe("complete");
    expect(evidence.spec.checks).toEqual([]);

    const validation = validateEvidenceV21(evidence, emptyDodNode.definition_of_done, emptyDodNode, 0.5);
    expect(validation.valid).toBe(true);
  });
});
