/**
 * Fabric Control Plane CA + worker client certificate lifecycle (mTLS).
 * Lab/dev materials use openssl; production serve path requires persistent CA.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fingerprintPemCert } from "../protocol/server.js";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";

export interface FabricCaMaterials {
  caCertPem: Buffer;
  caKeyPem: Buffer;
  caFingerprint: string;
}

export interface IssuedCert {
  certPem: Buffer;
  keyPem: Buffer;
  fingerprint: string;
  serial: string;
  subject_cn: string;
  not_after: string;
}

export interface RevocationEntry {
  serial: string;
  subject_cn: string;
  fingerprint: string;
  revoked_at: string;
  reason: string;
}

function openssl(args: string[], opts?: { cwd?: string; input?: string }): Buffer {
  return execFileSync("openssl", args, {
    cwd: opts?.cwd,
    input: opts?.input,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "buffer",
  }) as Buffer;
}

export function caDir(fabricRoot: string): string {
  return join(fabricRoot, "ca");
}

export function ensureFabricCa(fabricRoot: string, cn = "evolveloop-fabric-ca"): FabricCaMaterials {
  const dir = caDir(fabricRoot);
  mkdirSync(dir, { recursive: true });
  const caCertPath = join(dir, "ca-cert.pem");
  const caKeyPath = join(dir, "ca-key.pem");
  const metaPath = join(dir, "ca-meta.json");
  if (existsSync(caCertPath) && existsSync(caKeyPath)) {
    const caCertPem = readFileSync(caCertPath);
    const caKeyPem = readFileSync(caKeyPath);
    return {
      caCertPem,
      caKeyPem,
      caFingerprint: fingerprintPemCert(caCertPem),
    };
  }
  openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-keyout",
    caKeyPath,
    "-out",
    caCertPath,
    "-days",
    "3650",
    "-nodes",
    "-subj",
    `/CN=${cn}/O=EvolveLoop Fabric`,
  ]);
  chmodSync(caKeyPath, 0o600);
  const caCertPem = readFileSync(caCertPath);
  const caKeyPem = readFileSync(caKeyPath);
  const caFingerprint = fingerprintPemCert(caCertPem);
  atomicWriteJson(metaPath, {
    kind: "FabricCaMeta",
    cn,
    fingerprint: caFingerprint,
    created_at: nowIso(),
  });
  mkdirSync(join(dir, "crl"), { recursive: true });
  mkdirSync(join(dir, "issued"), { recursive: true });
  return { caCertPem, caKeyPem, caFingerprint };
}

export function issueSignedCert(
  fabricRoot: string,
  subjectCn: string,
  opts?: { days?: number; kind?: "server" | "client" },
): IssuedCert {
  ensureFabricCa(fabricRoot);
  const dir = caDir(fabricRoot);
  const issuedDir = join(dir, "issued");
  mkdirSync(issuedDir, { recursive: true });
  const safe = subjectCn.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const keyPath = join(issuedDir, `${safe}.key.pem`);
  const csrPath = join(issuedDir, `${safe}.csr.pem`);
  const certPath = join(issuedDir, `${safe}.cert.pem`);
  const days = String(opts?.days ?? 30);
  const serial = randomBytes(8).toString("hex");
  const serialPath = join(issuedDir, `${safe}.serial`);
  writeFileSync(serialPath, serial, { mode: 0o600 });

  openssl([
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    csrPath,
    "-nodes",
    "-subj",
    `/CN=${subjectCn}/O=EvolveLoop Fabric`,
  ]);
  chmodSync(keyPath, 0o600);

  const extFile = join(issuedDir, `${safe}.ext`);
  const isClient = (opts?.kind ?? "client") === "client";
  writeFileSync(
    extFile,
    [
      "basicConstraints=CA:FALSE",
      "keyUsage=digitalSignature,keyEncipherment",
      isClient
        ? "extendedKeyUsage=clientAuth"
        : "extendedKeyUsage=serverAuth",
      `subjectAltName=DNS:${subjectCn},DNS:localhost,IP:127.0.0.1`,
    ].join("\n"),
  );

  openssl([
    "x509",
    "-req",
    "-in",
    csrPath,
    "-CA",
    join(dir, "ca-cert.pem"),
    "-CAkey",
    join(dir, "ca-key.pem"),
    "-out",
    certPath,
    "-days",
    days,
    "-set_serial",
    `0x${serial}`,
    "-extfile",
    extFile,
  ]);

  const certPem = readFileSync(certPath);
  const keyPem = readFileSync(keyPath);
  const fingerprint = fingerprintPemCert(certPem);
  const notAfter = openssl(["x509", "-in", certPath, "-noout", "-enddate"])
    .toString("utf8")
    .replace(/^notAfter=/, "")
    .trim();
  atomicWriteJson(join(issuedDir, `${safe}.meta.json`), {
    subject_cn: subjectCn,
    serial,
    fingerprint,
    kind: opts?.kind ?? "client",
    not_after: notAfter,
    issued_at: nowIso(),
    revoked: false,
  });
  return {
    certPem,
    keyPem,
    fingerprint,
    serial,
    subject_cn: subjectCn,
    not_after: notAfter,
  };
}

export function revokeCertificate(
  fabricRoot: string,
  subjectCn: string,
  reason: string,
): RevocationEntry {
  const dir = caDir(fabricRoot);
  const safe = subjectCn.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const metaPath = join(dir, "issued", `${safe}.meta.json`);
  if (!existsSync(metaPath)) {
    throw new Error(`cert_not_found:${subjectCn}`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    subject_cn: string;
    serial: string;
    fingerprint: string;
    revoked?: boolean;
  };
  const entry: RevocationEntry = {
    serial: meta.serial,
    subject_cn: meta.subject_cn,
    fingerprint: meta.fingerprint,
    revoked_at: nowIso(),
    reason,
  };
  atomicWriteJson(metaPath, { ...meta, revoked: true, revocation: entry });
  atomicWriteJson(join(dir, "crl", `${meta.serial}.json`), entry);
  return entry;
}

export function isCertificateRevoked(fabricRoot: string, fingerprintOrSerial: string): boolean {
  const dir = join(caDir(fabricRoot), "crl");
  if (!existsSync(dir)) return false;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const e = JSON.parse(readFileSync(join(dir, f), "utf8")) as RevocationEntry;
    if (e.serial === fingerprintOrSerial || e.fingerprint === fingerprintOrSerial) return true;
  }
  const issuedDir = join(caDir(fabricRoot), "issued");
  if (!existsSync(issuedDir)) return false;
  for (const f of readdirSync(issuedDir)) {
    if (!f.endsWith(".meta.json")) continue;
    const meta = JSON.parse(readFileSync(join(issuedDir, f), "utf8")) as {
      fingerprint: string;
      serial: string;
      revoked?: boolean;
    };
    if (
      meta.revoked &&
      (meta.fingerprint === fingerprintOrSerial || meta.serial === fingerprintOrSerial)
    ) {
      return true;
    }
  }
  return false;
}

export function extractPeerIdentity(cert: {
  subject?: unknown;
  fingerprint256?: string;
  raw?: Buffer;
  valid_to?: string;
}): { cn: string | undefined; fingerprint: string | undefined; valid_to?: string } {
  let cn: string | undefined;
  const subject = cert.subject;
  if (subject && typeof subject === "object") {
    const s = subject as Record<string, string>;
    cn = s.CN ?? s.cn;
  } else if (typeof subject === "string") {
    const m = /CN=([^/]+)/.exec(subject);
    cn = m?.[1];
  }
  let fingerprint: string | undefined = cert.fingerprint256?.replace(/:/g, "").toLowerCase();
  if (!fingerprint && cert.raw) {
    fingerprint = createHash("sha256").update(cert.raw).digest("hex");
  }
  return { cn, fingerprint, valid_to: cert.valid_to };
}

export function assertPeerMatchesWorker(
  fabricRoot: string,
  peer: { cn?: string; fingerprint?: string },
  expectedWorkerNodeId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!peer.cn) return { ok: false, reason: "missing_peer_cn" };
  if (peer.cn !== expectedWorkerNodeId) {
    return { ok: false, reason: `identity_mismatch:cn=${peer.cn}:expected=${expectedWorkerNodeId}` };
  }
  if (!peer.fingerprint) return { ok: false, reason: "missing_peer_fingerprint" };
  if (isCertificateRevoked(fabricRoot, peer.fingerprint)) {
    return { ok: false, reason: "cert_revoked" };
  }
  return { ok: true };
}
