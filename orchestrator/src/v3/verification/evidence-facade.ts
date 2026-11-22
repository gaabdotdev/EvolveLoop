/**
 * V5-M06 — Unified Evidence provenance read API (REMED-M5 rules).
 * Facade over StateDb.listEvidence + delivery-verify extractors.
 * Exposes ignored stale / other-work / incompatible evidence explicitly.
 */

import { resolve } from "node:path";
import {
  effectiveProvenance,
  normalizeDeliveryProvenance,
  type DeliveryEvidenceProvenance,
  type DeliveryVerification,
} from "../../cli/tui/delivery-status.js";
import {
  evidenceAssociationCompatible,
  extractVerificationFromEvidence,
} from "../../cli/tui/delivery-verify.js";
import { StateDb, defaultStateDbPath } from "../state-db/store.js";
import type { EvidenceRecordRow } from "../state-db/types.js";
import type {
  EvidenceProvenanceView,
  IgnoredEvidenceEntry,
  IgnoredEvidenceReason,
  UnifiedEvidenceRead,
} from "./types.js";

const LIMITATIONS = [
  "Unified read only — does not rewrite Evidence dual JSON/SQLite stores",
  "PASS derivation remains deriveDeliveryStatus / getWorkDelivery (ADR-005)",
  "STALE / invalid / absent / other-work provenance never yield PASS (REMED-M5)",
];

function verificationFromRow(
  row: EvidenceRecordRow,
): DeliveryVerification | undefined {
  const payload = row.payload ?? {};
  const command =
    typeof payload.command === "string"
      ? payload.command
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
  const provenance: DeliveryEvidenceProvenance =
    row.status === "STALE"
      ? "stale"
      : normalizeDeliveryProvenance(
          payload.provenance ?? payload.evidence_provenance,
        );
  return {
    command: command.trim(),
    exit_code,
    provenance,
    executed_at:
      typeof payload.executed_at === "string" ? payload.executed_at : undefined,
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
      typeof payload.work_id === "string" ? payload.work_id : row.work_id,
    task_id:
      typeof payload.task_id === "string" ? payload.task_id : row.task_id,
    goal_contract_id:
      typeof payload.goal_contract_id === "string"
        ? payload.goal_contract_id
        : row.goal_contract_id,
    goal_contract_version:
      typeof payload.goal_contract_version === "number"
        ? payload.goal_contract_version
        : row.goal_contract_version,
  };
}

function toView(row: EvidenceRecordRow): EvidenceProvenanceView {
  const verification = verificationFromRow(row);
  const provenance = verification
    ? effectiveProvenance(verification)
    : row.status === "STALE"
      ? "stale"
      : row.status === "INVALID"
        ? "invalid"
        : "absent";
  return {
    kind: "EvidenceProvenanceView",
    work_id: row.work_id,
    evidence_id: row.evidence_id,
    status: row.status,
    evidence_kind: row.kind,
    provenance,
    verification,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function classifyIgnored(
  row: EvidenceRecordRow,
  opts: {
    work_id: string;
    workspace: string;
    task_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
    selected_evidence_id?: string;
  },
): IgnoredEvidenceEntry | undefined {
  if (opts.selected_evidence_id === row.evidence_id) return undefined;

  if (row.work_id !== opts.work_id) {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "other_work",
      detail: `row.work_id=${row.work_id} ≠ requested=${opts.work_id}`,
    };
  }

  if (row.status === "STALE") {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "stale_row",
    };
  }

  if (row.kind && row.kind !== "delivery_verification") {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "wrong_kind",
      detail: `kind=${row.kind}`,
    };
  }

  const verification = verificationFromRow(row);
  if (!verification) {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "unparseable",
    };
  }

  const prov = effectiveProvenance(verification);
  if (prov === "stale") {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "stale_provenance",
    };
  }
  if (prov === "invalid") {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "invalid_provenance",
    };
  }
  if (prov === "absent") {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "absent_provenance",
    };
  }

  if (
    !evidenceAssociationCompatible(row, verification, {
      work_id: opts.work_id,
      task_id: opts.task_id,
      goal_contract_id: opts.goal_contract_id,
      goal_contract_version: opts.goal_contract_version,
      workspace: opts.workspace,
      allow_missing_workspace: true,
    })
  ) {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "association_mismatch",
      detail: "work/goal/workspace association incompatible (REMED-M5)",
    };
  }

  // Compatible but not selected (newer sibling won) — still not used for PASS.
  if (opts.selected_evidence_id) {
    return {
      evidence_id: row.evidence_id,
      work_id: row.work_id,
      reason: "association_mismatch",
      detail: "superseded_by_newer_compatible_evidence",
    };
  }

  return undefined;
}

/**
 * List evidence that REMED-M5 would ignore for Delivery PASS derivation.
 * Exposes stale / other-work / association mismatches via the facade.
 */
export function listIgnoredEvidenceForWork(
  workspaceRoot: string,
  workId: string,
  opts?: {
    stateDbPath?: string;
    task_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
    /** Extra rows (e.g. other work) to classify as other_work. */
    extraRows?: EvidenceRecordRow[];
  },
): IgnoredEvidenceEntry[] {
  const workspace = resolve(workspaceRoot);
  const wid = workId.trim();
  const db = new StateDb(opts?.stateDbPath ?? defaultStateDbPath(workspace));
  try {
    const rows = [...db.listEvidence(wid), ...(opts?.extraRows ?? [])];
    const extracted = extractVerificationFromEvidence(
      rows.filter((r) => r.work_id === wid),
      {
        work_id: wid,
        task_id: opts?.task_id,
        goal_contract_id: opts?.goal_contract_id,
        goal_contract_version: opts?.goal_contract_version,
        workspace,
        allow_missing_workspace: true,
      },
    );
    const ignored: IgnoredEvidenceEntry[] = [];
    for (const row of rows) {
      const entry = classifyIgnored(row, {
        work_id: wid,
        workspace,
        task_id: opts?.task_id,
        goal_contract_id: opts?.goal_contract_id,
        goal_contract_version: opts?.goal_contract_version,
        selected_evidence_id: extracted?.evidence_id,
      });
      if (entry) ignored.push(entry);
    }
    return ignored;
  } finally {
    db.close();
  }
}

/**
 * Unified read of evidence + delivery verification provenance for a work.
 */
export function readWorkEvidenceProvenance(
  workspaceRoot: string,
  workId: string,
  opts?: {
    stateDbPath?: string;
    task_id?: string;
    goal_contract_id?: string;
    goal_contract_version?: number;
  },
): UnifiedEvidenceRead {
  const workspace = resolve(workspaceRoot);
  const wid = workId.trim();
  const db = new StateDb(opts?.stateDbPath ?? defaultStateDbPath(workspace));
  try {
    const rows = db.listEvidence(wid);
    const records = rows.map(toView);
    const extracted = extractVerificationFromEvidence(rows, {
      work_id: wid,
      task_id: opts?.task_id,
      goal_contract_id: opts?.goal_contract_id,
      goal_contract_version: opts?.goal_contract_version,
      workspace,
      allow_missing_workspace: true,
    });

    let delivery_verification: UnifiedEvidenceRead["delivery_verification"];
    if (extracted) {
      const row = rows.find((r) => r.evidence_id === extracted.evidence_id);
      if (
        row &&
        evidenceAssociationCompatible(row, extracted.verification, {
          work_id: wid,
          workspace,
          allow_missing_workspace: true,
        })
      ) {
        delivery_verification = {
          evidence_id: extracted.evidence_id,
          verification: extracted.verification,
          provenance: effectiveProvenance(extracted.verification),
        };
      }
    }

    const ignored: IgnoredEvidenceEntry[] = [];
    for (const row of rows) {
      const entry = classifyIgnored(row, {
        work_id: wid,
        workspace,
        task_id: opts?.task_id,
        goal_contract_id: opts?.goal_contract_id,
        goal_contract_version: opts?.goal_contract_version,
        selected_evidence_id: delivery_verification?.evidence_id,
      });
      if (entry) ignored.push(entry);
    }

    return {
      kind: "UnifiedEvidenceRead",
      work_id: wid,
      workspace,
      records,
      ignored,
      delivery_verification,
      limitations: [...LIMITATIONS],
      read_at: new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}

export type { IgnoredEvidenceReason };
