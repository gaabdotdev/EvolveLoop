/**
 * EvolveLoop V2.5 - Unified Knowledge System (UKS Core)
 * AST Syntactic Extractor (Native In-Process Implementation)
 * 
 * Replaces external Graphify dependency with a lightweight, ultra-fast
 * syntactic analyzer for TypeScript, JavaScript, and Python files.
 * Extracts symbols (classes, interfaces, types, functions), line ranges,
 * inheritance graphs, and import/export relations in < 2 seconds with < 500 KB payload.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson, computeSha256, assertPathConfined } from "./storage-core.js";

export type SymbolKind = "class" | "interface" | "type" | "enum" | "function" | "method";

export interface SymbolDefinition {
    name: string;
    kind: SymbolKind;
    file_path: string;
    start_line: number;
    end_line: number;
    signature: string;
    is_exported: boolean;
    heritage?: {
        extends?: string[];
        implements?: string[];
    };
    docstring?: string;
}

export interface ImportRelation {
    file_path: string;
    line: number;
    module_specifier: string;
    imported_symbols: string[];
    is_type_only: boolean;
}

export interface FileAstMetadata {
    file_path: string;
    sha256: string;
    line_count: number;
    symbols: SymbolDefinition[];
    imports: ImportRelation[];
    exports: string[];
}

export interface ProjectAstIndex {
    schema_version: string;
    indexed_at: string;
    workspace_root: string;
    stats: {
        total_files_scanned: number;
        total_symbols: number;
        total_imports: number;
        duration_ms: number;
        index_size_bytes: number;
    };
    symbols: Record<string, SymbolDefinition[]>;
    files: Record<string, {
        sha256: string;
        line_count: number;
        symbol_names: string[];
        import_modules: string[];
        exports: string[];
    }>;
}

export interface ScanOptions {
    workspace_root?: string;
    include_extensions?: string[];
    exclude_patterns?: (string | RegExp)[];
    max_file_size_kb?: number;
}

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];
const DEFAULT_EXCLUDE_DIRS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".test-harness",
    ".cache",
    ".venv",
    "venv",
    "__pycache__"
];

/**
 * Finds the end line of a TypeScript/JavaScript block by counting curly brackets.
 */
function findBracketEndLine(lines: string[], startIdx: number): number {
    let depth = 0;
    let foundOpen = false;

    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];

        // Strip single-line comments and string literals to prevent bracket miscounting
        const sanitized = line
            .replace(/\/\/.*$/, "")
            .replace(/(["'`])(?:\\.|[^\\])*?\1/g, "");

        for (const char of sanitized) {
            if (char === "{") {
                depth++;
                foundOpen = true;
            } else if (char === "}") {
                depth--;
                if (foundOpen && depth <= 0) {
                    return i + 1; // 1-based line number
                }
            }
        }

        // If it's a single-line statement (e.g. type Foo = string;) without open brace
        if (!foundOpen && sanitized.includes(";") && i === startIdx) {
            return i + 1;
        }
    }

    return Math.min(startIdx + 1, lines.length);
}

/**
 * Finds the end line of a Python indented block.
 */
function findPythonEndLine(lines: string[], startIdx: number): number {
    const startLine = lines[startIdx];
    const match = startLine.match(/^(\s*)/);
    const baseIndent = match ? match[1].length : 0;

    let endLine = startIdx + 1;

    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || line.trim().startsWith("#")) {
            continue; // Ignore blank lines and comments
        }

        const indentMatch = line.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1].length : 0;

        if (currentIndent <= baseIndent) {
            return endLine;
        }
        endLine = i + 1;
    }

    return endLine;
}

/**
 * Extracts TypeScript / JavaScript symbols and imports from source code.
 */
function extractTsJsAst(content: string, relativePath: string): { symbols: SymbolDefinition[]; imports: ImportRelation[]; exports: string[] } {
    const lines = content.split("\n");
    const symbols: SymbolDefinition[] = [];
    const imports: ImportRelation[] = [];
    const exports: string[] = [];

    // Import matchers
    const importRegex = /(?:^|\n)\s*import\s+(?:type\s+)?(?:(\*\s+as\s+[\w$]+|[\w$]+|\{[^}]*\})\s+from\s+)?['"]([^'"]+)['"]/g;
    let importMatch: RegExpExecArray | null;

    while ((importMatch = importRegex.exec(content)) !== null) {
        const rawImported = importMatch[1] || "";
        const moduleSpecifier = importMatch[2];
        const isTypeOnly = importMatch[0].includes("import type");

        // Calculate line number
        const precedingText = content.substring(0, importMatch.index);
        const lineNumber = precedingText.split("\n").length;

        const importedSymbols: string[] = [];
        if (rawImported.startsWith("{")) {
            const inner = rawImported.replace(/[{}]/g, "");
            inner.split(",").forEach(s => {
                const clean = s.trim().split(/\s+as\s+/)[0].trim();
                if (clean) importedSymbols.push(clean);
            });
        } else if (rawImported) {
            importedSymbols.push(rawImported.trim());
        }

        imports.push({
            file_path: relativePath,
            line: lineNumber,
            module_specifier: moduleSpecifier,
            imported_symbols: importedSymbols,
            is_type_only: isTypeOnly
        });
    }

    // Line-by-line symbol scanner
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
            continue;
        }

        const isExported = /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?/.test(trimmed) && trimmed.startsWith("export");

        // 1. Class
        const classMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([\w$]+)(?:\s+extends\s+([\w$]+))?(?:\s+implements\s+([^\{]+))?/);
        if (classMatch) {
            const name = classMatch[1];
            const extendsClass = classMatch[2] ? [classMatch[2].trim()] : undefined;
            const implementsList = classMatch[3] ? classMatch[3].split(",").map(s => s.trim()) : undefined;
            const endLine = findBracketEndLine(lines, i);

            symbols.push({
                name,
                kind: "class",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.split("{")[0].trim(),
                is_exported: isExported,
                heritage: { extends: extendsClass, implements: implementsList }
            });
            if (isExported) exports.push(name);
            continue;
        }

        // 2. Interface
        const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([\w$]+)(?:\s+extends\s+([^\{]+))?/);
        if (interfaceMatch) {
            const name = interfaceMatch[1];
            const extendsList = interfaceMatch[2] ? interfaceMatch[2].split(",").map(s => s.trim()) : undefined;
            const endLine = findBracketEndLine(lines, i);

            symbols.push({
                name,
                kind: "interface",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.split("{")[0].trim(),
                is_exported: isExported,
                heritage: { extends: extendsList }
            });
            if (isExported) exports.push(name);
            continue;
        }

        // 3. Type alias
        const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([\w$]+)(?:<[^>]+>)?\s*=/);
        if (typeMatch) {
            const name = typeMatch[1];
            let endLine = i + 1;
            if (trimmed.includes("{")) {
                endLine = findBracketEndLine(lines, i);
            } else {
                for (let j = i; j < lines.length; j++) {
                    if (lines[j].includes(";")) {
                        endLine = j + 1;
                        break;
                    }
                }
            }

            symbols.push({
                name,
                kind: "type",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.trim(),
                is_exported: isExported
            });
            if (isExported) exports.push(name);
            continue;
        }

        // 4. Enum
        const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([\w$]+)/);
        if (enumMatch) {
            const name = enumMatch[1];
            const endLine = findBracketEndLine(lines, i);

            symbols.push({
                name,
                kind: "enum",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.split("{")[0].trim(),
                is_exported: isExported
            });
            if (isExported) exports.push(name);
            continue;
        }

        // 5. Function declaration
        const funcMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([\w$]+)\s*(?:<[^>]+>)?\s*\(/);
        if (funcMatch) {
            const name = funcMatch[1];
            const endLine = findBracketEndLine(lines, i);

            symbols.push({
                name,
                kind: "function",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.split("{")[0].trim(),
                is_exported: isExported
            });
            if (isExported) exports.push(name);
            continue;
        }

        // 6. Arrow / Const Function export
        const arrowMatch = trimmed.match(/^(?:export\s+)?const\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::\s*[^=]+)?\s*=>/);
        if (arrowMatch) {
            const name = arrowMatch[1];
            const endLine = trimmed.includes("{") ? findBracketEndLine(lines, i) : i + 1;

            symbols.push({
                name,
                kind: "function",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.split("=>")[0].trim() + " => ...",
                is_exported: isExported
            });
            if (isExported) exports.push(name);
            continue;
        }
    }

    return { symbols, imports, exports };
}

/**
 * Extracts Python symbols and imports from source code.
 */
function extractPythonAst(content: string, relativePath: string): { symbols: SymbolDefinition[]; imports: ImportRelation[]; exports: string[] } {
    const lines = content.split("\n");
    const symbols: SymbolDefinition[] = [];
    const imports: ImportRelation[] = [];
    const exports: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("#")) continue;

        // Import statements
        const importFromMatch = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
        if (importFromMatch) {
            const mod = importFromMatch[1];
            const rawSymbols = importFromMatch[2].replace(/[()]/g, "").split(",").map(s => s.trim().split(/\s+as\s+/)[0]);
            imports.push({
                file_path: relativePath,
                line: i + 1,
                module_specifier: mod,
                imported_symbols: rawSymbols.filter(Boolean),
                is_type_only: false
            });
            continue;
        }

        const importSimpleMatch = trimmed.match(/^import\s+([\w.,\s]+)$/);
        if (importSimpleMatch) {
            const rawMods = importSimpleMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]);
            rawMods.forEach(mod => {
                imports.push({
                    file_path: relativePath,
                    line: i + 1,
                    module_specifier: mod,
                    imported_symbols: [mod],
                    is_type_only: false
                });
            });
            continue;
        }

        // Class definition
        const classMatch = trimmed.match(/^class\s+([\w$]+)(?:\(([^)]*)\))?:/);
        if (classMatch) {
            const name = classMatch[1];
            const bases = classMatch[2] ? classMatch[2].split(",").map(b => b.trim()).filter(Boolean) : undefined;
            const endLine = findPythonEndLine(lines, i);

            symbols.push({
                name,
                kind: "class",
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.trim(),
                is_exported: !name.startsWith("_"),
                heritage: { extends: bases }
            });
            if (!name.startsWith("_")) exports.push(name);
            continue;
        }

        // Function / Method definition
        const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([\w$]+)\s*\(/);
        if (funcMatch) {
            const name = funcMatch[1];
            const endLine = findPythonEndLine(lines, i);
            const indentMatch = line.match(/^(\s*)/);
            const indentLevel = indentMatch ? indentMatch[1].length : 0;
            const kind: SymbolKind = indentLevel > 0 ? "method" : "function";

            symbols.push({
                name,
                kind,
                file_path: relativePath,
                start_line: i + 1,
                end_line: endLine,
                signature: line.trim(),
                is_exported: !name.startsWith("_")
            });
            if (!name.startsWith("_") && kind === "function") exports.push(name);
            continue;
        }
    }

    return { symbols, imports, exports };
}

/**
 * Scans a single source file and extracts its AST metadata.
 */
export async function scanFile(filePath: string, workspaceRoot: string): Promise<FileAstMetadata | null> {
    const resolvedPath = path.resolve(filePath);
    assertPathConfined(resolvedPath, workspaceRoot);

    if (!fs.existsSync(resolvedPath)) {
        return null;
    }

    const content = await fs.promises.readFile(resolvedPath, "utf8");
    const relativePath = path.relative(workspaceRoot, resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const sha256 = computeSha256(content);
    const lineCount = content.split("\n").length;

    let result: { symbols: SymbolDefinition[]; imports: ImportRelation[]; exports: string[] };

    if (ext === ".py") {
        result = extractPythonAst(content, relativePath);
    } else {
        result = extractTsJsAst(content, relativePath);
    }

    return {
        file_path: relativePath,
        sha256,
        line_count: lineCount,
        symbols: result.symbols,
        imports: result.imports,
        exports: result.exports
    };
}

/**
 * Scans a directory recursively and builds the complete ProjectAstIndex.
 */
export async function scanDirectory(
    targetDir: string,
    options: ScanOptions = {}
): Promise<ProjectAstIndex> {
    const startTime = Date.now();
    const root = path.resolve(options.workspace_root || targetDir);
    const extensions = options.include_extensions || DEFAULT_EXTENSIONS;
    const maxFileSize = (options.max_file_size_kb || 2048) * 1024;

    const symbolsMap: Record<string, SymbolDefinition[]> = {};
    const filesMap: Record<string, {
        sha256: string;
        line_count: number;
        symbol_names: string[];
        import_modules: string[];
        exports: string[];
    }> = {};

    let totalFilesScanned = 0;
    let totalSymbols = 0;
    let totalImports = 0;

    async function walk(currentDir: string) {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (DEFAULT_EXCLUDE_DIRS.includes(entry.name) || entry.name.startsWith(".")) {
                    continue;
                }
                await walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!extensions.includes(ext)) {
                    continue;
                }

                const stats = await fs.promises.stat(fullPath);
                if (stats.size > maxFileSize) {
                    continue; // Skip oversized files
                }

                const fileMeta = await scanFile(fullPath, root);
                if (fileMeta) {
                    totalFilesScanned++;
                    totalImports += fileMeta.imports.length;

                    const symbolNames: string[] = [];

                    for (const sym of fileMeta.symbols) {
                        totalSymbols++;
                        symbolNames.push(sym.name);
                        if (!symbolsMap[sym.name]) {
                            symbolsMap[sym.name] = [];
                        }
                        symbolsMap[sym.name].push(sym);
                    }

                    filesMap[fileMeta.file_path] = {
                        sha256: fileMeta.sha256,
                        line_count: fileMeta.line_count,
                        symbol_names: symbolNames,
                        import_modules: Array.from(new Set(fileMeta.imports.map(i => i.module_specifier))),
                        exports: fileMeta.exports
                    };
                }
            }
        }
    }

    await walk(targetDir);

    const durationMs = Date.now() - startTime;
    const serializedForSize = JSON.stringify({ symbols: symbolsMap, files: filesMap });
    const sizeBytes = Buffer.byteLength(serializedForSize, "utf8");

    return {
        schema_version: "2.5.0",
        indexed_at: new Date().toISOString(),
        workspace_root: root,
        stats: {
            total_files_scanned: totalFilesScanned,
            total_symbols: totalSymbols,
            total_imports: totalImports,
            duration_ms: durationMs,
            index_size_bytes: sizeBytes
        },
        symbols: symbolsMap,
        files: filesMap
    };
}

/**
 * Builds the AST index and persists it atomically to .data/project-ast.json.
 */
export async function buildAndPersistAstIndex(
    workspaceRoot: string,
    outputFilePath?: string
): Promise<ProjectAstIndex> {
    const root = path.resolve(workspaceRoot);
    const outFile = outputFilePath ? path.resolve(outputFilePath) : path.join(root, ".data/project-ast.json");

    assertPathConfined(outFile, root);

    // Target scan folders: orchestrator/src and scripts/v2.5
    const index = await scanDirectory(path.join(root, "orchestrator/src"), {
        workspace_root: root
    });

    await writeAtomicJson(outFile, index);
    return index;
}

/**
 * Queries the AST index for symbol definitions.
 */
export function findSymbol(index: ProjectAstIndex, symbolName: string): SymbolDefinition[] {
    return index.symbols[symbolName] || [];
}

/**
 * Finds all classes implementing a specific interface name.
 */
export function findImplementations(index: ProjectAstIndex, interfaceName: string): SymbolDefinition[] {
    const results: SymbolDefinition[] = [];

    for (const symList of Object.values(index.symbols)) {
        for (const sym of symList) {
            if (sym.kind === "class" && sym.heritage?.implements?.includes(interfaceName)) {
                results.push(sym);
            }
        }
    }

    return results;
}
