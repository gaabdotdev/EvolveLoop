/**
 * Durable filesystem primitives for the V4 Event Ledger (ADR-V4-0004).
 *
 * Durability class: fsync of the written file, atomic rename, best-effort
 * directory fsync. Incomplete tmp files are never treated as committed.
 * V4 modules other than adapters must not import v3/ops/atomic.ts.
 */

import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { assertPathSafeId, BoundaryIdError } from "./ids.js";

export const TMP_SUFFIX = ".tmp";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function resolveUnderRoot(root: string, ...segments: string[]): string {
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, ...segments);
  const rel = relative(rootResolved, candidate);
  if (rel.startsWith("..") || rel.includes(`..${sep}`) || resolve(candidate) === resolve(rel)) {
    throw new BoundaryIdError("refused_path_kind", segments.join("/"));
  }
  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) {
    throw new BoundaryIdError("refused_path_kind", candidate);
  }
  return candidate;
}

export function workPath(root: string, work_id: string, ...rest: string[]): string {
  assertPathSafeId("work", work_id);
  return resolveUnderRoot(root, "works", work_id, ...rest);
}

export function atomicWriteFsync(path: string, body: string | Uint8Array): void {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.${process.hrtime.bigint()}${TMP_SUFFIX}`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    if (typeof body === "string") writeSync(fd, body, undefined, "utf8");
    else writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  fsyncDir(dirname(path));
}

export function fsyncDir(dir: string): void {
  try {
    const dfd = openSync(dir, "r");
    try {
      fsyncSync(dfd);
    } finally {
      closeSync(dfd);
    }
  } catch {
    // Some filesystems refuse directory fsync; file fsync + rename still holds the V4.0 bar.
  }
}

export function discardTmpFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(TMP_SUFFIX)) continue;
    const p = join(dir, name);
    try {
      unlinkSync(p);
      removed.push(p);
    } catch {
      // leave it; next recovery will retry
    }
  }
  return removed;
}

export async function readJsonlLines(path: string, opts?: { maxLineBytes?: number }): Promise<string[]> {
  if (!existsSync(path)) return [];
  const max = opts?.maxLineBytes ?? 1024 * 1024;
  const lines: string[] = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    if (Buffer.byteLength(line, "utf8") > max) {
      throw new Error(`jsonl_line_too_large:${path}`);
    }
    lines.push(line);
  }
  // A file that does not end with a newline may contain a truncated last record.
  // createInterface already yields that last partial line; callers that rewrite
  // via atomic rename never persist a truncated commit. Recovery of a torn
  // historic append (legacy) drops a last line that fails JSON.parse.
  return lines;
}

export function parseJsonlRecords<T>(lines: string[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      if (i === lines.length - 1) break; // torn last record
      throw new Error("jsonl_corrupt_mid_stream");
    }
  }
  return out;
}

