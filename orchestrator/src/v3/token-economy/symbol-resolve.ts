/**
 * V1-TOK-03 — Deterministic pre-resolution of definitions & references on turn 1.
 *
 * Primary path: tree-sitter symbol map + identifier walk (offline, no tsserver).
 * Optional LSP: behind LanguageServerClient interface; default is tree-sitter only.
 * Never shells out to rg/grep for this path.
 */

import {
  buildFileSymbolMap,
  buildRepoSymbolMap,
  collectIdentifierOccurrences,
  resolveSymbolMapEngine,
  type IdentifierOccurrence,
  type SymbolEntry,
  type SymbolMapEngine,
} from "./symbol-map.js";
import { encodeTsvRow } from "./tsv.js";

export type SymbolResolveEngine = SymbolMapEngine | "lsp";

export interface SymbolLocation {
  path: string;
  /** 1-indexed. */
  line: number;
  /** 1-indexed; 1 when unknown. */
  column: number;
  name: string;
  kind?: string;
  engine: SymbolResolveEngine;
}

/**
 * Optional LSP client — not required for the default offline path.
 * Implementations may wrap tsserver / clangd / etc. when a server is running.
 */
export interface LanguageServerClient {
  readonly id: string;
  resolveDefinition?(
    workspaceRoot: string,
    filePath: string,
    line: number,
    symbol: string,
  ): Promise<SymbolLocation[] | null> | SymbolLocation[] | null;
  resolveReferences?(
    workspaceRoot: string,
    filePath: string,
    symbol: string,
  ): Promise<SymbolLocation[] | null> | SymbolLocation[] | null;
}

/** No-op stub used when no language server is attached. */
export class NullLanguageServerClient implements LanguageServerClient {
  readonly id = "null-lsp";
  resolveDefinition(): null {
    return null;
  }
  resolveReferences(): null {
    return null;
  }
}

export interface ResolveOptions {
  /** Optional LSP; consulted only when tree-sitter yields no hits (or prefer_lsp). */
  lsp?: LanguageServerClient;
  /** When true, try LSP first; still falls back to tree-sitter. Default false. */
  prefer_lsp?: boolean;
  /**
   * Extra files to search for references (and cross-file defs).
   * Defaults to [file] only for single-file calls.
   */
  search_files?: readonly string[];
}

function uniqueLocations(locs: SymbolLocation[]): SymbolLocation[] {
  const seen = new Set<string>();
  const out: SymbolLocation[] = [];
  for (const loc of locs) {
    const key = `${loc.path}|${loc.line}|${loc.column}|${loc.name}|${loc.kind ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

function entryToLocation(
  path: string,
  entry: SymbolEntry,
  engine: SymbolResolveEngine,
): SymbolLocation {
  return {
    path,
    line: entry.start_line,
    column: 1,
    name: entry.name,
    kind: entry.kind,
    engine,
  };
}

function occurrenceToLocation(
  hit: IdentifierOccurrence,
  engine: SymbolResolveEngine,
  kind?: string,
): SymbolLocation {
  return {
    path: hit.path,
    line: hit.line,
    column: hit.column,
    name: hit.name,
    kind,
    engine,
  };
}

function samePath(a: string, b: string): boolean {
  const na = a.replace(/\\/g, "/");
  const nb = b.replace(/\\/g, "/");
  return na === nb || na.endsWith("/" + nb) || nb.endsWith("/" + na);
}

function treeSitterDefinitions(
  workspaceRoot: string,
  filePath: string,
  line: number | undefined,
  symbol: string,
  searchFiles: readonly string[],
): SymbolLocation[] {
  const engine = resolveSymbolMapEngine();
  const files = searchFiles.length > 0 ? searchFiles : [filePath];
  const repo = buildRepoSymbolMap(workspaceRoot, files);
  const out: SymbolLocation[] = [];

  for (const f of repo.files) {
    for (const s of f.symbols) {
      if (s.name !== symbol) continue;
      // When a cursor line is given on the seed file, prefer the enclosing decl.
      if (
        line !== undefined &&
        samePath(f.path, filePath) &&
        (line < s.start_line || line > s.end_line)
      ) {
        continue;
      }
      out.push(entryToLocation(f.path, s, engine));
    }
  }

  // Line filter may have dropped every hit — fall back to name-only on seed file.
  if (out.length === 0) {
    const local = buildFileSymbolMap(workspaceRoot, filePath);
    for (const s of local.symbols) {
      if (s.name === symbol) out.push(entryToLocation(local.path, s, engine));
    }
  }

  // Identifier-level definition nodes (covers cases outline/map missed).
  if (out.length === 0) {
    for (const f of files) {
      for (const hit of collectIdentifierOccurrences(workspaceRoot, f, symbol)) {
        if (hit.role === "definition") {
          out.push(occurrenceToLocation(hit, engine));
        }
      }
    }
  }

  return uniqueLocations(out);
}

function treeSitterReferences(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
  searchFiles: readonly string[],
): SymbolLocation[] {
  const engine = resolveSymbolMapEngine();
  const files = searchFiles.length > 0 ? searchFiles : [filePath];
  const out: SymbolLocation[] = [];
  for (const f of files) {
    for (const hit of collectIdentifierOccurrences(workspaceRoot, f, symbol)) {
      if (hit.role === "reference") {
        out.push(occurrenceToLocation(hit, engine));
      }
    }
  }
  return uniqueLocations(out);
}

async function maybeLspDefs(
  lsp: LanguageServerClient | undefined,
  workspaceRoot: string,
  filePath: string,
  line: number,
  symbol: string,
): Promise<SymbolLocation[] | null> {
  if (!lsp?.resolveDefinition) return null;
  const result = await lsp.resolveDefinition(workspaceRoot, filePath, line, symbol);
  return result && result.length > 0 ? result : null;
}

async function maybeLspRefs(
  lsp: LanguageServerClient | undefined,
  workspaceRoot: string,
  filePath: string,
  symbol: string,
): Promise<SymbolLocation[] | null> {
  if (!lsp?.resolveReferences) return null;
  const result = await lsp.resolveReferences(workspaceRoot, filePath, symbol);
  return result && result.length > 0 ? result : null;
}

/**
 * Resolve definition location(s) for `symbol`.
 * Tree-sitter / symbol-map first; optional LSP only when attached.
 */
export async function resolveDefinition(
  workspaceRoot: string,
  filePath: string,
  line: number,
  symbol: string,
  opts?: ResolveOptions,
): Promise<SymbolLocation[]> {
  const searchFiles = opts?.search_files ?? [filePath];
  const preferLsp = opts?.prefer_lsp === true;

  if (preferLsp) {
    const lspHit = await maybeLspDefs(opts?.lsp, workspaceRoot, filePath, line, symbol);
    if (lspHit) return uniqueLocations(lspHit.map((l) => ({ ...l, engine: "lsp" as const })));
  }

  const tsHits = treeSitterDefinitions(workspaceRoot, filePath, line, symbol, searchFiles);
  if (tsHits.length > 0) return tsHits;

  const lspFallback = await maybeLspDefs(opts?.lsp, workspaceRoot, filePath, line, symbol);
  if (lspFallback) {
    return uniqueLocations(lspFallback.map((l) => ({ ...l, engine: "lsp" as const })));
  }
  return [];
}

/**
 * Sync tree-sitter-only definition resolve (default offline path).
 */
export function resolveDefinitionSync(
  workspaceRoot: string,
  filePath: string,
  line: number,
  symbol: string,
  opts?: Omit<ResolveOptions, "lsp" | "prefer_lsp">,
): SymbolLocation[] {
  const searchFiles = opts?.search_files ?? [filePath];
  return treeSitterDefinitions(workspaceRoot, filePath, line, symbol, searchFiles);
}

/**
 * Resolve reference locations for `symbol` across search_files (default: seed file).
 */
export async function resolveReferences(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
  opts?: ResolveOptions,
): Promise<SymbolLocation[]> {
  const searchFiles = opts?.search_files ?? [filePath];
  const preferLsp = opts?.prefer_lsp === true;

  if (preferLsp) {
    const lspHit = await maybeLspRefs(opts?.lsp, workspaceRoot, filePath, symbol);
    if (lspHit) return uniqueLocations(lspHit.map((l) => ({ ...l, engine: "lsp" as const })));
  }

  const tsHits = treeSitterReferences(workspaceRoot, filePath, symbol, searchFiles);
  if (tsHits.length > 0) return tsHits;

  const lspFallback = await maybeLspRefs(opts?.lsp, workspaceRoot, filePath, symbol);
  if (lspFallback) {
    return uniqueLocations(lspFallback.map((l) => ({ ...l, engine: "lsp" as const })));
  }
  return [];
}

/**
 * Sync tree-sitter-only reference resolve (default offline path).
 */
export function resolveReferencesSync(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
  opts?: Omit<ResolveOptions, "lsp" | "prefer_lsp">,
): SymbolLocation[] {
  const searchFiles = opts?.search_files ?? [filePath];
  return treeSitterReferences(workspaceRoot, filePath, symbol, searchFiles);
}

/** Compact TSV row: role|path|line|column|name[|kind] (V1-TOK-09). */
export function formatLocationCompact(role: "def" | "ref", loc: SymbolLocation): string {
  const name = loc.name.replace(/\|/g, "_").slice(0, 80);
  const fields = [role, loc.path, String(loc.line), String(loc.column), name];
  if (loc.kind) fields.push(loc.kind);
  return encodeTsvRow(fields);
}

export interface Turn1SymbolResolve {
  kind: "Turn1SymbolResolve";
  engine: SymbolResolveEngine;
  symbols: string[];
  definitions: SymbolLocation[];
  references: SymbolLocation[];
  /** Compact prompt-safe lines (no bodies). */
  compact: string[];
}

export interface PreResolveTurn1Input {
  workspace_root: string;
  file_paths: readonly string[];
  /**
   * Symbols to resolve. When omitted, uses names from the repo symbol map
   * (capped by max_symbols).
   */
  symbols?: readonly string[];
  /** Cap when auto-deriving symbols from the map. Default 32. */
  max_symbols?: number;
}

/**
 * Turn-1 bootstrap: resolve defs + refs for key symbols across mapped files.
 * Intended for MSO ANALYZING/DECOMPOSING / worker context assembly.
 */
export function preResolveForTurn1(input: PreResolveTurn1Input): Turn1SymbolResolve {
  const files = [...input.file_paths];
  const engine = resolveSymbolMapEngine();
  const repo = buildRepoSymbolMap(input.workspace_root, files);

  let symbols: string[];
  if (input.symbols && input.symbols.length > 0) {
    symbols = [...new Set(input.symbols.filter((s) => /^[A-Za-z_$][\w$]*$/.test(s)))];
  } else {
    const max = input.max_symbols ?? 32;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const f of repo.files) {
      for (const s of f.symbols) {
        if (seen.has(s.name)) continue;
        if (!/^[A-Za-z_$][\w$]*$/.test(s.name)) continue;
        seen.add(s.name);
        names.push(s.name);
        if (names.length >= max) break;
      }
      if (names.length >= max) break;
    }
    symbols = names;
  }

  const definitions: SymbolLocation[] = [];
  const references: SymbolLocation[] = [];
  const seed = files[0] ?? ".";

  for (const sym of symbols) {
    definitions.push(
      ...treeSitterDefinitions(input.workspace_root, seed, undefined, sym, files),
    );
    references.push(...treeSitterReferences(input.workspace_root, seed, sym, files));
  }

  const compact = [
    ...uniqueLocations(definitions).map((l) => formatLocationCompact("def", l)),
    ...uniqueLocations(references).map((l) => formatLocationCompact("ref", l)),
  ];

  return {
    kind: "Turn1SymbolResolve",
    engine,
    symbols,
    definitions: uniqueLocations(definitions),
    references: uniqueLocations(references),
    compact,
  };
}

/**
 * Diagnostic: this resolve path must never depend on shelling rg/grep.
 * Always true for the in-process implementation (documented contract for tests).
 */
export function symbolResolveUsesShellGrep(): false {
  return false;
}
