/**
 * V3.7 adapter boundary (ADR-V4-0002). V4 consumes V3.7 guarantees through these ports only.
 * Port shapes are DERIVED from the V3.7 classes via type-only imports: zero runtime coupling,
 * and the compiler fails if V3.7 signatures drift. Implementations live in
 * orchestrator/src/v4/adapters/v37/ (owners per OWNERSHIP-MAP.md) and must DELEGATE to these
 * V3.7 modules — never re-implement them.
 *
 * Baseline is PROVISIONAL (03937c1; V3.7 BLOCKED on G17). Re-run adapter contract tests on the
 * certified hash once published.
 */

import type { TrustState } from "../../v3/fabric/types.js";
import type { LeaseManager } from "../../v3/fabric/leases/lease-manager.js";
import type { ArtifactFabric } from "../../v3/fabric/artifacts/registry.js";
import type { PlacementEngine } from "../../v3/fabric/scheduler/placement.js";
import type { NodeRegistry } from "../../v3/fabric/node-registry/registry.js";
import type { ApprovalRequest } from "../../v3/approvals/types.js";
import type { CapabilityAction } from "../../v3/security/types.js";
import type { TaskState as V3TaskState, WorkState as V3WorkState } from "../../v3/goal-contract/types.js";
import type { ExecutorTrustState } from "./executor.js";
import type { TaskState } from "./task.js";
import type { WorkState } from "./work.js";

/** Compile-time guard: V4 executor trust vocabulary must stay identical to V3.7 TrustState. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export const TRUST_VOCABULARY_MATCHES_V37: Equal<ExecutorTrustState, TrustState> = true;

/** Leases + fencing epochs: v3/fabric/leases/lease-manager.ts. Consumers: M02 (fenced append), M04, M13. */
export type V37LeaseFencingPort = Pick<LeaseManager, "get" | "issue" | "renew" | "revoke" | "release">;

/** Content-addressed artifact storage: v3/fabric/artifacts/registry.ts. Consumer: M02 ArtifactStorePort. */
export type V37ArtifactPort = Pick<ArtifactFabric, "putLocalFile" | "get" | "verify" | "authorizeRead">;

/** Placement with hard rejects + soft ranking: v3/fabric/scheduler/placement.ts. Consumer: M13 (M09 supplies ranking inputs). */
export type V37PlacementPort = Pick<PlacementEngine, "place">;

/** Node registry / trust state: v3/fabric/node-registry/registry.ts. Consumers: M13, M14. */
export type V37NodeRegistryPort = NodeRegistry;

/**
 * Capsule signatures reuse V3.7 Ed25519 primitives (v3/fabric/trust/identity.ts:
 * signPayload/verifyPayload) — function imports belong to the adapter implementation, not here.
 */
export interface V37SignaturePort {
  sign(private_key_pem: string, payload: string): string;
  verify(public_key_spki_b64: string, payload: string, signature_b64: string): boolean;
}

/** V3.5 action vocabulary is the initial V4 policy action vocabulary (M10 may extend, not rename). */
export type V37CapabilityAction = CapabilityAction;

/** Human approvals reuse the V3 approval broker records (M10 adapter). */
export type V37ApprovalRecord = ApprovalRequest;

/**
 * Normative V3 → V4 vocabulary mapping for adapters/migration (ADR-V4-0002 §Mapping).
 * V3 TRUE_PASS / TRUE_FULL_PASS are NOT equivalent to V4 VERIFIED / PROVEN: they lack the
 * independence and staleness checks, so imported results land in "unverified" states until an
 * M06 verifier re-derives them.
 */
export const V3_TASK_STATE_TO_V4 = {
  PENDING: "PENDING",
  IN_PROGRESS: "RUNNING",
  PARTIAL_PASS: "SUCCEEDED_UNVERIFIED",
  TRUE_PASS: "SUCCEEDED_UNVERIFIED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<V3TaskState, TaskState>;

export const V3_WORK_STATE_TO_V4 = {
  NOT_PASS: "RUNNING",
  IN_PROGRESS: "RUNNING",
  VERIFICATION: "VERIFYING",
  RECOVERY: "RECOVERING",
  BLOCKED: "BLOCKED",
  CANCELLED: "CANCELLED",
  TRUE_FULL_PASS: "VERIFYING",
} as const satisfies Record<V3WorkState, WorkState>;
