/**
 * Optional Fabric enrichment for Agency bridge.
 * When capability_hint is missing: FabricDiscovery → CompositionPlanner → hint | needs_planner.
 * MUST NOT execute.
 */

import type { CapabilityRegistry } from "../../types/index.js";
import {
  proposalToCapabilityIR,
  type BridgeResult,
} from "../agency/bridge.js";
import type { AgencyProposal, GovernorAction } from "../agency/types.js";
import { discoverCapabilities } from "./discovery.js";
import { planComposition } from "./composition.js";
import type { FabricBridgeOptions, FabricEnrichResult } from "./types.js";

/**
 * Need string for discovery: prefer intent, strip pursue: prefix when present.
 */
export function needFromProposal(proposal: AgencyProposal): string {
  const intent = proposal.intent.trim();
  if (intent.toLowerCase().startsWith("pursue:")) {
    return intent.slice("pursue:".length).trim() || intent;
  }
  return intent;
}

/**
 * If hint already present, return proposal unchanged.
 * Else discover + plan; on plan set capability_hint to first step.
 */
export function enrichProposalWithFabric(
  proposal: AgencyProposal,
  registry: CapabilityRegistry,
  options?: Pick<FabricBridgeOptions, "lifecycleById">,
): FabricEnrichResult {
  if (proposal.capability_hint) {
    return { proposal, composition: null, enriched: false };
  }

  const need = needFromProposal(proposal);
  const candidates = discoverCapabilities(need, registry, {
    lifecycleById: options?.lifecycleById,
  });
  const composition = planComposition(need, candidates);

  if (composition.status === "plan" && composition.steps.length > 0) {
    return {
      proposal: {
        ...proposal,
        capability_hint: composition.steps[0],
      },
      composition,
      enriched: true,
    };
  }

  return { proposal, composition, enriched: false };
}

/**
 * Agency bridge with optional Fabric discovery when hint is absent.
 * Without registry: identical to proposalToCapabilityIR.
 */
export function proposalToCapabilityIRWithFabric(
  proposal: AgencyProposal,
  governorAction: GovernorAction,
  fabric?: FabricBridgeOptions,
): BridgeResult {
  if (!fabric) {
    return proposalToCapabilityIR(proposal, governorAction);
  }

  // Still respect governor deny/confirm before spending discovery
  if (governorAction === "deny" || governorAction === "confirm") {
    return proposalToCapabilityIR(proposal, governorAction);
  }

  const { proposal: enriched, enriched: didEnrich, composition } = enrichProposalWithFabric(
    proposal,
    fabric.registry,
    { lifecycleById: fabric.lifecycleById },
  );

  if (!enriched.capability_hint) {
    return {
      status: "needs_planner",
      reason:
        composition?.status === "unmet_need"
          ? `fabric unmet_need: ${composition.rationale}`
          : "no capability_hint — fabric discovery found no plan",
      proposal_id: proposal.proposal_id,
      executed: false,
    };
  }

  // AR-H03: multi-step composition must not silently execute steps[0] as full success.
  if (
    didEnrich &&
    composition?.status === "plan" &&
    composition.steps.length > 1
  ) {
    return {
      status: "needs_planner",
      reason: `composition_pending: fabric multi-step plan (${composition.steps.length} steps: ${composition.steps.join(" → ")}) requires planner — refusing silent steps[0] execution`,
      proposal_id: proposal.proposal_id,
      executed: false,
    };
  }

  const result = proposalToCapabilityIR(enriched, governorAction);
  if (result.status === "ir" && didEnrich && composition?.status === "plan") {
    result.ir.spec.assumptions = [
      ...(result.ir.spec.assumptions ?? []),
      `fabric_enriched: ${composition.rationale}`,
      `fabric_steps: ${composition.steps.join(" → ")}`,
    ];
    result.ir.metadata.planner_version = "v3-agency-bridge-fabric";
  }
  return result;
}
