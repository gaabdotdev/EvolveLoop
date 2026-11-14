/**
 * Worker Node cryptographic identity — Ed25519 via node:crypto (no DIY crypto).
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import type { WorkerNodeIdentity } from "../types.js";

export interface NodeKeyMaterial {
  worker_node_id: string;
  private_key_pem: string;
  public_key_spki_b64: string;
  created_at: string;
}

export function generateNodeIdentity(existingId?: string): NodeKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const private_key_pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const public_key_spki_b64 = spki.toString("base64");
  const worker_node_id = existingId ?? `wn_${randomUUID()}`;
  return {
    worker_node_id,
    private_key_pem,
    public_key_spki_b64,
    created_at: new Date().toISOString(),
  };
}

export function toIdentityRecord(km: NodeKeyMaterial): WorkerNodeIdentity {
  return {
    worker_node_id: km.worker_node_id,
    public_key_spki_b64: km.public_key_spki_b64,
    key_alg: "Ed25519",
    created_at: km.created_at,
  };
}

export function signPayload(privateKeyPem: string, payload: string | Buffer): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8"), key);
  return sig.toString("base64");
}

export function verifyPayload(publicKeySpkiB64: string, payload: string | Buffer, signatureB64: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeySpkiB64, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8"),
      key,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}
