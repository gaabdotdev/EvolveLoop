/**
 * Honest Delivery status derivation (V4.1 P0-5 / ADR Q1 + M5 provenance).
 * Never default PASS without local verified execution evidence.
 */

export type DeliveryStatus =
  | "PASS"
  | "ATTESTED"
  | "BLOCKED"
  | "FAILED"
  | "UNVERIFIED";

/**
 * Provenance of a verification record — never conflate attestation with local run.
 * Explicit model (REMED-M5 §5.1): local_execution | external_attestation | absent | invalid | stale.
 */
export type DeliveryEvidenceProvenance =
  | "local_execution"
  | "external_attestation"
  | "absent"
  | "invalid"
  | "stale";

export interface DeliveryVerification {
  command: string;
  exit_code: number;
  /** Absent/legacy → treated as external_attestation (cannot yield PASS). */
  provenance?: DeliveryEvidenceProvenance;
  /** Wall-clock when the EvolveLoop runner finished (local only). */
  executed_at?: string;
  cwd?: string;
  signal?: string | null;
  timed_out?: boolean;
  attested_by?: string;
  /** Association axes — ignore cross-workspace / wrong work / wrong goal version. */
  workspace?: string;
  work_id?: string;
  task_id?: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
}

/**
 * Normalize raw provenance tokens (incl. legacy "missing") into the §5.1 model.
 */
export function normalizeDeliveryProvenance(
  raw: unknown,
): DeliveryEvidenceProvenance {
  if (raw === "local_execution") return "local_execution";
  if (raw === "external_attestation") return "external_attestation";
  if (raw === "stale") return "stale";
  if (raw === "invalid") return "invalid";
  if (raw === "absent" || raw === "missing") return "absent";
  // Legacy rows without provenance: external attestation (fail-closed for PASS).
  if (raw === undefined || raw === null || raw === "") {
    return "external_attestation";
  }
  return "invalid";
}

export function effectiveProvenance(
  verification?: DeliveryVerification | null,
): DeliveryEvidenceProvenance {
  if (!verification) return "absent";
  if (verification.provenance === undefined || verification.provenance === null) {
    return "external_attestation";
  }
  return normalizeDeliveryProvenance(verification.provenance);
}

export interface DeliveryDerivationInput {
  kick_started: boolean;
  mso_state?: string;
  adapter_status?: string;
  message_pt?: string;
  verification?: DeliveryVerification;
}

function looksBlocked(input: DeliveryDerivationInput): boolean {
  if (input.mso_state === "BLOCKED") return true;
  if (input.message_pt?.toLowerCase().includes("bloqueada")) return true;
  return false;
}

function adapterFailed(input: DeliveryDerivationInput): boolean {
  return Boolean(
    input.adapter_status && /fail|error/i.test(input.adapter_status),
  );
}

function verificationExecutionFailed(
  verification?: DeliveryVerification,
): boolean {
  if (!verification) return false;
  if (verification.timed_out) return true;
  if (verification.signal) return true;
  if (typeof verification.exit_code === "number" && verification.exit_code !== 0) {
    return true;
  }
  return false;
}

function isLocalPass(verification?: DeliveryVerification): boolean {
  return Boolean(
    verification &&
      effectiveProvenance(verification) === "local_execution" &&
      verification.command.trim() &&
      verification.exit_code === 0 &&
      !verification.timed_out &&
      !verification.signal,
  );
}

function isExternalAttestationOk(
  verification?: DeliveryVerification,
): boolean {
  return Boolean(
    verification &&
      effectiveProvenance(verification) === "external_attestation" &&
      verification.command.trim() &&
      verification.exit_code === 0 &&
      !verification.timed_out &&
      !verification.signal,
  );
}

/**
 * Derive Delivery presentation status.
 * PASS only with local_execution exit 0 (EvolveLoop-executed).
 * external_attestation exit 0 → ATTESTED (never PASS).
 * absent / stale → UNVERIFIED; invalid → FAILED; exit≠0 / timeout / signal → FAILED.
 */
export function deriveDeliveryStatus(
  input: DeliveryDerivationInput,
): DeliveryStatus {
  if (looksBlocked(input)) return "BLOCKED";
  if (!input.kick_started) return "BLOCKED";
  if (adapterFailed(input)) return "FAILED";

  const prov = effectiveProvenance(input.verification);

  // Stale / absent: ignore for PASS/ATTEST (do not treat as verified failure either).
  if (prov === "stale" || prov === "absent") {
    return "UNVERIFIED";
  }

  if (prov === "invalid") return "FAILED";

  if (verificationExecutionFailed(input.verification)) return "FAILED";

  if (isLocalPass(input.verification)) return "PASS";
  if (isExternalAttestationOk(input.verification)) return "ATTESTED";

  // TRUE-FULL-PASS without attached local verification still cannot claim Delivery PASS.
  if (input.mso_state === "TRUE-FULL-PASS") {
    return "UNVERIFIED";
  }

  return "UNVERIFIED";
}

export function deliveryStatusTitle(status: DeliveryStatus): string {
  switch (status) {
    case "PASS":
      return "Entrega aceita (execução local verificada)";
    case "ATTESTED":
      return "Atestado externo — não é PASS verificado";
    case "UNVERIFIED":
      return "Processo terminou · objetivo não validado";
    case "BLOCKED":
      return "Entrega bloqueada";
    case "FAILED":
      return "Entrega falhou";
  }
}

export function deliveryStatusColor(
  status: DeliveryStatus,
): "green" | "yellow" | "red" | "cyan" | "magenta" {
  switch (status) {
    case "PASS":
      return "green";
    case "ATTESTED":
      return "magenta";
    case "UNVERIFIED":
      return "cyan";
    case "BLOCKED":
      return "yellow";
    case "FAILED":
      return "red";
  }
}
