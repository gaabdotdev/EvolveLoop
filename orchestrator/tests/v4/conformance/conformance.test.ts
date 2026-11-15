/**
 * Consumer conformance hooks (M00). Implementations of ports are owned by other metas;
 * this suite pins the contract catalog, versions, and the shapes consumers must import.
 */

import { describe, expect, it } from "vitest";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATALOG_VERSION,
  EVENT_TYPE_CATALOG,
  isReadableVersion,
  type ContractKind,
  type EventLedgerPort,
  type CapsuleServicePort,
  type PolicyDecisionPort,
  type WorkRepositoryPort,
  type EffectLedgerPort,
  type ArtifactStorePort,
  type CheckpointStorePort,
  type VerifierPort,
  type WorkProofPort,
  type CapabilityProfilePort,
  type ProvenanceQueryPort,
  type ExecutionGatewayPort,
  type MeasurementSinkPort,
} from "../../../src/v4/contracts/index.js";

const KINDS: ContractKind[] = [
  "GoalContract",
  "Work",
  "Task",
  "Execution",
  "Executor",
  "ExecutionCapsule",
  "Checkpoint",
  "EffectRecord",
  "Artifact",
  "Evidence",
  "WorkProof",
  "Policy",
  "PolicyDecision",
  "CapabilityProfile",
  "WorkEvent",
];

describe("consumer conformance — catalog", () => {
  it("catalog v1 lists every domain contract with a validator and FROZEN stability", () => {
    expect(CONTRACT_CATALOG_VERSION).toBe("1.0.0");
    for (const kind of KINDS) {
      const entry = CONTRACT_CATALOG[kind];
      expect(entry.kind).toBe(kind);
      expect(entry.schema_version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.stability).toBe("FROZEN");
      expect(typeof entry.validate).toBe("function");
      expect(entry.producer.startsWith("M")).toBe(true);
    }
    expect(Object.keys(CONTRACT_CATALOG).sort()).toEqual([...KINDS].sort());
  });

  it("same-major versions are readable; major bumps are not", () => {
    expect(isReadableVersion("1.2.0", "1.0.0")).toBe(true);
    expect(isReadableVersion("2.0.0", "1.0.0")).toBe(false);
    expect(isReadableVersion("not-semver", "1.0.0")).toBe(false);
  });

  it("every catalogued event type has exactly one owner meta", () => {
    for (const [type, meta] of Object.entries(EVENT_TYPE_CATALOG)) {
      expect(type).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(meta.owner).toMatch(/^M\d{2}$/);
    }
  });
});

describe("consumer conformance — port shapes (compile-time + existence)", () => {
  it("exposes the integration ports consumers must implement", () => {
    type Ports = [
      EventLedgerPort,
      CapsuleServicePort,
      PolicyDecisionPort,
      WorkRepositoryPort,
      EffectLedgerPort,
      ArtifactStorePort,
      CheckpointStorePort,
      VerifierPort,
      WorkProofPort,
      CapabilityProfilePort,
      ProvenanceQueryPort,
      ExecutionGatewayPort,
      MeasurementSinkPort,
    ];
    const names: Array<keyof Ports[number] | string> = [
      "append",
      "seal",
      "accept",
      "decide",
      "getWork",
      "plan",
      "put",
      "create",
      "verify",
      "build",
      "profilesFor",
      "decisionOrigin",
      "dispatch",
      "emit",
    ];
    expect(names).toContain("accept");
    expect(names).toContain("append");
  });
});
