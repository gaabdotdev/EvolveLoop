/**
 * Apply a classified limit signal: update agent state + create Continuity handoff.
 */

import { ContinuityEngine } from "../continuity/engine.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import type { V3DataPaths } from "../paths.js";
import { classifyLimitSignal, type LimitClassification } from "./classifier.js";
import type { HandoffPackage } from "../continuity/types.js";

export interface LimitHandoffResult {
  kind: "LimitHandoffResult";
  classification: LimitClassification;
  handoff?: HandoffPackage;
  agent_id: string;
  work_id: string;
  limitations: string[];
}

export function triggerLimitHandoff(
  paths: V3DataPaths,
  input: {
    work_id: string;
    agent_id: string;
    signal: string;
    preventive?: boolean;
    apply_handoff?: boolean;
    next_action?: string;
  },
): LimitHandoffResult {
  const classification = classifyLimitSignal(input.signal, { preventive: input.preventive });
  const agents = new AgentRegistryStore(paths.agentsDir);
  const events = new CoordinationEventLog(paths.eventLogDir);

  agents.setState(input.work_id, input.agent_id, classification.agent_state);
  events.append({
    work_id: input.work_id,
    type: "limits.signal",
    actor: input.agent_id,
    payload: { ...classification },
  });

  let handoff: HandoffPackage | undefined;
  if (classification.should_handoff) {
    const engine = new ContinuityEngine(paths);
    handoff = engine.createHandoff({
      work_id: input.work_id,
      agent_id: input.agent_id,
      trigger: classification.agent_state === "LIMIT_REACHED" ? "LIMIT_REACHED" : "FAILED",
      reason: `${classification.cause}: ${classification.detail}`,
      next_action: input.next_action,
    });
    if (input.apply_handoff) {
      handoff = engine.applyHandoff(handoff.handoff_id);
    }
  }

  return {
    kind: "LimitHandoffResult",
    classification,
    handoff,
    agent_id: input.agent_id,
    work_id: input.work_id,
    limitations: [
      "Classification is heuristic over free-text provider errors",
      "Does not invent token quotas; only reacts to reported signals",
    ],
  };
}
