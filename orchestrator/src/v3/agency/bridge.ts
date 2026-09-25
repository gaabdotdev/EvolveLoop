/**
 * Bridge: AgencyProposal → CapabilityIR skeleton OR needs_planner.
 * MUST NOT execute — no ExecutionEngine.run, no providers.
 */

import type { CapabilityIR } from "../../types/index.js";
import type { AgencyProposal, GovernorAction } from "./types.js";

export type BridgeResult =
  | {
      status: "ir";
      ir: CapabilityIR;
      proposal_id: string;
      /** Explicit: skeleton only — caller must still pass Policy → Runtime. */
      executed: false;
    }
  | {
      status: "needs_planner";
      reason: string;
      proposal_id: string;
      executed: false;
    };

/**
 * Map ONE accepted proposal into a minimal CapabilityIR skeleton.
 * Returns needs_planner when governor did not allow/degrade, or capability_hint is absent.
 */
export function proposalToCapabilityIR(
  proposal: AgencyProposal,
  governorAction: GovernorAction,
): BridgeResult {
  if (governorAction === "deny") {
    return {
      status: "needs_planner",
      reason: "governor denied proposal",
      proposal_id: proposal.proposal_id,
      executed: false,
    };
  }

  if (governorAction === "confirm") {
    return {
      status: "needs_planner",
      reason: "governor requires human confirm before IR materialization",
      proposal_id: proposal.proposal_id,
      executed: false,
    };
  }

  // allow | degrade
  if (!proposal.capability_hint) {
    return {
      status: "needs_planner",
      reason: "no capability_hint — planner required",
      proposal_id: proposal.proposal_id,
      executed: false,
    };
  }

  const degraded = governorAction === "degrade";
  const ir: CapabilityIR = {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "CapabilityGraph",
    metadata: {
      id: `agency-${proposal.proposal_id}`,
      feature: proposal.intent,
      ir_version: "2.0.0",
      planner_version: "v3-agency-bridge-stub",
      replan_reason: degraded ? "governor_degrade" : undefined,
      created_at: new Date().toISOString(),
    },
    spec: {
      nodes: [
        {
          id: "agency-stub-1",
          capability: proposal.capability_hint,
          type: "worker",
          dependencies: [],
          definition_of_done: [
            {
              id: "dod-agency-1",
              check: proposal.intent,
              verification: "evidence",
            },
          ],
          metadata: {
            source: "v3-agency-bridge",
            goal_id: proposal.goal_id,
            governor_action: governorAction,
            degraded,
          },
        },
      ],
      assumptions: [
        "Agency bridge produced skeleton only",
        "MUST pass Intent→Capability→Policy→Runtime→Provider→Evidence",
        "MUST NOT be executed by Agency Layer",
      ],
      out_of_scope: ["agency-execution", "provider-invocation"],
    },
  };

  return {
    status: "ir",
    ir,
    proposal_id: proposal.proposal_id,
    executed: false,
  };
}
