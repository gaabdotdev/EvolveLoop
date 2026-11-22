/**
 * V0-TOK-03 — Internal traffic in telegraphic English (CLI UX stays PT).
 */

/** Max bytes for a single active runtime skill blob injected into context. */
export const RUNTIME_SKILL_MAX_BYTES = 3 * 1024;
/** Soft target when compressing; hard abort above RUNTIME_SKILL_MAX_BYTES. */
export const RUNTIME_SKILL_TARGET_BYTES = 2 * 1024;

const FLOURISH_RE =
  /\b(?:please|kindly|basically|actually|simply|just|really|very|quite|perhaps|maybe|I think|note that|it is important to|in order to)\b/gi;

/**
 * Build a compact English telegraphic line from key=value facts.
 * Preserves identifiers, paths, numbers, and negations literally.
 */
export function toTelegraphicEn(
  facts: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(facts)) {
    if (v === undefined || v === null || v === "") continue;
    const key = k.replace(/\s+/g, "_");
    const val = typeof v === "boolean" || typeof v === "number" ? String(v) : String(v).trim();
    parts.push(`${key}=${val}`);
  }
  return parts.join(" ");
}

/** Strip flourish from free prose while keeping technical tokens. */
export function compressTelegraphicProse(text: string): string {
  return text
    .replace(FLOURISH_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export interface SkillCompressResult {
  text: string;
  bytes: number;
  truncated: boolean;
  within_budget: boolean;
  max_bytes: number;
}

/**
 * Compress active runtime skill text to ≤ 2–3 KB (hard max 3 KB).
 * Prefer cut at line boundary; never invent content.
 */
export function compressRuntimeSkill(
  raw: string,
  maxBytes: number = RUNTIME_SKILL_MAX_BYTES,
): SkillCompressResult {
  const telegraphic = compressTelegraphicProse(raw);
  let text = telegraphic;
  let truncated = false;
  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
    truncated = true;
    // Binary-search byte cut then snap back to last newline when possible.
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (Buffer.byteLength(text.slice(0, mid), "utf-8") <= maxBytes - 24) lo = mid;
      else hi = mid - 1;
    }
    let cut = text.slice(0, lo);
    const nl = cut.lastIndexOf("\n");
    if (nl > Math.floor(lo * 0.5)) cut = cut.slice(0, nl);
    text = `${cut}\n…[skill truncated max=${maxBytes}B]`;
  }
  const bytes = Buffer.byteLength(text, "utf-8");
  return {
    text,
    bytes,
    truncated,
    within_budget: bytes <= maxBytes,
    max_bytes: maxBytes,
  };
}
