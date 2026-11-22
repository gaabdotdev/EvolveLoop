/**
 * V1-TOK-18 — Perplexity / LLMLingua-style compression for natural language only.
 *
 * Never compress source code (fenced blocks, extension-looking paths, dense code lines).
 */

export interface CompressNaturalLanguageResult {
  kind: "CompressNaturalLanguageResult";
  text: string;
  original_chars: number;
  compressed_chars: number;
  ratio_requested: number;
  ratio_achieved: number;
  /** Segments skipped because they looked like code. */
  code_segments_preserved: number;
  compressed: boolean;
}

const CODE_FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const FILE_EXT_RE =
  /\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|c|cc|cpp|h|hpp|cs|rb|php|swift|sql|sh|bash|zsh|yaml|yml|json|toml|mdc|css|scss|html|vue|svelte)\b/gi;

/** Heuristic: line looks like code (braces, imports, assignments denser than prose). */
function looksLikeCodeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(import|export|from|const|let|var|function|class|interface|type|def |fn |pub |package )\b/.test(t)) {
    return true;
  }
  if (/[{};]$/.test(t) && /[=<>()]/.test(t)) return true;
  if (/^\s*[{}\[\]];?\s*$/.test(t)) return true;
  if (/=>|::|\breturn\b|\bawait\b/.test(t) && /[();{}]/.test(t)) return true;
  return false;
}

/**
 * Compress NL toward `ratio` of original length (0..1).
 * Code fences, inline code, file paths with extensions, and code-like lines are preserved.
 */
export function compressNaturalLanguage(
  text: string,
  ratio: number,
): CompressNaturalLanguageResult {
  const original_chars = text.length;
  const targetRatio = Number.isFinite(ratio) ? Math.max(0.05, Math.min(1, ratio)) : 1;

  if (targetRatio >= 0.99 || text.length === 0) {
    return {
      kind: "CompressNaturalLanguageResult",
      text,
      original_chars,
      compressed_chars: text.length,
      ratio_requested: targetRatio,
      ratio_achieved: 1,
      code_segments_preserved: 0,
      compressed: false,
    };
  }

  // Extract protected spans
  const protectedSpans: Array<{ start: number; end: number; value: string }> = [];
  let code_segments_preserved = 0;

  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      protectedSpans.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
      code_segments_preserved++;
    }
  };
  collect(CODE_FENCE_RE);
  collect(INLINE_CODE_RE);
  collect(FILE_EXT_RE);

  // Merge overlapping protected spans
  protectedSpans.sort((a, b) => a.start - b.start);
  const merged: typeof protectedSpans = [];
  for (const span of protectedSpans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      if (span.end > last.end) {
        last.end = span.end;
        last.value = text.slice(last.start, last.end);
      }
    } else {
      merged.push({ ...span });
    }
  }

  // Split into free (NL) vs protected segments
  type Seg = { type: "nl" | "code"; value: string };
  const segs: Seg[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) {
      segs.push({ type: "nl", value: text.slice(cursor, span.start) });
    }
    segs.push({ type: "code", value: span.value });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segs.push({ type: "nl", value: text.slice(cursor) });
  }
  if (segs.length === 0) {
    segs.push({ type: "nl", value: text });
  }

  const nlBudget = Math.max(
    1,
    Math.floor(
      segs.filter((s) => s.type === "nl").reduce((n, s) => n + s.value.length, 0) * targetRatio,
    ),
  );

  let nlUsed = 0;
  const out: string[] = [];
  for (const seg of segs) {
    if (seg.type === "code") {
      out.push(seg.value);
      continue;
    }
    const compressed = compressProseSegment(seg.value, Math.max(0, nlBudget - nlUsed));
    nlUsed += compressed.length;
    out.push(compressed);
  }

  const result = out.join("");
  return {
    kind: "CompressNaturalLanguageResult",
    text: result,
    original_chars,
    compressed_chars: result.length,
    ratio_requested: targetRatio,
    ratio_achieved: original_chars === 0 ? 1 : result.length / original_chars,
    code_segments_preserved,
    compressed: result.length < original_chars,
  };
}

function compressProseSegment(segment: string, budget: number): string {
  if (budget <= 0) return "";
  const lines = segment.split("\n");
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (looksLikeCodeLine(line)) {
      // Preserve code-like lines entirely (counts against budget).
      if (used + line.length + 1 > budget && kept.length > 0) break;
      kept.push(line);
      used += line.length + 1;
      continue;
    }
    const stripped = stripFlourish(line);
    if (!stripped.trim()) {
      if (kept.length && kept[kept.length - 1] !== "") {
        kept.push("");
        used += 1;
      }
      continue;
    }
    // Drop low-information filler sentences when over budget.
    if (used + stripped.length + 1 > budget) {
      const remaining = budget - used;
      if (remaining > 16) {
        kept.push(stripped.slice(0, remaining).trimEnd());
        used = budget;
      }
      break;
    }
    kept.push(stripped);
    used += stripped.length + 1;
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

const FLOURISH =
  /\b(?:please|kindly|basically|actually|simply|just|really|very|quite|perhaps|maybe|I think|note that|it is important to|in order to|as you can see|in this case|of course|obviously)\b/gi;

function stripFlourish(line: string): string {
  return line
    .replace(FLOURISH, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}
