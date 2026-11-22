/**
 * V1-TOK-08 — Prefix Pinning for KV-cache reuse.
 *
 * Freeze immutable block at prompt top:
 *   [System Rules] + [Goal Contract] + [Repo Symbol Map]
 *
 * Never insert timestamps, attempt counters, or dynamic IDs before PIN_BOUNDARY.
 * Parallel agents on the same workspace inherit a byte-identical hot prefix.
 */

/** Marks end of the immutable pinned prefix (exclusive of dynamic suffix). */
export const PIN_BOUNDARY = "<<<PIN_END>>>";

export interface PinnedPrefixInput {
  systemRules: string;
  goalContract: string;
  repoSymbolMap: string;
}

export interface PinnedPromptResult {
  /** Byte-stable pinned prefix including PIN_BOUNDARY line. */
  prefix: string;
  /** Full prompt = prefix + "\\n" + dynamicSuffix (suffix may be empty). */
  prompt: string;
  /** Index of PIN_BOUNDARY start within prompt. */
  pinBoundaryIndex: number;
  /** UTF-8 byte length of prefix (for cache accounting). */
  prefixByteLength: number;
}

/**
 * Normalize pinned text: LF newlines, strip trailing spaces per line,
 * no leading/trailing blank lines. Deterministic across hosts.
 */
export function normalizePinnedBlock(text: string): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Build the immutable KV-cache prefix. Same inputs ⇒ byte-identical string.
 */
export function buildPinnedPrefix(input: PinnedPrefixInput): string {
  const systemRules = normalizePinnedBlock(input.systemRules);
  const goalContract = normalizePinnedBlock(input.goalContract);
  const repoSymbolMap = normalizePinnedBlock(input.repoSymbolMap);

  return [
    "[System Rules]",
    systemRules,
    "[Goal Contract]",
    goalContract,
    "[Repo Symbol Map]",
    repoSymbolMap,
    PIN_BOUNDARY,
  ].join("\n");
}

/**
 * Assemble prompt with pinned prefix at top + dynamic suffix after PIN_BOUNDARY.
 * Changing the turn/worker goal belongs in dynamicSuffix so the pin stays hot
 * when only the suffix changes.
 */
export function buildPromptWithPinnedPrefix(
  pinnedInput: PinnedPrefixInput | string,
  dynamicSuffix: string,
): PinnedPromptResult {
  const prefix =
    typeof pinnedInput === "string" ? pinnedInput : buildPinnedPrefix(pinnedInput);

  if (!prefix.includes(PIN_BOUNDARY)) {
    throw new Error("pinned prefix missing PIN_BOUNDARY");
  }

  const suffix = normalizePinnedBlock(dynamicSuffix);
  const prompt = suffix.length > 0 ? `${prefix}\n${suffix}` : prefix;
  const pinBoundaryIndex = prompt.indexOf(PIN_BOUNDARY);

  return {
    prefix,
    prompt,
    pinBoundaryIndex,
    prefixByteLength: Buffer.byteLength(prefix, "utf-8"),
  };
}

/** Slice prompt into pinned vs dynamic parts at PIN_BOUNDARY. */
export function splitAtPinBoundary(prompt: string): {
  prefix: string;
  afterPin: string;
} {
  const idx = prompt.indexOf(PIN_BOUNDARY);
  if (idx < 0) {
    throw new Error("prompt missing PIN_BOUNDARY");
  }
  const end = idx + PIN_BOUNDARY.length;
  const prefix = prompt.slice(0, end);
  const after = prompt.slice(end).replace(/^\n/, "");
  return { prefix, afterPin: after };
}
