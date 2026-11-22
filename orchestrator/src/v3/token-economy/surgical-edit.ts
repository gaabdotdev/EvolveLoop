/**
 * V1-TOK-11 — Surgical edit by line / AST id.
 *
 * REPLACE / DELETE inclusive line ranges with hash (and optional byte-offset)
 * validation. Rejects mismatches instead of silently applying misaligned edits.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveConfinedPath } from "./context-slicing.js";

export type SurgicalOp = "REPLACE" | "DELETE";

export interface SurgicalEditSpec {
  op: SurgicalOp;
  /** Inclusive, 1-indexed. */
  start: number;
  /** Inclusive, 1-indexed. */
  end: number;
  /** Required for REPLACE — replacement text (may be multi-line). */
  content?: string;
  /** SHA-256 hex of the UTF-8 bytes of the current start..end line range. */
  expectedHash?: string;
  /** Optional absolute byte offset where the range must begin in the file. */
  expectedOffset?: number;
}

export type SurgicalEditErrorCode =
  | "NOT_FOUND"
  | "BAD_RANGE"
  | "HASH_MISMATCH"
  | "OFFSET_MISMATCH"
  | "MISSING_CONTENT"
  | "PATH_ESCAPE"
  | "UNSUPPORTED_OP";

export interface SurgicalEditResult {
  ok: boolean;
  op: SurgicalOp;
  path: string;
  absolute_path: string;
  start: number;
  end: number;
  /** Hash of the range before mutation (when applicable). */
  previous_hash: string | null;
  /** Hash of the written range after REPLACE (null for DELETE). */
  new_hash: string | null;
  lines_removed: number;
  lines_inserted: number;
  error?: string;
  error_code?: SurgicalEditErrorCode;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function splitLines(source: string): string[] {
  if (source.length === 0) return [];
  const lines = source.split(/\r?\n/);
  // Preserve "file ends with newline" semantics: trailing empty from final \n
  // is a blank last line only when content had a trailing newline and more content.
  if (source.endsWith("\n") && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function joinLines(lines: string[]): string {
  if (lines.length === 0) return "";
  return lines.join("\n") + "\n";
}

function rangeText(lines: string[], start: number, end: number): string {
  return lines.slice(start - 1, end).join("\n");
}

function byteOffsetOfLine(source: string, line1: number): number {
  if (line1 <= 1) return 0;
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      if (line === line1) return i + 1;
    }
  }
  return -1;
}

function fail(
  path: string,
  abs: string,
  spec: SurgicalEditSpec,
  code: SurgicalEditErrorCode,
  message: string,
  previous_hash: string | null = null,
): SurgicalEditResult {
  return {
    ok: false,
    op: spec.op,
    path,
    absolute_path: abs,
    start: spec.start,
    end: spec.end,
    previous_hash,
    new_hash: null,
    lines_removed: 0,
    lines_inserted: 0,
    error: message,
    error_code: code,
  };
}

/**
 * Apply REPLACE/DELETE on a workspace-confined file with hash/offset checks.
 *
 * @param file - Absolute path, or workspace-relative when workspaceRoot is set.
 * @param spec - Surgical edit specification.
 * @param workspaceRoot - When set, confine path under this root.
 */
export function applySurgicalEdit(
  file: string,
  spec: SurgicalEditSpec,
  workspaceRoot?: string,
): SurgicalEditResult {
  if (spec.op !== "REPLACE" && spec.op !== "DELETE") {
    return fail(file, file, spec, "UNSUPPORTED_OP", `unsupported op: ${String(spec.op)}`);
  }

  let abs: string;
  let pathOut: string;
  try {
    if (workspaceRoot) {
      abs = resolveConfinedPath(workspaceRoot, file);
      pathOut = file;
    } else {
      abs = resolve(file);
      pathOut = abs;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(file, file, spec, "PATH_ESCAPE", msg);
  }

  if (!existsSync(abs)) {
    return fail(pathOut, abs, spec, "NOT_FOUND", `file not found: ${abs}`);
  }

  const source = readFileSync(abs, "utf-8");
  const lines = splitLines(source);
  const { start, end } = spec;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return fail(pathOut, abs, spec, "BAD_RANGE", `invalid range ${start}-${end}`);
  }
  if (end > lines.length) {
    return fail(
      pathOut,
      abs,
      spec,
      "BAD_RANGE",
      `end ${end} beyond EOF (${lines.length} lines)`,
    );
  }

  const previous = rangeText(lines, start, end);
  const previous_hash = sha256Hex(previous);

  if (spec.expectedHash != null && spec.expectedHash !== previous_hash) {
    return fail(
      pathOut,
      abs,
      spec,
      "HASH_MISMATCH",
      `expectedHash mismatch: expected ${spec.expectedHash}, got ${previous_hash}`,
      previous_hash,
    );
  }

  if (spec.expectedOffset != null) {
    const actualOffset = byteOffsetOfLine(source, start);
    if (actualOffset !== spec.expectedOffset) {
      return fail(
        pathOut,
        abs,
        spec,
        "OFFSET_MISMATCH",
        `expectedOffset mismatch: expected ${spec.expectedOffset}, got ${actualOffset}`,
        previous_hash,
      );
    }
  }

  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const removed = end - start + 1;

  if (spec.op === "DELETE") {
    const next = [...before, ...after];
    writeFileSync(abs, joinLines(next), "utf-8");
    return {
      ok: true,
      op: "DELETE",
      path: pathOut,
      absolute_path: abs,
      start,
      end,
      previous_hash,
      new_hash: null,
      lines_removed: removed,
      lines_inserted: 0,
    };
  }

  // REPLACE
  if (spec.content == null) {
    return fail(
      pathOut,
      abs,
      spec,
      "MISSING_CONTENT",
      "REPLACE requires content",
      previous_hash,
    );
  }

  // "" → empty replacement (range removed). Otherwise split lines; trailing \n does not add a blank.
  const replLines =
    spec.content === ""
      ? []
      : (() => {
          const parts = spec.content.split(/\r?\n/);
          if (spec.content.endsWith("\n") && parts[parts.length - 1] === "") parts.pop();
          return parts;
        })();

  const next = [...before, ...replLines, ...after];
  writeFileSync(abs, joinLines(next), "utf-8");
  const new_hash = sha256Hex(replLines.join("\n"));

  return {
    ok: true,
    op: "REPLACE",
    path: pathOut,
    absolute_path: abs,
    start,
    end,
    previous_hash,
    new_hash,
    lines_removed: removed,
    lines_inserted: replLines.length,
  };
}

/** Compute range hash for callers that want to pass expectedHash. */
export function hashLineRange(fileContent: string, start: number, end: number): string {
  const lines = splitLines(fileContent);
  return sha256Hex(rangeText(lines, start, end));
}
