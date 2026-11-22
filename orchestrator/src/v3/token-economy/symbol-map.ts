/**
 * V1-TOK-02 — Compact symbol map for MSO ANALYZING / DECOMPOSING.
 *
 * Engine choice: `web-tree-sitter` + WASM grammars shipped by
 * `tree-sitter-typescript` / `tree-sitter-javascript` (not native `tree-sitter`
 * bindings). Reasons: (1) tree-sitter-typescript still peers tree-sitter@^0.21
 * while current tree-sitter is 0.25+; (2) WASM stays portable across Node hosts
 * without native rebuild; (3) sync parse after one ESM top-level `Parser.init`.
 *
 * Primary path: tree-sitter when grammars load. Explicit fallback: AST-lite via
 * outlineFile when init fails or the file extension has no loaded grammar.
 */

import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import {
  outlineFile,
  resolveConfinedPath,
  type OutlineEntry,
  type OutlineKind,
} from "./context-slicing.js";
import { encodeTsvRow } from "./tsv.js";

/** Engines the runtime may advertise. */
export type SymbolMapEngine = "ast-lite" | "tree-sitter";

export type SymbolKind = OutlineKind;

export interface SymbolEntry {
  kind: SymbolKind;
  name: string;
  /** Inclusive, 1-indexed. */
  start_line: number;
  /** Inclusive, 1-indexed. */
  end_line: number;
  signature: string;
}

export interface FileSymbolMap {
  kind: "FileSymbolMap";
  path: string;
  absolute_path: string;
  engine: SymbolMapEngine;
  total_lines: number;
  symbols: SymbolEntry[];
  /**
   * Compact positional rows: path|start|end|kind|name
   * (aligned with V1-TOK-09 TSV direction; no full bodies).
   */
  compact: string[];
}

export interface RepoSymbolMap {
  kind: "RepoSymbolMap";
  engine: SymbolMapEngine;
  workspace_root: string;
  files: FileSymbolMap[];
  /** Flattened compact rows across files. */
  compact: string[];
}

type GrammarId = "typescript" | "tsx" | "javascript";

interface TreeSitterRuntime {
  ok: true;
  languages: Partial<Record<GrammarId, Language>>;
}

interface TreeSitterFailed {
  ok: false;
  reason: string;
}

type TreeSitterState = TreeSitterRuntime | TreeSitterFailed;

const require = createRequire(import.meta.url);

const NODE_TYPE_TO_KIND: Record<string, SymbolKind> = {
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  function_declaration: "function",
  generator_function_declaration: "function",
  method_definition: "method",
  method_signature: "method",
  function_signature: "function",
};

const DECL_NODE_TYPES = new Set(Object.keys(NODE_TYPE_TO_KIND));

function packageDir(pkgName: string): string {
  return dirname(require.resolve(`${pkgName}/package.json`));
}

function webTreeSitterDir(): string {
  return dirname(require.resolve("web-tree-sitter"));
}

async function initTreeSitterRuntime(): Promise<TreeSitterState> {
  try {
    const wtsDir = webTreeSitterDir();
    await Parser.init({
      locateFile(scriptName: string): string {
        return join(wtsDir, scriptName);
      },
    });

    const tsDir = packageDir("tree-sitter-typescript");
    const jsDir = packageDir("tree-sitter-javascript");

    const languages: Partial<Record<GrammarId, Language>> = {
      typescript: await Language.load(join(tsDir, "tree-sitter-typescript.wasm")),
      tsx: await Language.load(join(tsDir, "tree-sitter-tsx.wasm")),
      javascript: await Language.load(join(jsDir, "tree-sitter-javascript.wasm")),
    };

    return { ok: true, languages };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: reason || "tree-sitter init failed" };
  }
}

/** Module-load init; fails closed to AST-lite when WASM/grammar load fails. */
const TREE_SITTER_STATE: TreeSitterState = await initTreeSitterRuntime();

/**
 * Detect which engine is active after init.
 * Returns tree-sitter only when Parser + grammars loaded successfully.
 */
export function resolveSymbolMapEngine(): SymbolMapEngine {
  return TREE_SITTER_STATE.ok ? "tree-sitter" : "ast-lite";
}

/** Active engine constant for call sites / tests. */
export const SYMBOL_MAP_ENGINE: SymbolMapEngine = resolveSymbolMapEngine();

/** Test/diagnostic aid — why AST-lite was chosen when tree-sitter failed. */
export function getSymbolMapTreeSitterInitError(): string | null {
  return TREE_SITTER_STATE.ok ? null : TREE_SITTER_STATE.reason;
}

function grammarForPath(filePath: string): GrammarId | null {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    default:
      return null;
  }
}

function outlineToSymbols(entries: OutlineEntry[]): SymbolEntry[] {
  return entries.map((e) => ({
    kind: e.kind,
    name: e.name,
    start_line: e.start_line,
    end_line: e.end_line,
    signature: e.signature,
  }));
}

function compactRow(path: string, s: SymbolEntry): string {
  // V1-TOK-09 — positional compact via encodeTsvRow
  const name = s.name.replace(/\|/g, "_").slice(0, 80);
  return encodeTsvRow([path, String(s.start_line), String(s.end_line), s.kind, name]);
}

function lineSignature(sourceLines: string[], row0: number): string {
  const line = sourceLines[row0] ?? "";
  return line.trim().slice(0, 200);
}

function displayPath(workspaceRoot: string, abs: string): string {
  let rootReal = resolve(workspaceRoot);
  try {
    rootReal = realpathSync(rootReal);
  } catch {
    /* keep resolve() */
  }
  const rel = relative(rootReal, abs);
  return rel && !rel.startsWith("..") ? rel.split(sep).join("/") : abs;
}

function extractSymbolsFromTree(root: Node, sourceLines: string[]): SymbolEntry[] {
  const out: SymbolEntry[] = [];

  const visit = (node: Node): void => {
    if (DECL_NODE_TYPES.has(node.type)) {
      const nameNode = node.childForFieldName("name");
      const kind = NODE_TYPE_TO_KIND[node.type];
      if (nameNode && kind) {
        out.push({
          kind,
          name: nameNode.text.slice(0, 120),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          signature: lineSignature(sourceLines, node.startPosition.row),
        });
      }
    } else if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName("name");
      const value = node.childForFieldName("value");
      if (
        nameNode &&
        value &&
        (value.type === "arrow_function" || value.type === "function_expression")
      ) {
        out.push({
          kind: "const",
          name: nameNode.text.slice(0, 120),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          signature: lineSignature(sourceLines, node.startPosition.row),
        });
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child);
    }
  };

  visit(root);
  return out;
}

function buildViaAstLite(workspaceRoot: string, filePath: string): FileSymbolMap {
  const outline = outlineFile(workspaceRoot, filePath);
  const symbols = outlineToSymbols(outline.entries);
  const compact = symbols.map((s) => compactRow(outline.path, s));
  return {
    kind: "FileSymbolMap",
    path: outline.path,
    absolute_path: outline.absolute_path,
    engine: "ast-lite",
    total_lines: outline.total_lines,
    symbols,
    compact,
  };
}

function buildViaTreeSitter(
  workspaceRoot: string,
  filePath: string,
  language: Language,
): FileSymbolMap {
  const abs = resolveConfinedPath(workspaceRoot, filePath);
  const source = readFileSync(abs, "utf-8");
  const sourceLines = source.length === 0 ? [] : source.split(/\r?\n/);
  if (sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === "" && source.endsWith("\n")) {
    sourceLines.pop();
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) {
    return buildViaAstLite(workspaceRoot, filePath);
  }

  try {
    const symbols = extractSymbolsFromTree(tree.rootNode, sourceLines);
    const pathDisplay = displayPath(workspaceRoot, abs);
    const compact = symbols.map((s) => compactRow(pathDisplay, s));
    return {
      kind: "FileSymbolMap",
      path: pathDisplay,
      absolute_path: abs,
      engine: "tree-sitter",
      total_lines: sourceLines.length,
      symbols,
      compact,
    };
  } finally {
    tree.delete();
    parser.delete();
  }
}

/**
 * Build a compact symbol map for one source file (no full file body).
 * Uses tree-sitter when runtime + grammar are available; otherwise AST-lite.
 */
export function buildFileSymbolMap(workspaceRoot: string, filePath: string): FileSymbolMap {
  if (!TREE_SITTER_STATE.ok) {
    return buildViaAstLite(workspaceRoot, filePath);
  }

  const grammarId = grammarForPath(filePath);
  const language = grammarId ? TREE_SITTER_STATE.languages[grammarId] : undefined;
  if (!language) {
    return buildViaAstLite(workspaceRoot, filePath);
  }

  try {
    return buildViaTreeSitter(workspaceRoot, filePath, language);
  } catch {
    return buildViaAstLite(workspaceRoot, filePath);
  }
}

/**
 * Build a repo-level symbol map for the given relative paths.
 */
export function buildRepoSymbolMap(
  workspaceRoot: string,
  filePaths: readonly string[],
): RepoSymbolMap {
  const files: FileSymbolMap[] = [];
  for (const p of filePaths) {
    files.push(buildFileSymbolMap(workspaceRoot, p));
  }
  const engine: SymbolMapEngine =
    resolveSymbolMapEngine() === "tree-sitter" && files.some((f) => f.engine === "tree-sitter")
      ? "tree-sitter"
      : files.every((f) => f.engine === "ast-lite")
        ? "ast-lite"
        : resolveSymbolMapEngine();

  return {
    kind: "RepoSymbolMap",
    engine,
    workspace_root: workspaceRoot,
    files,
    compact: files.flatMap((f) => f.compact),
  };
}

/**
 * Serialize symbol map as newline-joined compact rows (no file bodies).
 */
export function formatSymbolMapCompact(map: FileSymbolMap | RepoSymbolMap): string {
  return map.compact.join("\n");
}

/** Identifier hit for V1-TOK-03 pre-resolution (no shell/grep). */
export interface IdentifierOccurrence {
  path: string;
  /** 1-indexed. */
  line: number;
  /** 1-indexed. */
  column: number;
  name: string;
  role: "definition" | "reference";
}

const IDENT_NODE_TYPES = new Set([
  "identifier",
  "type_identifier",
  "property_identifier",
]);

const DEF_NAME_PARENT_TYPES = new Set([
  ...DECL_NODE_TYPES,
  "variable_declarator",
  "required_parameter",
  "optional_parameter",
]);

function isDefinitionNameNode(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (!DEF_NAME_PARENT_TYPES.has(parent.type)) return false;
  const nameField = parent.childForFieldName("name");
  return nameField !== null && nameField.id === node.id;
}

function collectViaTreeSitter(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
  language: Language,
): IdentifierOccurrence[] {
  const abs = resolveConfinedPath(workspaceRoot, filePath);
  const source = readFileSync(abs, "utf-8");
  const pathDisplay = displayPath(workspaceRoot, abs);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return collectViaAstLite(workspaceRoot, filePath, symbol);
  }

  const out: IdentifierOccurrence[] = [];
  try {
    const visit = (node: Node): void => {
      if (IDENT_NODE_TYPES.has(node.type) && node.text === symbol) {
        out.push({
          path: pathDisplay,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          name: symbol,
          role: isDefinitionNameNode(node) ? "definition" : "reference",
        });
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) visit(child);
      }
    };
    visit(tree.rootNode);
  } finally {
    tree.delete();
    parser.delete();
  }
  return out;
}

/**
 * AST-lite fallback: outline defs + word-boundary line scan for refs.
 * Never shells out to rg/grep.
 */
function collectViaAstLite(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
): IdentifierOccurrence[] {
  const outline = outlineFile(workspaceRoot, filePath);
  const abs = outline.absolute_path;
  const source = readFileSync(abs, "utf-8");
  const lines = source.length === 0 ? [] : source.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "" && source.endsWith("\n")) {
    lines.pop();
  }

  const out: IdentifierOccurrence[] = [];
  const defLines = new Set<number>();
  for (const e of outline.entries) {
    if (e.name === symbol) {
      defLines.add(e.start_line);
      out.push({
        path: outline.path,
        line: e.start_line,
        column: 1,
        name: symbol,
        role: "definition",
      });
    }
  }

  // Word-boundary scan — in-process only (no child_process / rg).
  const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    if (defLines.has(lineNo)) continue;
    const line = lines[i]!;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      out.push({
        path: outline.path,
        line: lineNo,
        column: m.index + 1,
        name: symbol,
        role: "reference",
      });
    }
  }
  return out;
}

/**
 * Collect definition + reference occurrences of `symbol` in one file.
 * Tree-sitter primary; AST-lite fallback. Never uses shell grep/rg.
 */
export function collectIdentifierOccurrences(
  workspaceRoot: string,
  filePath: string,
  symbol: string,
): IdentifierOccurrence[] {
  if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) {
    return [];
  }

  if (!TREE_SITTER_STATE.ok) {
    return collectViaAstLite(workspaceRoot, filePath, symbol);
  }

  const grammarId = grammarForPath(filePath);
  const language = grammarId ? TREE_SITTER_STATE.languages[grammarId] : undefined;
  if (!language) {
    return collectViaAstLite(workspaceRoot, filePath, symbol);
  }

  try {
    return collectViaTreeSitter(workspaceRoot, filePath, symbol, language);
  } catch {
    return collectViaAstLite(workspaceRoot, filePath, symbol);
  }
}

/**
 * True when a string looks like a dumped full source file (heuristic guard aid).
 * Intentionally conservative: multi-line + substantial length.
 */
export function looksLikeFullFileDump(
  text: string,
  opts?: { min_lines?: number; min_chars?: number },
): boolean {
  const minLines = opts?.min_lines ?? 8;
  const minChars = opts?.min_chars ?? 200;
  if (text.length < minChars) return false;
  const lines = text.split(/\r?\n/).length;
  return lines >= minLines;
}

/** Top-level declaration / import unit for AST-aware merge (V2-ORCH-02). */
export interface DeclarationUnit {
  /** Stable merge key (symbol name or import:<module>). */
  key: string;
  kind: SymbolKind | "import" | "statement";
  /** Inclusive byte offsets into the source string. */
  start_index: number;
  end_index: number;
  text: string;
}

export interface DeclarationExtractResult {
  engine: SymbolMapEngine;
  units: DeclarationUnit[];
  /** Source before the first unit (comments / shebang / blank). */
  preamble: string;
  /** Trailing whitespace after the last unit. */
  trailer: string;
}

function importKey(node: Node): string {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && (child.type === "string" || child.type === "string_fragment")) {
      return `import:${child.text.replace(/^['"]|['"]$/g, "")}`;
    }
  }
  return `import:${node.startIndex}:${node.endIndex}`;
}

function topLevelUnitKey(node: Node): { key: string; kind: DeclarationUnit["kind"] } | null {
  if (node.type === "import_statement") {
    return { key: importKey(node), kind: "import" };
  }

  if (node.type === "export_statement") {
    let decl = node.childForFieldName("declaration");
    if (!decl) {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (
          child &&
          (DECL_NODE_TYPES.has(child.type) ||
            child.type === "lexical_declaration" ||
            child.type === "variable_declaration")
        ) {
          decl = child;
          break;
        }
      }
    }
    if (decl) {
      const inner = topLevelUnitKey(decl);
      if (inner) return inner;
    }
    // export { a, b } from '…' / export * from '…'
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child && (child.type === "string" || child.type === "string_fragment")) {
        return { key: `export-from:${child.text.replace(/^['"]|['"]$/g, "")}`, kind: "statement" };
      }
    }
    return { key: `export:${node.startIndex}`, kind: "statement" };
  }

  if (DECL_NODE_TYPES.has(node.type)) {
    const nameNode = node.childForFieldName("name");
    const kind = NODE_TYPE_TO_KIND[node.type];
    if (nameNode && kind) {
      return { key: nameNode.text, kind };
    }
  }

  if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
    const keys: string[] = [];
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child?.type === "variable_declarator") {
        const nameNode = child.childForFieldName("name");
        if (nameNode) keys.push(nameNode.text);
      }
    }
    if (keys.length === 1) {
      return { key: keys[0]!, kind: "const" };
    }
    if (keys.length > 1) {
      return { key: `vars:${keys.join(",")}`, kind: "const" };
    }
  }

  if (node.type === "expression_statement" || node.type === "empty_statement") {
    return null;
  }

  // Fallback: keep unnamed top-level statements addressable but non-mergeable by name collision.
  return { key: `stmt:${node.type}:${node.startIndex}`, kind: "statement" };
}

/**
 * Extract ordered top-level declaration units from an in-memory source string.
 * Uses the shared web-tree-sitter runtime (no second Parser.init).
 */
export function extractDeclarationUnitsFromSource(
  source: string,
  filePath: string,
): DeclarationExtractResult | null {
  if (!TREE_SITTER_STATE.ok) {
    return null;
  }
  const grammarId = grammarForPath(filePath);
  const language = grammarId ? TREE_SITTER_STATE.languages[grammarId] : undefined;
  if (!language) {
    return null;
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return null;
  }

  try {
    const root = tree.rootNode;
    const units: DeclarationUnit[] = [];
    for (let i = 0; i < root.namedChildCount; i++) {
      const child = root.namedChild(i);
      if (!child) continue;
      const meta = topLevelUnitKey(child);
      if (!meta) continue;
      units.push({
        key: meta.key,
        kind: meta.kind,
        start_index: child.startIndex,
        end_index: child.endIndex,
        text: source.slice(child.startIndex, child.endIndex),
      });
    }

    const firstStart = units[0]?.start_index ?? source.length;
    const lastEnd = units.length > 0 ? units[units.length - 1]!.end_index : 0;
    return {
      engine: "tree-sitter",
      units,
      preamble: source.slice(0, firstStart),
      trailer: source.slice(lastEnd),
    };
  } finally {
    tree.delete();
    parser.delete();
  }
}
