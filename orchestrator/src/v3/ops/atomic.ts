/**
 * Shared atomic JSON write helpers for Global Ops Plane.
 */

import { writeFileSync, renameSync } from "node:fs";

export function nowIso(): string {
  return new Date().toISOString();
}

export function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
}

export function atomicWriteJson(path: string, value: unknown): void {
  atomicWrite(path, JSON.stringify(value, null, 2));
}
