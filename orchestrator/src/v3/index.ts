/**
 * EvolveLoop V3 additive surface.
 * Phase 0/1: first-wave contracts.
 * Phase F2 start: minimal Agency Layer (proposes only; does not execute).
 * Phase F3 start: World Model substrate (Observation/Belief; not KnowledgeBackend)
 *                + Capability Fabric adapter (discovery/compose/acquisition stub).
 * Phase F5 start: Failure Containment + Recovery + Anti-Stagnation helpers.
 * Phase F6 start: Meta0 Public Proof (demo catalog + honest NOT_MEASURED stub).
 * Integration: adapters/agency-runtime wires Agency→ExecutionEngine (Policy owns run).
 */

export * from "./contracts/index.js";
export * from "./goals/index.js";
export * from "./agency/index.js";
export * from "./world-model/index.js";
export * from "./fabric/index.js";
export * from "./failure/index.js";
export * from "./adapters/index.js";
export * from "./meta0/index.js";
// adapters/agency-bridge re-exports for path discoverability; symbols already
// covered by agency/ + fabric/ barrels (no second export * of bridge to avoid clashes).
