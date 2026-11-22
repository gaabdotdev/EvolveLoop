/**
 * V1-TOK-02 — MSO ANALYZING / DECOMPOSING context: symbol maps only.
 * V1-TOK-03 — Turn-1 def/ref pre-resolution injected alongside the symbol map.
 *
 * The MSO must never receive complete file bodies in these states —
 * only directory hints + compact symbol maps (AST-lite / Tree-sitter)
 * + compact resolved defs/refs (no grep loops).
 */

import { dirname } from "node:path";
import {
  buildRepoSymbolMap,
  formatSymbolMapCompact,
  looksLikeFullFileDump,
  type RepoSymbolMap,
  type SymbolMapEngine,
} from "../token-economy/symbol-map.js";
import {
  preResolveForTurn1,
  type Turn1SymbolResolve,
} from "../token-economy/symbol-resolve.js";
import {
  selectToolsForMsoState,
  type LazyToolSchema,
} from "../token-economy/lazy-tools.js";
import { MsoError } from "./errors.js";
import type { MsoState } from "./states.js";

/** States that MUST receive symbol maps and MUST NOT receive full files. */
export const MSO_SYMBOL_MAP_STATES = ["ANALYZING", "DECOMPOSING"] as const;
export type MsoSymbolMapState = (typeof MSO_SYMBOL_MAP_STATES)[number];

/** Keys that historically carry full source dumps — never for MSO context. */
const FULL_FILE_KEYS = new Set([
  "content",
  "file_content",
  "full_content",
  "full_source",
  "source_text",
  "source",
  "body",
  "raw_file",
  "file_body",
]);

/** Fields produced by symbol maps / outlines — multi-line by design, not full files. */
const SAFE_MULTILINE_KEYS = new Set([
  "compact",
  "signature",
  "directory_tree",
  "symbols",
  "files",
  "symbol_map",
  "symbol_context",
  "symbol_resolve",
  "resolved_defs",
  "resolved_refs",
  "definitions",
  "references",
  "kind",
  "path",
  "name",
  "engine",
  "state",
  "mso_state",
  "workspace_root",
  "absolute_path",
]);

export function isMsoSymbolMapState(state: string): state is MsoSymbolMapState {
  return (MSO_SYMBOL_MAP_STATES as readonly string[]).includes(state);
}

export function requiresSymbolMap(state: MsoState): boolean {
  return isMsoSymbolMapState(state);
}

export interface MsoSymbolContext {
  kind: "MsoSymbolContext";
  state: MsoSymbolMapState;
  engine: SymbolMapEngine;
  workspace_root: string;
  /** Unique parent dirs of mapped files (compact tree hint). */
  directory_tree: string[];
  symbol_map: RepoSymbolMap;
  /** Prompt-safe compact serialization (no bodies). */
  compact: string;
  /**
   * V1-TOK-03 — Turn-1 deterministic defs/refs (tree-sitter).
   * Compact TSV lines eliminate agent grep loops for symbol resolution.
   */
  symbol_resolve: Turn1SymbolResolve;
}

export interface BuildMsoSymbolContextInput {
  state: MsoState;
  workspace_root: string;
  file_paths: readonly string[];
  /** Optional explicit symbols; otherwise derived from the symbol map. */
  resolve_symbols?: readonly string[];
  /** Cap for auto-derived symbols (default 32). */
  max_resolve_symbols?: number;
  /** When false, skip pre-resolve (tests / callers that only need the map). Default true. */
  pre_resolve?: boolean;
}

/**
 * Build mandatory symbol-map context for ANALYZING / DECOMPOSING.
 * Throws if state is not one of those, or if caller somehow embeds full files.
 */
export function buildMsoSymbolContext(input: BuildMsoSymbolContextInput): MsoSymbolContext {
  if (!isMsoSymbolMapState(input.state)) {
    throw new MsoError(
      "SYMBOL_MAP_STATE_REQUIRED",
      `symbol map context is mandatory only for ANALYZING/DECOMPOSING; got ${input.state}`,
    );
  }

  const symbol_map = buildRepoSymbolMap(input.workspace_root, input.file_paths);
  const dirs = new Set<string>();
  for (const f of symbol_map.files) {
    const d = dirname(f.path);
    if (d && d !== ".") dirs.add(d);
    else dirs.add(".");
  }
  const directory_tree = [...dirs].sort();
  const compact = formatSymbolMapCompact(symbol_map);

  const symbol_resolve: Turn1SymbolResolve =
    input.pre_resolve === false
      ? {
          kind: "Turn1SymbolResolve",
          engine: symbol_map.engine,
          symbols: [],
          definitions: [],
          references: [],
          compact: [],
        }
      : preResolveForTurn1({
          workspace_root: input.workspace_root,
          file_paths: input.file_paths,
          symbols: input.resolve_symbols,
          max_symbols: input.max_resolve_symbols,
        });

  const ctx: MsoSymbolContext = {
    kind: "MsoSymbolContext",
    state: input.state,
    engine: symbol_map.engine,
    workspace_root: input.workspace_root,
    directory_tree,
    symbol_map,
    compact,
    symbol_resolve,
  };

  // Fail closed: never ship a context that embeds full-file dumps.
  assertNoFullFileInMsoContext(ctx);
  return ctx;
}

/**
 * Serialize MSO context for prompts / persistence — never includes file bodies.
 */
export function serializeMsoSymbolContext(ctx: MsoSymbolContext): Record<string, unknown> {
  return {
    kind: ctx.kind,
    state: ctx.state,
    engine: ctx.engine,
    directory_tree: ctx.directory_tree,
    compact: ctx.compact,
    files: ctx.symbol_map.files.map((f) => ({
      path: f.path,
      total_lines: f.total_lines,
      symbols: f.symbols.map((s) => ({
        kind: s.kind,
        name: s.name,
        start_line: s.start_line,
        end_line: s.end_line,
        signature: s.signature,
      })),
    })),
    // V1-TOK-03 — compact def/ref rows for turn-1 workers (no file bodies).
    symbol_resolve: {
      kind: ctx.symbol_resolve.kind,
      engine: ctx.symbol_resolve.engine,
      symbols: ctx.symbol_resolve.symbols,
      compact: ctx.symbol_resolve.compact,
    },
  };
}

export type FullFileGuardMode = "reject" | "strip";

export interface FullFileGuardResult {
  ok: boolean;
  mode: FullFileGuardMode;
  stripped_keys: string[];
  /** Sanitized payload when mode=strip and ok; undefined when rejected. */
  payload?: Record<string, unknown>;
  error?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function forbidOrStrip(
  mode: FullFileGuardMode,
  stripped_keys: string[],
  childPath: string,
  message: string,
): "strip" {
  if (mode === "reject") {
    throw new MsoError("FULL_FILE_FORBIDDEN", message);
  }
  stripped_keys.push(childPath);
  return "strip";
}

/**
 * Walk payload and reject or strip fields that look like complete file dumps
 * intended for MSO context (ANALYZING / DECOMPOSING).
 *
 * Only FULL_FILE_KEYS / explicit markers are gated — compact symbol rows are safe.
 */
export function guardMsoContextAgainstFullFiles(
  payload: Record<string, unknown>,
  opts?: { mode?: FullFileGuardMode },
): FullFileGuardResult {
  const mode: FullFileGuardMode = opts?.mode ?? "reject";
  const stripped_keys: string[] = [];

  function visit(node: unknown, path: string): unknown {
    if (Array.isArray(node)) {
      return node.map((item, i) => visit(item, `${path}[${i}]`));
    }
    if (!isPlainObject(node)) return node;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const childPath = path ? `${path}.${k}` : k;
      const keyLower = k.toLowerCase();

      if (
        (keyLower === "full_file" || keyLower === "is_full_file") &&
        (v === true || v === "true")
      ) {
        forbidOrStrip(mode, stripped_keys, childPath, `full_file marker at ${childPath}`);
        continue;
      }

      if (FULL_FILE_KEYS.has(keyLower) && typeof v === "string") {
        const dump = looksLikeFullFileDump(v) || v.length >= 2000;
        if (dump) {
          forbidOrStrip(
            mode,
            stripped_keys,
            childPath,
            `full-file field "${k}" forbidden for MSO context`,
          );
          continue;
        }
        // Non-dump content under a full-file key is still refused (MSO must use symbol maps).
        if (v.length > 0) {
          forbidOrStrip(
            mode,
            stripped_keys,
            childPath,
            `field "${k}" carries file body; use symbol map instead`,
          );
          continue;
        }
      }

      // Unknown long multi-line strings outside safe keys → treat as full-file risk.
      if (
        typeof v === "string" &&
        !SAFE_MULTILINE_KEYS.has(keyLower) &&
        !FULL_FILE_KEYS.has(keyLower) &&
        looksLikeFullFileDump(v, { min_lines: 12, min_chars: 400 })
      ) {
        forbidOrStrip(
          mode,
          stripped_keys,
          childPath,
          `suspicious full-file dump at ${childPath}`,
        );
        continue;
      }

      out[k] = visit(v, childPath);
    }
    return out;
  }

  try {
    const cleaned = visit(payload, "") as Record<string, unknown>;
    return {
      ok: true,
      mode,
      stripped_keys,
      payload: cleaned,
    };
  } catch (e) {
    if (e instanceof MsoError && e.code === "FULL_FILE_FORBIDDEN") {
      return {
        ok: false,
        mode,
        stripped_keys,
        error: e.message,
      };
    }
    throw e;
  }
}

/**
 * Assert a built MsoSymbolContext (or arbitrary bag) has no full-file dumps.
 */
export function assertNoFullFileInMsoContext(value: unknown): void {
  if (typeof value === "object" && value !== null) {
    const bag = value as Record<string, unknown>;
    for (const k of Object.keys(bag)) {
      if (FULL_FILE_KEYS.has(k.toLowerCase())) {
        throw new MsoError(
          "FULL_FILE_FORBIDDEN",
          `MsoSymbolContext must not include full-file field "${k}"`,
        );
      }
    }
  }
  if (isPlainObject(value)) {
    const result = guardMsoContextAgainstFullFiles(value, { mode: "reject" });
    if (!result.ok) {
      throw new MsoError("FULL_FILE_FORBIDDEN", result.error ?? "full file in MSO context");
    }
  }
}

/**
 * Prepare a payload for ANALYZING/DECOMPOSING: require symbol context, strip/reject full files.
 */
export function prepareMsoAnalyzingPayload(input: {
  state: MsoState;
  workspace_root: string;
  file_paths: readonly string[];
  resolve_symbols?: readonly string[];
  max_resolve_symbols?: number;
  pre_resolve?: boolean;
  extra?: Record<string, unknown>;
  guard_mode?: FullFileGuardMode;
}): {
  state: MsoSymbolMapState;
  context: MsoSymbolContext;
  payload: Record<string, unknown>;
} {
  if (!isMsoSymbolMapState(input.state)) {
    throw new MsoError(
      "SYMBOL_MAP_STATE_REQUIRED",
      `prepareMsoAnalyzingPayload requires ANALYZING or DECOMPOSING; got ${input.state}`,
    );
  }

  const context = buildMsoSymbolContext({
    state: input.state,
    workspace_root: input.workspace_root,
    file_paths: input.file_paths,
    resolve_symbols: input.resolve_symbols,
    max_resolve_symbols: input.max_resolve_symbols,
    pre_resolve: input.pre_resolve,
  });

  // V1-TOK-07 — inject only the lazy tool schemas for this MSO state.
  const tools: LazyToolSchema[] = selectToolsForMsoState(input.state);

  const base: Record<string, unknown> = {
    mso_state: input.state,
    symbol_context: serializeMsoSymbolContext(context),
    // Flat compact inject for worker bootstrap (turn 1).
    resolved_defs: context.symbol_resolve.compact.filter((r) => r.startsWith("def|")),
    resolved_refs: context.symbol_resolve.compact.filter((r) => r.startsWith("ref|")),
    tools,
    ...(input.extra ?? {}),
  };

  const guarded = guardMsoContextAgainstFullFiles(base, {
    mode: input.guard_mode ?? "reject",
  });
  if (!guarded.ok || !guarded.payload) {
    throw new MsoError("FULL_FILE_FORBIDDEN", guarded.error ?? "full file in MSO payload");
  }

  return {
    state: input.state,
    context,
    payload: guarded.payload,
  };
}
