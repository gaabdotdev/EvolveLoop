/**
 * V2-ORCH-02 — AST-Aware Merge (no LLM).
 * Resolves syntactic conflicts for TS/JS when edited symbols are disjoint.
 * Same symbol/function edited on both sides → NEEDS_SEMANTIC_TASK.
 */

import { extname } from "node:path";
import {
  extractDeclarationUnitsFromSource,
  type DeclarationUnit,
} from "../token-economy/symbol-map.js";
import { detectMergiraf, runMergirafMerge } from "./mergiraf-adapter.js";

export type AstMergeEngine = "ast-internal" | "mergiraf";

export type AstMergeStatus = "MERGED" | "NEEDS_SEMANTIC_TASK" | "UNSUPPORTED";

export interface AstMergeInput {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  /** Prefer mergiraf when binary is present (default true). */
  prefer_mergiraf?: boolean;
}

export interface AstMergeResult {
  status: AstMergeStatus;
  engine: AstMergeEngine;
  content?: string;
  overlapping_symbols: string[];
  reason?: string;
  /** True when conflict was classified as purely syntactic and resolved. */
  syntactic_resolved: boolean;
  /** True when a real semantic conflict was detected. */
  semantic_needed: boolean;
}

const AST_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

export function isAstMergeablePath(filePath: string): boolean {
  return AST_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function normalizeNl(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

function unitMap(units: DeclarationUnit[]): Map<string, DeclarationUnit> {
  const m = new Map<string, DeclarationUnit>();
  for (const u of units) {
    // Last wins within a side (rare duplicate keys) — deterministic by source order.
    m.set(u.key, u);
  }
  return m;
}

function textsEqual(a: string | undefined, b: string | undefined): boolean {
  return normalizeNl(a ?? "") === normalizeNl(b ?? "");
}

/**
 * 3-way declaration merge: disjoint symbol edits compose; overlapping → semantic.
 */
export function mergeDeclarationUnits(
  baseUnits: DeclarationUnit[],
  oursUnits: DeclarationUnit[],
  theirsUnits: DeclarationUnit[],
  preamble: { base: string; ours: string; theirs: string },
  trailer: { base: string; ours: string; theirs: string },
):
  | { ok: true; content: string; overlapping: string[] }
  | { ok: false; overlapping: string[]; reason: string } {
  const base = unitMap(baseUnits);
  const ours = unitMap(oursUnits);
  const theirs = unitMap(theirsUnits);

  const allKeys = new Set<string>([
    ...base.keys(),
    ...ours.keys(),
    ...theirs.keys(),
  ]);

  const overlapping: string[] = [];
  const chosen = new Map<string, string>();

  for (const key of allKeys) {
    const b = base.get(key)?.text;
    const o = ours.get(key)?.text;
    const t = theirs.get(key)?.text;

    const inBase = b !== undefined;
    const inOurs = o !== undefined;
    const inTheirs = t !== undefined;

    const oursChanged = inOurs && !textsEqual(o, b);
    const theirsChanged = inTheirs && !textsEqual(t, b);
    const oursDeleted = inBase && !inOurs;
    const theirsDeleted = inBase && !inTheirs;

    // Both sides deleted identically → drop.
    if (oursDeleted && theirsDeleted) {
      continue;
    }

    // Delete vs edit / delete vs keep → semantic.
    if ((oursDeleted && theirsChanged) || (theirsDeleted && oursChanged)) {
      overlapping.push(key);
      continue;
    }
    if (oursDeleted && inTheirs && textsEqual(t, b)) {
      // ours deleted, theirs unchanged → delete
      continue;
    }
    if (theirsDeleted && inOurs && textsEqual(o, b)) {
      continue;
    }
    if (oursDeleted || theirsDeleted) {
      overlapping.push(key);
      continue;
    }

    // Both added or both edited to different text → semantic.
    if (oursChanged && theirsChanged && !textsEqual(o, t)) {
      overlapping.push(key);
      continue;
    }

    if (oursChanged) {
      chosen.set(key, o!);
    } else if (theirsChanged) {
      chosen.set(key, t!);
    } else if (inBase) {
      chosen.set(key, b!);
    } else if (inOurs && inTheirs && textsEqual(o, t)) {
      chosen.set(key, o!);
    } else if (inOurs && !inTheirs) {
      chosen.set(key, o!);
    } else if (inTheirs && !inOurs) {
      chosen.set(key, t!);
    } else if (inOurs && inTheirs && !textsEqual(o, t)) {
      overlapping.push(key);
    }
  }

  if (overlapping.length > 0) {
    return {
      ok: false,
      overlapping: [...overlapping].sort(),
      reason: "overlapping_symbol_edits",
    };
  }

  // Preamble / trailer: only one side may diverge from base.
  let pre = preamble.base;
  const preOurs = !textsEqual(preamble.ours, preamble.base);
  const preTheirs = !textsEqual(preamble.theirs, preamble.base);
  if (preOurs && preTheirs && !textsEqual(preamble.ours, preamble.theirs)) {
    return {
      ok: false,
      overlapping: ["__preamble__"],
      reason: "preamble_conflict",
    };
  }
  if (preOurs) pre = preamble.ours;
  else if (preTheirs) pre = preamble.theirs;

  let trail = trailer.base;
  const trailOurs = !textsEqual(trailer.ours, trailer.base);
  const trailTheirs = !textsEqual(trailer.theirs, trailer.base);
  if (trailOurs && trailTheirs && !textsEqual(trailer.ours, trailer.theirs)) {
    return {
      ok: false,
      overlapping: ["__trailer__"],
      reason: "trailer_conflict",
    };
  }
  if (trailOurs) trail = trailer.ours;
  else if (trailTheirs) trail = trailer.theirs;

  // Order: base order for surviving base keys, then ours-only additions, then theirs-only.
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const u of baseUnits) {
    if (chosen.has(u.key) && !seen.has(u.key)) {
      orderedKeys.push(u.key);
      seen.add(u.key);
    }
  }
  for (const u of oursUnits) {
    if (chosen.has(u.key) && !seen.has(u.key)) {
      orderedKeys.push(u.key);
      seen.add(u.key);
    }
  }
  for (const u of theirsUnits) {
    if (chosen.has(u.key) && !seen.has(u.key)) {
      orderedKeys.push(u.key);
      seen.add(u.key);
    }
  }

  const body = orderedKeys.map((k) => chosen.get(k)!).join("\n\n");
  const content = `${pre}${body}${trail}`.replace(/\n{3,}/g, "\n\n");
  return { ok: true, content, overlapping: [] };
}

/**
 * AST-aware 3-way merge for one file. No LLM.
 * Prefer mergiraf when installed; otherwise internal tree-sitter engine.
 */
export function astAwareMerge(input: AstMergeInput): AstMergeResult {
  const preferMergiraf = input.prefer_mergiraf !== false;

  if (preferMergiraf) {
    const detected = detectMergiraf();
    if (detected.available && detected.path) {
      const mr = runMergirafMerge({
        path: input.path,
        base: input.base,
        ours: input.ours,
        theirs: input.theirs,
        binary_path: detected.path,
      });
      if (mr.ok && mr.content !== undefined) {
        return {
          status: "MERGED",
          engine: "mergiraf",
          content: mr.content,
          overlapping_symbols: [],
          syntactic_resolved: true,
          semantic_needed: false,
        };
      }
      // Fall through to internal AST on mergiraf failure.
    }
  }

  if (!isAstMergeablePath(input.path)) {
    return {
      status: "UNSUPPORTED",
      engine: "ast-internal",
      overlapping_symbols: [],
      reason: `unsupported_extension:${extname(input.path)}`,
      syntactic_resolved: false,
      semantic_needed: true,
    };
  }

  // Identical ours/theirs → trivial.
  if (normalizeNl(input.ours) === normalizeNl(input.theirs)) {
    return {
      status: "MERGED",
      engine: "ast-internal",
      content: input.ours,
      overlapping_symbols: [],
      syntactic_resolved: true,
      semantic_needed: false,
    };
  }

  // Trivial: one side equals base.
  if (normalizeNl(input.ours) === normalizeNl(input.base)) {
    return {
      status: "MERGED",
      engine: "ast-internal",
      content: input.theirs,
      overlapping_symbols: [],
      syntactic_resolved: true,
      semantic_needed: false,
    };
  }
  if (normalizeNl(input.theirs) === normalizeNl(input.base)) {
    return {
      status: "MERGED",
      engine: "ast-internal",
      content: input.ours,
      overlapping_symbols: [],
      syntactic_resolved: true,
      semantic_needed: false,
    };
  }

  const baseEx = extractDeclarationUnitsFromSource(input.base, input.path);
  const oursEx = extractDeclarationUnitsFromSource(input.ours, input.path);
  const theirsEx = extractDeclarationUnitsFromSource(input.theirs, input.path);

  if (!baseEx || !oursEx || !theirsEx) {
    return {
      status: "NEEDS_SEMANTIC_TASK",
      engine: "ast-internal",
      overlapping_symbols: [],
      reason: "tree_sitter_unavailable_or_parse_failed",
      syntactic_resolved: false,
      semantic_needed: true,
    };
  }

  const merged = mergeDeclarationUnits(
    baseEx.units,
    oursEx.units,
    theirsEx.units,
    {
      base: baseEx.preamble,
      ours: oursEx.preamble,
      theirs: theirsEx.preamble,
    },
    {
      base: baseEx.trailer,
      ours: oursEx.trailer,
      theirs: theirsEx.trailer,
    },
  );

  if (!merged.ok) {
    return {
      status: "NEEDS_SEMANTIC_TASK",
      engine: "ast-internal",
      overlapping_symbols: merged.overlapping,
      reason: merged.reason,
      syntactic_resolved: false,
      semantic_needed: true,
    };
  }

  return {
    status: "MERGED",
    engine: "ast-internal",
    content: merged.content,
    overlapping_symbols: [],
    syntactic_resolved: true,
    semantic_needed: false,
  };
}
