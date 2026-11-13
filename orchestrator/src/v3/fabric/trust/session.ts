/**
 * Short-lived node session tokens — HMAC-SHA256 with CP secret (node:crypto).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SessionClaims {
  worker_node_id: string;
  token_id: string;
  issued_at: number;
  expires_at: number;
  control_plane_id: string;
}

export function createSessionToken(
  secret: Buffer,
  claims: Omit<SessionClaims, "token_id" | "issued_at"> & { token_id?: string; issued_at?: number },
): { token: string; claims: SessionClaims } {
  const full: SessionClaims = {
    worker_node_id: claims.worker_node_id,
    token_id: claims.token_id ?? randomBytes(16).toString("hex"),
    issued_at: claims.issued_at ?? Date.now(),
    expires_at: claims.expires_at,
    control_plane_id: claims.control_plane_id,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `${body}.${mac}`, claims: full };
}

export function verifySessionToken(
  secret: Buffer,
  token: string,
  nowMs = Date.now(),
): { ok: true; claims: SessionClaims } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed_token" };
  const [body, mac] = parts;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_mac" };
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    return { ok: false, reason: "bad_claims" };
  }
  if (claims.expires_at <= nowMs) return { ok: false, reason: "expired" };
  if (!claims.worker_node_id || !claims.token_id) return { ok: false, reason: "incomplete_claims" };
  return { ok: true, claims };
}

export function generateCpSecret(): Buffer {
  return randomBytes(32);
}
