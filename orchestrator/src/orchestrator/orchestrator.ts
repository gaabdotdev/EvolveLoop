import type { OrchestratorDecision } from "../types/index.js";
import type { EventBus } from "../events/event-bus.js";

export interface DecideContext {
  blocked_reason: string;
  feature_id: string;
}

export class Orchestrator {
  decide(context: DecideContext): OrchestratorDecision {
    const reason = context.blocked_reason;

    if (
      reason === "contract_version_mismatch" ||
      reason === "unrecoverable_failure" ||
      reason.startsWith("inference_error") ||
      reason.startsWith("http_error")
    ) {
      return "replan";
    }

    if (
      reason === "gate_rejected" ||
      reason.startsWith("dod_failed:")
    ) {
      return "corrigir";
    }

    if (reason === "deadlock_or_waiting_external" || reason === "awaiting_external_jobs") {
      return "continuar";
    }

    return "replan";
  }

  applyDecision(
    decision: OrchestratorDecision,
    eventBus: EventBus,
    featureId: string,
    reason: string,
  ): void {
    eventBus.emit("OrchestratorDecision", featureId, "orchestrator", {
      decision,
      reason,
    });
  }
}
