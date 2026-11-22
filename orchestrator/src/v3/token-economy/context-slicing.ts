/**
 * V1-TOK-01 — Context slicing for agent file reads.
 *
 * Agents MUST NOT use unrestricted full-file reads.
 * Use outlineFile (structure + line map) then readLines (≤80 lines).
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathEscapesWorkspace } from "../../authority/capability-authority.js";

/** Hard cap on lines returned by a single readLines call. */
export const READ_LINES_HARD_CAP = 80;

export type OversizedRangePolicy = "reject" | "truncate";

export type OutlineKind =
  | "function"
  | "class"
  | "method"
  | "const"
  | "interface"
  | "type"
  | "heading"
  | "export"
  | "other";

export interface OutlineEntry {
  kind: OutlineKind;
  name: string;
  /** Inclusive, 1-indexed. */
  start_line: number;
  /** Inclusive, 1-indexed. */
  end_line: number;
  signature: string;
}

export interface OutlineFileResult {
  kind: "OutlineFileResult";
  path: string;
  absolute_path: string;
  total_lines: number;
  entries: OutlineEntry[];
}

export interface ReadLinesResult {
  kind: "ReadLinesResult";
  path: string;
  absolute_path: string;
  /** Inclusive, 1-indexed (effective after clamp/truncate). */
  start_line: number;
  /** Inclusive, 1-indexed (effective after clamp/truncate). */
  end_line: number;
  lines: string[];
  /** True when range was shortened to HARD_CAP under truncate policy. */
  truncated: boolean;
  /** True when call was refused (oversized reject, escape, missing, bad range). */
  rejected: boolean;
  error?: string;
  error_code?: ContextSlicingErrorCode;
}

export type ContextSlicingErrorCode =
  | "PATH_ESCAPE"
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "BAD_RANGE"
  | "RANGE_EXCEEDS_CAP"
  | "UNRESTRICTED_READ_DENIED";

export class ContextSlicingError extends Error {
  constructor(
    readonly code: ContextSlicingErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ContextSlicingError";
  }
}

export interface ContextSlicingOptions {
  /** Default: reject. Truncate returns ≤80 lines and sets truncated=true. */
  on_oversized?: OversizedRangePolicy;
}

export interface AgentFileTools {
  outlineFile: (path: string) => OutlineFileResult;
  readLines: (path: string, start: number, end: number) => ReadLinesResult;
  /** Intentionally absent: agents must not get unrestricted readFile. */
}

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolve path under workspace; throw PATH_ESCAPE / NOT_FOUND / NOT_A_FILE.
 */
export function resolveConfinedPath(workspaceRoot: string, filePath: string): string {
  const rootResolved = resolve(workspaceRoot);
  const rootReal = safeRealpath(rootResolved) ?? rootResolved;

  if (pathEscapesWorkspace(filePath, rootReal)) {
    throw new ContextSlicingError("PATH_ESCAPE", `path escapes workspace: ${filePath}`);
  }

  const abs = resolve(rootReal, filePath);
  if (pathEscapesWorkspace(abs, rootReal)) {
    throw new ContextSlicingError("PATH_ESCAPE", `path escapes workspace: ${filePath}`);
  }

  if (!existsSync(abs)) {
    throw new ContextSlicingError("NOT_FOUND", `file not found: ${filePath}`);
  }

  const real = safeRealpath(abs);
  if (!real || pathEscapesWorkspace(real, rootReal)) {
    throw new ContextSlicingError("PATH_ESCAPE", `realpath escapes workspace: ${filePath}`);
  }

  const st = statSync(real);
  if (!st.isFile()) {
    throw new ContextSlicingError("NOT_A_FILE", `not a file: ${filePath}`);
  }

  return real;
}

function relDisplay(workspaceRoot: string, abs: string): string {
  const rootReal = safeRealpath(resolve(workspaceRoot)) ?? resolve(workspaceRoot);
  const rel = relative(rootReal, abs);
  return rel && !rel.startsWith("..") ? rel.split(sep).join("/") : abs;
}

function readAllLines(abs: string): string[] {
  const text = readFileSync(abs, "utf-8");
  if (text.length === 0) return [];
  // Preserve trailing empty line semantics of split; drop final empty if file ends with \n
  const parts = text.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "" && text.endsWith("\n")) {
    parts.pop();
  }
  return parts;
}

interface OutlineMatch {
  kind: OutlineKind;
  name: string;
  signature: string;
  indent: number;
}

const OUTLINE_RULES: Array<{
  kind: OutlineKind;
  re: RegExp;
  nameGroup: number;
}> = [
  { kind: "heading", re: /^(#{1,6})\s+(.+?)\s*$/, nameGroup: 2 },
  { kind: "class", re: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, nameGroup: 1 },
  { kind: "interface", re: /^(?:export\s+)?interface\s+(\w+)/, nameGroup: 1 },
  { kind: "type", re: /^(?:export\s+)?type\s+(\w+)\s*=/, nameGroup: 1 },
  { kind: "function", re: /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/, nameGroup: 1 },
  {
    kind: "const",
    re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/,
    nameGroup: 1,
  },
  { kind: "function", re: /^(?:async\s+)?def\s+(\w+)\s*\(/, nameGroup: 1 },
  { kind: "class", re: /^class\s+(\w+)\s*[:(]/, nameGroup: 1 },
  { kind: "export", re: /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\b/, nameGroup: 0 },
  { kind: "method", re: /^(\s+)(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)\s*\([^;]*\)\s*[:{]/, nameGroup: 2 },
];

function matchOutlineLine(line: string): OutlineMatch | null {
  const trimmedRight = line.replace(/\s+$/, "");
  if (!trimmedRight.trim() || trimmedRight.trimStart().startsWith("//") || trimmedRight.trimStart().startsWith("*")) {
    return null;
  }
  for (const rule of OUTLINE_RULES) {
    const m = trimmedRight.match(rule.re);
    if (!m) continue;
    const name =
      rule.nameGroup === 0
        ? trimmedRight.trim().slice(0, 80)
        : (m[rule.nameGroup] ?? trimmedRight.trim()).slice(0, 120);
    if (rule.kind === "method" && /^(if|for|while|switch|catch|return|else)$/.test(name)) {
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    return {
      kind: rule.kind,
      name,
      signature: trimmedRight.trim().slice(0, 200),
      indent,
    };
  }
  return null;
}

/**
 * Build structural outline: signatures + line ranges (not full body).
 */
export function outlineFile(workspaceRoot: string, filePath: string): OutlineFileResult {
  const abs = resolveConfinedPath(workspaceRoot, filePath);
  const lines = readAllLines(abs);
  const matches: Array<OutlineMatch & { line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const hit = matchOutlineLine(lines[i]!);
    if (hit) matches.push({ ...hit, line: i + 1 });
  }

  const entries: OutlineEntry[] = matches.map((m, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < matches.length; j++) {
      const next = matches[j]!;
      if (next.indent <= m.indent) {
        end = next.line - 1;
        break;
      }
    }
    if (end < m.line) end = m.line;
    return {
      kind: m.kind,
      name: m.name,
      start_line: m.line,
      end_line: end,
      signature: m.signature,
    };
  });

  return {
    kind: "OutlineFileResult",
    path: relDisplay(workspaceRoot, abs),
    absolute_path: abs,
    total_lines: lines.length,
    entries,
  };
}

function rejectedResult(
  path: string,
  abs: string | null,
  start: number,
  end: number,
  code: ContextSlicingErrorCode,
  message: string,
): ReadLinesResult {
  return {
    kind: "ReadLinesResult",
    path,
    absolute_path: abs ?? path,
    start_line: start,
    end_line: end,
    lines: [],
    truncated: false,
    rejected: true,
    error: message,
    error_code: code,
  };
}

/**
 * Read an inclusive 1-indexed line range.
 * Hard cap: at most READ_LINES_HARD_CAP (80) lines per call.
 *
 * Contract for oversized ranges (end - start + 1 > 80):
 * - on_oversized "reject" (default): rejected=true, error_code=RANGE_EXCEEDS_CAP, lines=[]
 * - on_oversized "truncate": truncated=true, returns first 80 lines of the requested window
 */
export function readLines(
  workspaceRoot: string,
  filePath: string,
  start: number,
  end: number,
  opts?: ContextSlicingOptions,
): ReadLinesResult {
  const policy: OversizedRangePolicy = opts?.on_oversized ?? "reject";
  const display = filePath;

  let abs: string;
  try {
    abs = resolveConfinedPath(workspaceRoot, filePath);
  } catch (e) {
    if (e instanceof ContextSlicingError) {
      return rejectedResult(display, null, start, end, e.code, e.message);
    }
    throw e;
  }

  const pathOut = relDisplay(workspaceRoot, abs);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
    return rejectedResult(pathOut, abs, start, end, "BAD_RANGE", "start/end must be integers >= 1");
  }
  if (end < start) {
    return rejectedResult(pathOut, abs, start, end, "BAD_RANGE", "end must be >= start");
  }

  const requested = end - start + 1;
  let effectiveEnd = end;
  let truncated = false;

  if (requested > READ_LINES_HARD_CAP) {
    if (policy === "reject") {
      return rejectedResult(
        pathOut,
        abs,
        start,
        end,
        "RANGE_EXCEEDS_CAP",
        `requested ${requested} lines exceeds hard cap ${READ_LINES_HARD_CAP}`,
      );
    }
    effectiveEnd = start + READ_LINES_HARD_CAP - 1;
    truncated = true;
  }

  const all = readAllLines(abs);
  if (start > all.length) {
    return rejectedResult(
      pathOut,
      abs,
      start,
      end,
      "BAD_RANGE",
      `start ${start} beyond EOF (${all.length} lines)`,
    );
  }

  const clampedEnd = Math.min(effectiveEnd, all.length);
  const lines = all.slice(start - 1, clampedEnd);

  return {
    kind: "ReadLinesResult",
    path: pathOut,
    absolute_path: abs,
    start_line: start,
    end_line: clampedEnd,
    lines,
    truncated,
    rejected: false,
  };
}

/**
 * Agent-facing file tools — no unrestricted readFile.
 * Oversized ranges are rejected (fail-closed).
 */
export function createAgentFileTools(workspaceRoot: string): AgentFileTools {
  const root = resolve(workspaceRoot);
  return {
    outlineFile: (path: string) => outlineFile(root, path),
    readLines: (path: string, start: number, end: number) =>
      readLines(root, path, start, end, { on_oversized: "reject" }),
  };
}

/**
 * Explicit denial for any attempt to expose unrestricted read_file to agents.
 */
export function denyUnrestrictedReadFile(pathHint?: string): never {
  throw new ContextSlicingError(
    "UNRESTRICTED_READ_DENIED",
    `unrestricted read_file is disabled for agents; use outlineFile + readLines (≤${READ_LINES_HARD_CAP})${pathHint ? `: ${pathHint}` : ""}`,
  );
}

/** @deprecated Use outlineFile / readLines — kept to catch accidental agent wiring. */
export function readFile(_workspaceRoot: string, path: string): never {
  return denyUnrestrictedReadFile(path);
}
