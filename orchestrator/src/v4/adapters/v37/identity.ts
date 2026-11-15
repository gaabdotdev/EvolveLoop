/**
 * M10 handle-based signing (freeze R14). PEM never crosses this API, is never
 * logged, and is never persisted by callers. Isolation of executors from the
 * Control Plane data-dir remains M13 (OWNERSHIP-MAP dual owner R9: this file
 * only owns handle signing).
 */

import { createHash, randomBytes } from "node:crypto";
import { signPayload, verifyPayload } from "../../../v3/fabric/trust/identity.js";

export interface KeyHandle {
  readonly key_id: string;
}

export interface HandleSignaturePort {
  sign(handle: KeyHandle, payload: string): string;
  verify(public_key_spki_b64: string, payload: string, signature_b64: string): boolean;
}

/**
 * In-process vault. The frozen V37SignaturePort.sign(private_key_pem) shape is
 * intentionally *not* implemented here — M10 must not put PEM in caller memory
 * (R14).
 */
export class HandleSigningAdapter implements HandleSignaturePort {
  private readonly vault = new Map<string, { pem: string; public_key_spki_b64: string }>();

  register(material: { private_key_pem: string; public_key_spki_b64: string }): KeyHandle {
    const key_id = `k${createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 24)}`;
    this.vault.set(key_id, {
      pem: material.private_key_pem,
      public_key_spki_b64: material.public_key_spki_b64,
    });
    return { key_id };
  }

  sign(handle: KeyHandle, payload: string): string {
    const rec = this.vault.get(handle.key_id);
    if (!rec) throw new Error("UNKNOWN_KEY_HANDLE");
    return signPayload(rec.pem, payload);
  }

  verify(public_key_spki_b64: string, payload: string, signature_b64: string): boolean {
    return verifyPayload(public_key_spki_b64, payload, signature_b64);
  }

  publicKey(handle: KeyHandle): string | undefined {
    return this.vault.get(handle.key_id)?.public_key_spki_b64;
  }

  /** Forensic helper: PEM must never appear in serialized adapter state. */
  inspectForSecrets(): string[] {
    const json = JSON.stringify(this, (_k, v) => (typeof v === "string" && v.includes("BEGIN") ? "[redacted]" : v));
    const hits: string[] = [];
    if (/BEGIN [A-Z ]*PRIVATE KEY/.test(json)) hits.push("pem_in_json");
    return hits;
  }
}
