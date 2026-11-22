/**
 * V0-TOK-04 — Deterministic stdout/stderr filter middleware.
 * Strip ANSI, hide passed tests, dedupe stack traces, keep head 30 + tail 20.
 */

export const STDOUT_FILTER_HEAD_LINES = 30;
export const STDOUT_FILTER_TAIL_LINES = 20;

const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]|\u009b[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Vitest/Jest/pytest/TAP “passed” noise we drop from context.
 * Do NOT match bare "ok" (common in scripts) — require test-runner markers.
 */
const PASSED_TEST_RE =
  /^\s*(?:✓|✔|√|\u2713|\u2714)\s+\S.*$|^\s*(?:PASS(?:ED)?|PASS)\s+\S.*$|^\s*ok\s+\d+(?:\s+-|\s+#|\s*$).*$|^\s*\d+\s+passed\b.*$/i;

/** Stack frame lines (Node / V8 / Python-ish). */
const STACK_FRAME_RE = /^\s*(?:at\s+\S+|File\s+".+",\s+line\s+\d+)/;

export interface StdoutFilterOptions {
  head?: number;
  tail?: number;
  hidePassedTests?: boolean;
  dedupeStacks?: boolean;
  deny?: RegExp[];
}

export interface StdoutFilterStats {
  input_lines: number;
  output_lines: number;
  ansi_stripped: boolean;
  passed_tests_hidden: number;
  stack_frames_deduped: number;
  truncated_middle: boolean;
}

export interface StdoutFilterResult {
  text: string;
  stats: StdoutFilterStats;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function isPassedTestLine(line: string): boolean {
  return PASSED_TEST_RE.test(line);
}

/**
 * Collapse consecutive identical stack-frame lines (same frame repeated).
 * Also collapses runs of near-identical "at foo (file:line)" when the frame text matches.
 */
export function dedupeStackTraces(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let removed = 0;
  let lastStack: string | null = null;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (STACK_FRAME_RE.test(trimmed) || /^\s+at\s+/.test(trimmed)) {
      if (lastStack !== null && lastStack === trimmed) {
        removed += 1;
        continue;
      }
      lastStack = trimmed;
      out.push(line);
      continue;
    }
    lastStack = null;
    out.push(line);
  }
  return { lines: out, removed };
}

/** Keep first `head` and last `tail` lines; insert marker when middle dropped. */
export function headTailTruncate(
  lines: string[],
  head = STDOUT_FILTER_HEAD_LINES,
  tail = STDOUT_FILTER_TAIL_LINES,
): { lines: string[]; truncated: boolean } {
  if (lines.length <= head + tail) {
    return { lines, truncated: false };
  }
  const omitted = lines.length - head - tail;
  return {
    lines: [
      ...lines.slice(0, head),
      `…[truncated ${omitted} lines; keep head ${head} + tail ${tail}]`,
      ...lines.slice(lines.length - tail),
    ],
    truncated: true,
  };
}

/**
 * Canonical V0-TOK-04 pipeline for process output destined for LLM/context.
 */
export function filterProcessOutput(
  text: string,
  opts: StdoutFilterOptions = {},
): StdoutFilterResult {
  const head = opts.head ?? STDOUT_FILTER_HEAD_LINES;
  const tail = opts.tail ?? STDOUT_FILTER_TAIL_LINES;
  const hidePassed = opts.hidePassedTests !== false;
  const dedupe = opts.dedupeStacks !== false;

  const stripped = stripAnsi(text);
  let lines = stripped.split(/\r?\n/);
  const input_lines = lines.length;
  let passed_tests_hidden = 0;
  let stack_frames_deduped = 0;

  if (opts.deny && opts.deny.length > 0) {
    lines = lines.filter((line) => !opts.deny!.some((re) => re.test(line)));
  }

  if (hidePassed) {
    const kept: string[] = [];
    for (const line of lines) {
      if (isPassedTestLine(line)) {
        passed_tests_hidden += 1;
        continue;
      }
      kept.push(line);
    }
    lines = kept;
  }

  if (dedupe) {
    const d = dedupeStackTraces(lines);
    lines = d.lines;
    stack_frames_deduped = d.removed;
  }

  const truncated = headTailTruncate(lines, head, tail);

  return {
    text: truncated.lines.join("\n"),
    stats: {
      input_lines,
      output_lines: truncated.lines.length,
      ansi_stripped: stripped !== text,
      passed_tests_hidden,
      stack_frames_deduped,
      truncated_middle: truncated.truncated,
    },
  };
}
