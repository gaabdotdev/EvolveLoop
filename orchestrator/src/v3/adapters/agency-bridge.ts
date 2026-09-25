/**
 * Optional thin adapter surface for V3 Agency → IR skeleton (propose path).
 * Does not wrap ExecutionEngine.run — Agency Layer must not execute.
 *
 * For Agency → Governor → Engine.run integration, use `agency-runtime.ts`.
 *
 * Fabric path (optional): when capability_hint is missing and a registry is
 * supplied, FabricDiscovery → CompositionPlanner may set the hint or leave
 * needs_planner. Never installs capabilities; never executes.
 *
 * Re-exports kept for discoverability; primary fabric surface is `src/v3/fabric/`.
 */

export { proposalToCapabilityIR, type BridgeResult } from "../agency/bridge.js";
export {
  proposalToCapabilityIRWithFabric,
  enrichProposalWithFabric,
  needFromProposal,
} from "../fabric/bridge.js";
export type { FabricBridgeOptions, FabricEnrichResult } from "../fabric/types.js";
