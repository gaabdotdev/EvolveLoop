/**
 * Unknown-repo exploration — structure, languages, entrypoints, tests, config.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export interface RepoExploration {
  kind: "RepoExploration";
  root: string;
  languages: string[];
  package_manager?: string;
  entrypoints: string[];
  test_files: string[];
  config_files: string[];
  modules: string[];
  conventions: string[];
  file_count: number;
  limitations: string[];
}

const LANG: Record<string, string> = {
  ".js": "javascript",
  ".ts": "typescript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".json": "json",
};

function walk(root: string, base = "", out: string[] = []): string[] {
  const dir = join(root, base);
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const rel = base ? join(base, name) : name;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

export function exploreRepository(root: string): RepoExploration {
  const files = walk(root);
  const langs = new Set<string>();
  for (const f of files) {
    const l = LANG[extname(f)];
    if (l) langs.add(l);
  }
  const test_files = files.filter((f) => /test|spec/i.test(f));
  const config_files = files.filter((f) =>
    /(^|\/)(package\.json|tsconfig|config\.|Cargo\.toml|go\.mod|pyproject)/i.test(f),
  );
  const entrypoints = files.filter((f) =>
    /(^|\/)(index|main|app|server|router)\.(js|ts|mjs|cjs)$/i.test(f),
  );
  const modules = [...new Set(files.map((f) => f.split("/")[0]).filter(Boolean))];
  const conventions: string[] = [];
  if (existsSync(join(root, "package.json"))) {
    conventions.push("node_esm_or_cjs");
    try {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
      if (pkg.type === "module") conventions.push("esm");
      if (pkg.scripts?.test) conventions.push(`test_script:${pkg.scripts.test}`);
    } catch {
      /* ignore */
    }
  }
  if (test_files.some((f) => f.startsWith("test/"))) conventions.push("tests_in_test_dir");

  return {
    kind: "RepoExploration",
    root,
    languages: [...langs].sort(),
    package_manager: existsSync(join(root, "package.json")) ? "npm" : undefined,
    entrypoints,
    test_files,
    config_files,
    modules,
    conventions,
    file_count: files.length,
    limitations: [
      "Heuristic exploration only — not a full semantic AST index",
      "Does not execute project code during explore",
    ],
  };
}
