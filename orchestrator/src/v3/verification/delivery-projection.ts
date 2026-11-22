/**
 * V5-M06 — Delivery projection + getWorkDelivery(workId).
 * Wraps REMED-M5 deriveDeliveryStatus — no agent claim → PASS (ADR-005).
 */

import { resolve } from "node:path";
import {
  deriveDeliveryStatus,
  effectiveProvenance,
  type DeliveryStatus,
} from "../../cli/tui/delivery-status.js";
import {
  deriveDeliveryFromWorkspace,
  validateDelivery,
} from "../../cli/tui/delivery-verify.js";
import {
  PersistentWorkRuntime,
  type PersistentWorkRuntimeOpts,
} from "../work-runtime/runtime.js";
import type {
  DeliveryProjection,
  DeliveryProjectionStatus,
} from "./types.js";

const LIMITATIONS = [
  "PASS only with provenance=local_execution and exit 0 (EvolveLoop-executed)",
  "external_attestation → ATTESTED ≠ PASS",
  "absent / stale → UNVERIFIED; invalid / failed run → FAIL",
  "Agent claim / TRUE_FULL_PASS without local verification → UNVERIFIED",
  "Stale / other-work evidence ignored (REMED-M5)",
];

/** Map DeliveryStatus → projection status (FAILED → FAIL). */
export function toProjectionStatus(
  status: DeliveryStatus,
): DeliveryProjectionStatus {
  if (status === "FAILED") return "FAIL";
  return status;
}

export function fromProjectionStatus(
  status: DeliveryProjectionStatus,
): DeliveryStatus {
  if (status === "FAIL") return "FAILED";
  return status;
}

export class WorkDeliveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkDeliveryError";
  }
}

/**
 * Project Delivery for a work from durable evidence (read path).
 */
export function projectDeliveryForWork(
  workspaceRoot: string,
  opts?: {
    work_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
    task_id?: string;
    /** When set, run local command via validateDelivery (local_execution). */
    run?: string;
  },
): DeliveryProjection {
  const workspace = resolve(workspaceRoot);
  const view = opts?.run
    ? validateDelivery(workspace, {
        run: opts.run,
        work_id: opts.work_id,
        goal_contract_id: opts.goal_contract_id,
        goal_contract_version: opts.goal_contract_version,
        task_id: opts.task_id,
      })
    : deriveDeliveryFromWorkspace(workspace, {
        work_id: opts?.work_id,
        goal_contract_id: opts?.goal_contract_id,
        goal_contract_version: opts?.goal_contract_version,
        task_id: opts?.task_id,
      });

  const delivery_status = view.status;
  const status = toProjectionStatus(delivery_status);
  const provenance = effectiveProvenance(view.verification);

  return {
    kind: "DeliveryProjection",
    work_id: opts?.work_id ?? view.work_id,
    workspace,
    status,
    delivery_status,
    provenance,
    verification: view.verification,
    evidence_id: view.evidence_id,
    from_evidence: view.from_evidence,
    agent_claim_cannot_pass: true,
    message_pt: view.message_pt,
    projected_at: new Date().toISOString(),
    limitations: [...LIMITATIONS],
  };
}

/**
 * Product API: getWorkDelivery(workId) → PASS|FAIL|UNVERIFIED|ATTESTED|BLOCKED + provenance.
 * Reads Work for goal binding when present; never invents PASS from agent claim.
 */
export function getWorkDelivery(
  workId: string,
  opts: PersistentWorkRuntimeOpts & {
    task_id?: string;
    /** Optional: run local validation (local_execution) before projecting. */
    run?: string;
  },
): DeliveryProjection {
  const wid = workId.trim();
  if (!wid) throw new WorkDeliveryError("WORK_ID_REQUIRED", "work_id required");

  const runtime = new PersistentWorkRuntime(opts);
  let goal_contract_id: string | undefined;
  let goal_contract_version: number | undefined;
  try {
    const work = runtime.read(wid);
    goal_contract_id = work.goal_contract_id;
  } catch (err) {
    throw new WorkDeliveryError(
      "WORK_NOT_FOUND",
      err instanceof Error ? err.message : String(err),
    );
  }

  return projectDeliveryForWork(opts.workspaceRoot, {
    work_id: wid,
    goal_contract_id,
    goal_contract_version,
    task_id: opts.task_id,
    run: opts.run,
  });
}

/**
 * Explicitly refuse agent claim → PASS.
 * Even if mso_state is TRUE-FULL-PASS without local verification → UNVERIFIED.
 */
export function projectFromAgentClaim(input: {
  workspace: string;
  work_id?: string;
  agent_claim_pass: boolean;
  kick_started?: boolean;
}): DeliveryProjection {
  const delivery_status = deriveDeliveryStatus({
    kick_started: input.kick_started ?? true,
    mso_state: input.agent_claim_pass ? "TRUE-FULL-PASS" : undefined,
  });
  return {
    kind: "DeliveryProjection",
    work_id: input.work_id,
    workspace: resolve(input.workspace),
    status: toProjectionStatus(delivery_status),
    delivery_status,
    provenance: "absent",
    from_evidence: false,
    agent_claim_cannot_pass: true,
    message_pt:
      "Claim do agente ignorado — Delivery PASS exige local_execution verificada",
    projected_at: new Date().toISOString(),
    limitations: [...LIMITATIONS, "agent_claim_ignored"],
  };
}
