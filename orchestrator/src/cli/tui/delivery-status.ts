/**
 * Honest Delivery status derivation (V4.1 P0-5 / ADR Q1).
 * Never default PASS without verification evidence.
 */

export type DeliveryStatus = "PASS" | "BLOCKED" | "FAILED" | "UNVERIFIED";

export interface DeliveryDerivationInput {
  kick_started: boolean;
  mso_state?: string;
  adapter_status?: string;
  message_pt?: string;
  verification?: { command: string; exit_code: number };
}

function looksBlocked(input: DeliveryDerivationInput): boolean {
  if (input.mso_state === "BLOCKED") return true;
  if (input.message_pt?.toLowerCase().includes("bloqueada")) return true;
  return false;
}

function looksFailed(input: DeliveryDerivationInput): boolean {
  if (input.adapter_status && /fail|error/i.test(input.adapter_status)) {
    return true;
  }
  if (
    input.verification &&
    typeof input.verification.exit_code === "number" &&
    input.verification.exit_code !== 0
  ) {
    return true;
  }
  return false;
}

function hasPassingVerification(
  verification?: { command: string; exit_code: number },
): boolean {
  return Boolean(
    verification &&
      verification.command.trim() &&
      verification.exit_code === 0,
  );
}

/**
 * Derive Delivery presentation status.
 * PASS only with real verification (or TRUE-FULL-PASS + verification).
 * Kick started without verification → UNVERIFIED (process ended ≠ objective validated).
 */
export function deriveDeliveryStatus(
  input: DeliveryDerivationInput,
): DeliveryStatus {
  if (looksBlocked(input)) return "BLOCKED";
  if (!input.kick_started) return "BLOCKED";
  if (looksFailed(input)) return "FAILED";

  const verified = hasPassingVerification(input.verification);
  if (verified) return "PASS";

  // TRUE-FULL-PASS without attached verification still cannot claim Delivery PASS.
  if (input.mso_state === "TRUE-FULL-PASS" && !verified) {
    return "UNVERIFIED";
  }

  return "UNVERIFIED";
}

export function deliveryStatusTitle(status: DeliveryStatus): string {
  switch (status) {
    case "PASS":
      return "Entrega aceita";
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
): "green" | "yellow" | "red" | "cyan" {
  switch (status) {
    case "PASS":
      return "green";
    case "UNVERIFIED":
      return "cyan";
    case "BLOCKED":
      return "yellow";
    case "FAILED":
      return "red";
  }
}
