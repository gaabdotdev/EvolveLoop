/**
 * V4.3 P0-2 + M5 — Attach / re-derive Delivery from real verification evidence.
 * Never maps adapter ok → PASS. Without evidence → UNVERIFIED.
 * External --exit-code attestation → ATTESTED, never PASS.
 * PASS só com provenance=local_execution e exit 0 de execução EvolveLoop.
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
  effectiveProvenance,
  normalizeDeliveryProvenance,
  type DeliveryEvidenceProvenance,
  type DeliveryStatus,
  type DeliveryVerification,
} from "./delivery-status.js";

export type { DeliveryVerification, DeliveryEvidenceProvenance };
export { effectiveProvenance, normalizeDeliveryProvenance };

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

function provenanceFromPayload(
  payload: Record<string, unknown>,
  rowStatus?: string,
): DeliveryEvidenceProvenance {
  // STALE row status ⇒ treat as stale provenance (ignore for PASS/ATTEST).
  // INVALID row status ≠ provenance "invalid": it often means exit≠0 / failed run.
  if (rowStatus === "STALE") return "stale";
  return normalizeDeliveryProvenance(
    payload.provenance ?? payload.evidence_provenance,
  );
}

function verificationFromPayload(
  payload: Record<string, unknown>,
  row?: EvidenceRecordRow,
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
  return {
    command: command.trim(),
    exit_code,
    provenance: provenanceFromPayload(payload, row?.status),
    executed_at:
      typeof payload.executed_at === "string"
        ? payload.executed_at
        : typeof payload.attached_at === "string"
          ? payload.attached_at
          : undefined,
    cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
    signal:
      payload.signal === null
        ? null
        : typeof payload.signal === "string"
          ? payload.signal
          : undefined,
    timed_out: payload.timed_out === true,
    attested_by:
      typeof payload.attested_by === "string" ? payload.attested_by : undefined,
    workspace:
      typeof payload.workspace === "string" ? payload.workspace : undefined,
    work_id:
      typeof payload.work_id === "string"
        ? payload.work_id
        : row?.work_id,
    task_id:
      typeof payload.task_id === "string"
        ? payload.task_id
        : row?.task_id,
    goal_contract_id:
      typeof payload.goal_contract_id === "string"
        ? payload.goal_contract_id
        : row?.goal_contract_id,
    goal_contract_version:
      typeof payload.goal_contract_version === "number"
        ? payload.goal_contract_version
        : row?.goal_contract_version,
  };
}

export interface EvidenceAssociationFilter {
  work_id?: string;
  task_id?: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  workspace?: string;
  require_provenance?: DeliveryEvidenceProvenance;
  /** When true, also accept rows whose payload omits workspace (legacy). */
  allow_missing_workspace?: boolean;
}

/**
 * True when evidence association axes match the requested scope.
 * Mismatched work / goal version / workspace → incompatible (ignore for PASS).
 */
export function evidenceAssociationCompatible(
  row: EvidenceRecordRow,
  verification: DeliveryVerification,
  opts?: EvidenceAssociationFilter,
): boolean {
  if (opts?.work_id && row.work_id !== opts.work_id) return false;
  if (opts?.work_id && verification.work_id && verification.work_id !== opts.work_id) {
    return false;
  }
  if (opts?.task_id) {
    const tid = row.task_id ?? verification.task_id;
    if (tid && tid !== opts.task_id) return false;
  }
  if (opts?.goal_contract_id) {
    const gid = row.goal_contract_id ?? verification.goal_contract_id;
    if (gid && gid !== opts.goal_contract_id) return false;
  }
  if (opts?.goal_contract_version != null) {
    const ver =
      row.goal_contract_version ?? verification.goal_contract_version;
    if (ver != null && ver !== opts.goal_contract_version) return false;
  }
  if (opts?.workspace) {
    const ws = verification.workspace;
    if (ws && resolve(ws) !== resolve(opts.workspace)) return false;
    if (!ws && opts.allow_missing_workspace === false) return false;
  }
  return true;
}

/**
 * Pick newest delivery_verification evidence compatible with this work/goal/workspace.
 * Ignores STALE status, stale/invalid provenance, and incompatible association for PASS.
 */
export function extractVerificationFromEvidence(
  rows: EvidenceRecordRow[],
  opts?: EvidenceAssociationFilter,
): { verification: DeliveryVerification; evidence_id: string } | undefined {
  const sorted = [...rows].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  );
  for (const row of sorted) {
    if (row.status === "STALE") continue;
    if (row.kind && row.kind !== EVIDENCE_KIND) continue;
    const fromKind = verificationFromPayload(row.payload, row);
    if (!fromKind) continue;
    const prov = effectiveProvenance(fromKind);
    // Skip corrupt / absent / stale provenance. Keep failed local runs (exit≠0).
    if (prov === "stale" || prov === "invalid" || prov === "absent") continue;
    if (!evidenceAssociationCompatible(row, fromKind, opts)) continue;
    if (
      opts?.require_provenance &&
      fromKind.provenance !== opts.require_provenance
    ) {
      continue;
    }
    return { verification: fromKind, evidence_id: row.evidence_id };
  }
  return undefined;
}

/**
 * Persist a verification result as evidence (gancho mínimo).
 * Does not invent PASS — caller still derives via deriveDeliveryStatus.
 * Never upgrades external_attestation to local_execution.
 */
export function attachDeliveryVerification(
  workspaceRoot: string,
  verification: DeliveryVerification,
  opts?: {
    work_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
    task_id?: string;
    evidence_id?: string;
  },
): EvidenceRecordRow {
  const workspace = resolve(workspaceRoot);
  const db = openDb(workspace);
  try {
    const work_id =
      opts?.work_id ??
      verification.work_id ??
      db.listValidatedGoalContracts()[0]?.work_id ??
      "work-delivery-unscoped";
    const goal_contract_id =
      opts?.goal_contract_id ??
      verification.goal_contract_id ??
      db.listValidatedGoalContracts()[0]?.goal_contract_id;
    const goal_contract_version =
      opts?.goal_contract_version ?? verification.goal_contract_version;
    const task_id = opts?.task_id ?? verification.task_id;
    const provenance = normalizeDeliveryProvenance(
      verification.provenance ?? "external_attestation",
    );
    // Never store typed-exit as local_execution.
    if (
      provenance === "local_execution" &&
      verification.attested_by &&
      !verification.executed_at
    ) {
      throw new Error(
        "refuse: cannot attach local_execution without EvolveLoop execution metadata",
      );
    }
    const status =
      provenance === "invalid"
        ? "INVALID"
        : provenance === "stale"
          ? "STALE"
          : verification.exit_code === 0 &&
              !verification.timed_out &&
              !verification.signal
            ? "VALID"
            : "INVALID";
    return db.upsertEvidenceRecord({
      evidence_id: opts?.evidence_id,
      work_id,
      task_id,
      goal_contract_id,
      goal_contract_version,
      status: status as "VALID" | "INVALID" | "STALE",
      kind: EVIDENCE_KIND,
      payload: {
        command: verification.command,
        exit_code: verification.exit_code,
        provenance,
        executed_at: verification.executed_at ?? new Date().toISOString(),
        cwd: verification.cwd ?? workspace,
        signal: verification.signal ?? null,
        timed_out: verification.timed_out === true,
        attested_by: verification.attested_by,
        workspace,
        work_id,
        task_id,
        goal_contract_id,
        goal_contract_version,
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
    goal_contract_id?: string;
    goal_contract_version?: number;
    task_id?: string;
  },
): DeliveryEvidenceView {
  const workspace = resolve(workspaceRoot);
  const db = openDb(workspace);
  try {
    const contracts = db.listValidatedGoalContracts();
    const work_id =
      opts?.work_id ?? contracts[0]?.work_id ?? undefined;
    const goal_contract_id =
      opts?.goal_contract_id ?? contracts[0]?.goal_contract_id;
    const goal_contract_version =
      opts?.goal_contract_version ?? contracts[0]?.version;
    const mso_state =
      opts?.mso_state ?? latestMsoState(db, workspace);
    const evidence = work_id ? db.listEvidence(work_id) : [];
    const extracted = extractVerificationFromEvidence(evidence, {
      work_id,
      goal_contract_id,
      goal_contract_version,
      task_id: opts?.task_id,
      workspace,
      allow_missing_workspace: true,
    });
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
    const prov = extracted?.verification
      ? effectiveProvenance(extracted.verification)
      : "absent";
    const message_pt = from_evidence
      ? `Delivery ${status} a partir de evidência ${extracted!.evidence_id} [${prov}] (${extracted!.verification.command} exit ${extracted!.verification.exit_code}).`
      : `Delivery ${status} — sem evidência de verificação anexada (UNVERIFIED se processo terminou sem validar).`;

    const lines = [
      "Delivery (re-derivado)",
      `status: ${status}`,
      work_id ? `work_id: ${work_id}` : "work_id: —",
      mso_state ? `mso_state: ${mso_state}` : "mso_state: —",
      extracted
        ? `verification: ${extracted.verification.command} (exit ${extracted.verification.exit_code}) provenance=${prov}`
        : "verification: — (nenhuma evidência) provenance=absent",
      extracted ? `evidence_id: ${extracted.evidence_id}` : "evidence_id: —",
      "Regra: PASS só com local_execution exit 0; --exit-code → ATTESTED; adapter ok ≠ PASS.",
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
  /**
   * External attestation exit code (does NOT run the command).
   * Produces ATTESTED at best — never PASS.
   */
  exit_code?: number;
  /** Shell command to run locally (EvolveLoop-spawned). */
  run?: string;
  work_id?: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  task_id?: string;
  /** When true, only re-derive — do not run or attach. */
  show_only?: boolean;
  timeout_ms?: number;
  /** Who supplied an external attestation (CLI user, CI, …). */
  attested_by?: string;
}

/**
 * Explicit "validar entrega": EvolveLoop runs (or accepts attestation) and attaches evidence.
 * Typed --exit-code never becomes local_execution / PASS.
 */
export function validateDelivery(
  workspaceRoot: string,
  opts: ValidateDeliveryOpts = {},
): DeliveryEvidenceView {
  const workspace = resolve(workspaceRoot);

  if (opts.show_only) {
    return deriveDeliveryFromWorkspace(workspace, {
      work_id: opts.work_id,
      goal_contract_id: opts.goal_contract_id,
      goal_contract_version: opts.goal_contract_version,
      task_id: opts.task_id,
    });
  }

  const hasCommand = Boolean(opts.run?.trim() || opts.command?.trim());
  if (!hasCommand) {
    // Missing command → absent evidence, never invent PASS / default npm test.
    return {
      ...deriveDeliveryFromWorkspace(workspace, {
        work_id: opts.work_id,
        goal_contract_id: opts.goal_contract_id,
        goal_contract_version: opts.goal_contract_version,
        task_id: opts.task_id,
        kick_started: true,
      }),
      from_evidence: false,
      message_pt:
        "Delivery UNVERIFIED — comando de verificação ausente (não anexar evidência).",
      lines: [
        "Delivery (validate)",
        "status: UNVERIFIED",
        "verification: — provenance=absent",
        "Regra: sem comando não há PASS nem ATTESTED.",
      ],
      status: "UNVERIFIED",
      verification: undefined,
      evidence_id: undefined,
    };
  }

  let verification: DeliveryVerification;

  if (typeof opts.exit_code === "number") {
    // External attestation — never classified as local_execution / PASS.
    verification = {
      command: (opts.command ?? opts.run)!.trim(),
      exit_code: opts.exit_code,
      provenance: "external_attestation",
      attested_by: opts.attested_by ?? "cli_user",
      executed_at: new Date().toISOString(),
      cwd: workspace,
      workspace,
      work_id: opts.work_id,
      task_id: opts.task_id,
      goal_contract_id: opts.goal_contract_id,
      goal_contract_version: opts.goal_contract_version,
    };
  } else {
    const cmd = (opts.run ?? opts.command)!.trim();
    const timeout = opts.timeout_ms ?? 120_000;
    const started = new Date().toISOString();
    const r = spawnSync(cmd, {
      cwd: workspace,
      encoding: "utf-8",
      shell: true,
      timeout,
    });
    const timed_out = Boolean(
      r.error &&
        typeof r.error === "object" &&
        "code" in r.error &&
        (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT",
    );
    let signal =
      typeof r.signal === "string"
        ? r.signal
        : r.signal != null
          ? String(r.signal)
          : null;
    // Missing binary / spawn failure → non-zero, never PASS.
    const exit_code = timed_out
      ? 124
      : typeof r.status === "number"
        ? r.status
        : r.error
          ? 127
          : signal
            ? 128
            : 1;
    // POSIX shells often report 128+N when the child dies by signal N (masking r.signal).
    if (
      !signal &&
      !timed_out &&
      typeof exit_code === "number" &&
      exit_code > 128 &&
      exit_code < 192
    ) {
      const n = exit_code - 128;
      const known: Record<number, string> = {
        2: "SIGINT",
        9: "SIGKILL",
        15: "SIGTERM",
      };
      signal = known[n] ?? `SIGNAL_${n}`;
    }
    verification = {
      command: cmd,
      exit_code,
      provenance: "local_execution",
      executed_at: started,
      cwd: workspace,
      signal,
      timed_out,
      workspace,
      work_id: opts.work_id,
      task_id: opts.task_id,
      goal_contract_id: opts.goal_contract_id,
      goal_contract_version: opts.goal_contract_version,
    };
  }

  attachDeliveryVerification(workspace, verification, {
    work_id: opts.work_id,
    goal_contract_id: opts.goal_contract_id,
    goal_contract_version: opts.goal_contract_version,
    task_id: opts.task_id,
  });

  return deriveDeliveryFromWorkspace(workspace, {
    work_id: opts.work_id,
    goal_contract_id: opts.goal_contract_id,
    goal_contract_version: opts.goal_contract_version,
    task_id: opts.task_id,
    kick_started: true,
  });
}
