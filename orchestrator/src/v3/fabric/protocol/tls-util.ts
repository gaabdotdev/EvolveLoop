/**
 * Dev/test TLS materials via openssl (no custom crypto).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintPemCert } from "./server.js";

export function generateDevTlsMaterials(cn = "evolveloop-cp"): {
  key: Buffer;
  cert: Buffer;
  fingerprint: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "el-tls-"));
  try {
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "2",
        "-nodes",
        "-subj",
        `/CN=${cn}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const key = readFileSync(keyPath);
    const cert = readFileSync(certPath);
    return { key, cert, fingerprint: fingerprintPemCert(cert) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
