/**
 * Deterministic silent workspace scan (V0 Bloco 2).
 * Facts only — never ask Grill-Me what this already answers.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".evolveloop",
  ".venv",
  "__pycache__",
  ".tox",
  "target",
  ".next",
  ".turbo",
]);

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"]);

const SYMBOL_RE =
  /(?:(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+|def\s+|fn\s+|func\s+)([A-Za-z_][A-Za-z0-9_]*)/g;

export interface SilentScanResult {
  workspace_root: string;
  scanned_at: string;
  git: {
    available: boolean;
    branch?: string;
    status_porcelain: string[];
    dirty: boolean;
  };
  languages: string[];
  package_managers: string[];
  package_name?: string;
  tree: string[];
  symbols: Array<{ file: string; name: string }>;
  context_block: string;
}

function safeExec(cmd: string, args: string[], cwd: string): string | undefined {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return undefined;
  }
}

function detectLanguages(root: string): { languages: string[]; package_managers: string[]; package_name?: string } {
  const languages = new Set<string>();
  const package_managers = new Set<string>();
  let package_name: string | undefined;

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    languages.add("javascript/typescript");
    package_managers.add("npm");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string; packageManager?: string };
      if (pkg.name) package_name = pkg.name;
      if (pkg.packageManager?.startsWith("pnpm")) package_managers.add("pnpm");
      if (pkg.packageManager?.startsWith("yarn")) package_managers.add("yarn");
    } catch {
      /* ignore corrupt package.json */
    }
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) package_managers.add("pnpm");
  if (existsSync(join(root, "yarn.lock"))) package_managers.add("yarn");
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    package_managers.add("bun");
  }
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) {
    languages.add("python");
  }
  if (existsSync(join(root, "Cargo.toml"))) languages.add("rust");
  if (existsSync(join(root, "go.mod"))) languages.add("go");
  if (existsSync(join(root, "composer.json"))) languages.add("php");

  return {
    languages: [...languages].sort(),
    package_managers: [...package_managers].sort(),
    package_name,
  };
}

function walkTree(root: string, maxEntries = 80, maxDepth = 3): string[] {
  const out: string[] = [];

  function walk(dir: string, depth: number): void {
    if (out.length >= maxEntries || depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= maxEntries) return;
      if (name.startsWith(".") && name !== ".cursor" && name !== ".agents") continue;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      const rel = relative(root, full) || ".";
      if (st.isDirectory()) {
        out.push(`${rel}/`);
        walk(full, depth + 1);
      } else {
        out.push(rel);
      }
    }
  }

  walk(root, 0);
  return out;
}

function collectSymbols(root: string, maxFiles = 40, maxSymbols = 120): Array<{ file: string; name: string }> {
  const files: string[] = [];

  function walk(dir: string, depth: number): void {
    if (files.length >= maxFiles || depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) return;
      if (SKIP_DIRS.has(name) || (name.startsWith(".") && name !== ".cursor")) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else if (CODE_EXTS.has(extname(name)) && st.size < 200_000) {
        files.push(full);
      }
    }
  }

  walk(root, 0);
  const symbols: Array<{ file: string; name: string }> = [];
  for (const file of files) {
    if (symbols.length >= maxSymbols) break;
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const rel = relative(root, file);
    SYMBOL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SYMBOL_RE.exec(text)) !== null) {
      symbols.push({ file: rel, name: m[1]! });
      if (symbols.length >= maxSymbols) break;
    }
  }
  return symbols;
}

function buildContextBlock(scan: Omit<SilentScanResult, "context_block">): string {
  const lines = [
    "WORKSPACE_SCAN (deterministic; do not re-ask):",
    `root=${scan.workspace_root}`,
    `git.branch=${scan.git.branch ?? "n/a"} dirty=${scan.git.dirty} changes=${scan.git.status_porcelain.length}`,
    `languages=${scan.languages.join(",") || "unknown"}`,
    `package_managers=${scan.package_managers.join(",") || "none"}`,
    scan.package_name ? `package_name=${scan.package_name}` : undefined,
    `tree_sample=${scan.tree.slice(0, 24).join("|")}`,
    `symbols_sample=${scan.symbols
      .slice(0, 20)
      .map((s) => `${basename(s.file)}:${s.name}`)
      .join("|")}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function silentScan(workspaceRoot: string): SilentScanResult {
  const root = resolve(workspaceRoot);
  const gitAvailable = existsSync(join(root, ".git"));
  const branch = gitAvailable ? safeExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], root) : undefined;
  const porcelainRaw = gitAvailable ? safeExec("git", ["status", "--porcelain"], root) : undefined;
  const status_porcelain = porcelainRaw
    ? porcelainRaw
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(Boolean)
    : [];

  const { languages, package_managers, package_name } = detectLanguages(root);
  const tree = walkTree(root);
  const symbols = collectSymbols(root);

  const base: Omit<SilentScanResult, "context_block"> = {
    workspace_root: root,
    scanned_at: new Date().toISOString(),
    git: {
      available: gitAvailable,
      branch,
      status_porcelain,
      dirty: status_porcelain.length > 0,
    },
    languages,
    package_managers,
    package_name,
    tree,
    symbols,
  };

  return { ...base, context_block: buildContextBlock(base) };
}
