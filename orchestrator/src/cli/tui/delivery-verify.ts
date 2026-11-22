/**
 * V4.3 P0-2 — Attach / re-derive Delivery from real verification evidence.
 * Never maps adapter ok → PASS. Without evidence → UNVERIFIED.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  StateDb,
  defaultStateDbPath,
} from "../../v3/state-db/store.js";
import type { EvidenceRecordRow } from "../../v3/state-db/types.js";
import {
  deriveDeliveryStatus,
  type DeliveryStatus,
} from "./delivery-status.js";

export interface DeliveryVerification {
  command: string;
  exit_code: number;
}

export interface DeliveryEvidenceView {
  workspace: string;
  work_id?: string;
  status: DeliveryStatus;
  verification?: DeliveryVerification;
  evidence_id?: string;
  kick_started: boolean;
  mso_state?: string;
  /** True when status came from attached evidence, not invented. */
  from_evidence: boolean;
  message_pt: string;
  lines: string[];
}

const EVIDENCE_KIND = "delivery_verification";

function openDb(workspace: string): StateDb {
  return new StateDb(defaultStateDbPath(resolve(workspace)));
}

function latestMsoState(db: StateDb, workspace: string): string | undefined {
  return db.listMsoSessionsForWorkspace(workspace, 1)[0]?.state;
}

function verificationFromPayload(
  payload: Record<string, unknown>,
): DeliveryVerification | undefined {
  const command =
    typeof payload.command === "string"
      ? payload.command
      : typeof payload.argv === "string"
        ? payload.argv
        : Array.isArray(payload.argv)
          ? (payload.argv as unknown[]).map(String).join(" ")
          : "";
  const exitRaw = payload.exit_code ?? payload.exitCode;
  const exit_code =
    typeof exitRaw === "number"
      ? exitRaw
      : typeof exitRaw === "string" && exitRaw.trim() !== ""
        ? Number(exitRaw)
        : NaN;
  if (!command.trim() || !Number.isFinite(exit_code)) return undefined;
  return { command: command.trim(), exit_code };
}

/** Pick newest delivery_verification evidence (or any with exit_code+command). */
export function extractVerificationFromEvidence(
  rows: EvidenceRecordRow[],
): { verification: DeliveryVerification; evidence_id: string } | undefined {
  const sorted = [...rows].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  );
  for (const row of sorted) {
    if (row.status === "STALE") continue;
    const fromKind = verificationFromPayload(row.payload);
    if (fromKind) {
      return { verification: fromKind, evidence_id: row.evidence_id };
    }
  }
  return undefined;
}

/**
 * Persist a verification result as evidence (gancho mínimo).
 * Does not invent PASS — caller still derives via deriveDeliveryStatus.
 */
export function attachDeliveryVerification(
  workspaceRoot: string,
  verification: DeliveryVerification,
  opts?: {
    work_id?: string;
    goal_contract_id?: string;
    task_id?: string;
    evidence_id?: string;
  },
): EvidenceRecordRow {
  const workspace = resolve(workspaceRoot);
  const db = openDb(workspace);
  try {
    const work_id =
      opts?.work_id ??
      db.listValidatedGoalContracts()[0]?.work_id ??
      "work-delivery-unscoped";
    const status = verification.exit_code === 0 ? "VALID" : "INVALID";
    return db.upsertEvidenceRecord({
      evidence_id: opts?.evidence_id,
      work_id,
      task_id: opts?.task_id,
      goal_contract_id:
        opts?.goal_contract_id ??
        db.listValidatedGoalContracts()[0]?.goal_contract_id,
      status: status as "VALID" | "INVALID",
      kind: EVIDENCE_KIND,
      payload: {
        command: verification.command,
        exit_code: verification.exit_code,
        attached_at: new Date().toISOString(),
        axis: "delivery_verification",
      },
    });
  } finally {
    db.close();
  }
}

/**
 * Re-derive Delivery from StateDb evidence (+ optional MSO).
 * Without verification evidence → UNVERIFIED (even if kick/MSO look "ok").
 */
export function deriveDeliveryFromWorkspace(
  workspaceRoot: string,
  opts?: {
    work_id?: string;
    kick_started?: boolean;
    mso_state?: string;
    adapter_status?: string;
    message_pt?: string;
  },
): DeliveryEvidenceView {
  const workspace = resolve(workspaceRoot);
  const db = openDb(workspace);
  try {
    const contracts = db.listValidatedGoalContracts();
    const work_id =
      opts?.work_id ?? contracts[0]?.work_id ?? undefined;
    const mso_state =
      opts?.mso_state ?? latestMsoState(db, workspace);
    const evidence = work_id ? db.listEvidence(work_id) : [];
    const extracted = extractVerificationFromEvidence(evidence);
    const kick_started =
      opts?.kick_started ??
      (Boolean(mso_state) || contracts.length > 0 || Boolean(extracted));

    const status = deriveDeliveryStatus({
      kick_started,
      mso_state,
      adapter_status: opts?.adapter_status,
      message_pt: opts?.message_pt,
      verification: extracted?.verification,
    });

    const from_evidence = Boolean(extracted);
    const message_pt = from_evidence
      ? `Delivery ${status} a partir de evidência ${extracted!.evidence_id} (${extracted!.verification.command} exit ${extracted!.verification.exit_code}).`
      : `Delivery ${status} — sem evidência de verificação anexada (UNVERIFIED se processo terminou sem validar).`;

    const lines = [
      "Delivery (re-derivado)",
      `status: ${status}`,
      work_id ? `work_id: ${work_id}` : "work_id: —",
      mso_state ? `mso_state: ${mso_state}` : "mso_state: —",
      extracted
        ? `verification: ${extracted.verification.command} (exit ${extracted.verification.exit_code})`
        : "verification: — (nenhuma evidência)",
      extracted ? `evidence_id: ${extracted.evidence_id}` : "evidence_id: —",
      "Regra: adapter ok ≠ PASS; PASS só com verification exit 0.",
    ];

    return {
      workspace,
      work_id,
      status,
      verification: extracted?.verification,
      evidence_id: extracted?.evidence_id,
      kick_started,
      mso_state,
      from_evidence,
      message_pt,
      lines,
    };
  } finally {
    db.close();
  }
}

export interface ValidateDeliveryOpts {
  /** Explicit command string recorded as evidence. */
  command?: string;
  /** If set, skip spawn and attach this exit code. */
  exit_code?: number;
  /** Shell command to run (default: npm test when package.json exists, else true). */
  run?: string;
  work_id?: string;
  goal_contract_id?: string;
  /** When true, only re-derive — do not run or attach. */
  show_only?: boolean;
  timeout_ms?: number;
}

/**
 * Explicit "validar entrega": run (or accept) verification and attach evidence, then re-derive.
 */
export function validateDelivery(
  workspaceRoot: string,
  opts: ValidateDeliveryOpts = {},
): DeliveryEvidenceView {
  const workspace = resolve(workspaceRoot);

  if (opts.show_only) {
    return deriveDeliveryFromWorkspace(workspace, {
      work_id: opts.work_id,
    });
  }

  let verification: DeliveryVerification;

  if (
    typeof opts.exit_code === "number" &&
    (opts.command?.trim() || opts.run?.trim())
  ) {
    verification = {
      command: (opts.command ?? opts.run)!.trim(),
      exit_code: opts.exit_code,
    };
  } else {
    const cmd = (opts.run ?? opts.command ?? "npm test").trim();
    const timeout = opts.timeout_ms ?? 120_000;
    const r = spawnSync(cmd, {
      cwd: workspace,
      encoding: "utf-8",
      shell: true,
      timeout,
    });
    verification = {
      command: cmd,
      exit_code: typeof r.status === "number" ? r.status : 1,
    };
  }

  attachDeliveryVerification(workspace, verification, {
    work_id: opts.work_id,
    goal_contract_id: opts.goal_contract_id,
  });

  return deriveDeliveryFromWorkspace(workspace, {
    work_id: opts.work_id,
    kick_started: true,
  });
}
