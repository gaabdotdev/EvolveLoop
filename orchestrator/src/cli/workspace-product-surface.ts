/**
 * V4.2 P1-1 — Trocar Workspace (produto = cwd/.evolveloop/).
 * Thin CLI: listar recentes + confirmar path; abrir via --workspace.
 * ≠ `evolve workspace` (integration/worktree).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { defaultOpsDir, ProjectRegistry, resolveOpsDataPaths } from "../v3/ops/index.js";
import { defaultStateDbPath } from "../v3/state-db/store.js";

const MAX_RECENT = 12;

export interface RecentWorkspaceEntry {
  path: string;
  last_used_at: string;
  has_state_db: boolean;
  source: "recent" | "project" | "cwd";
  project_id?: string;
  name?: string;
}

export interface WorkspaceProductView {
  active: string;
  state_db_path: string;
  state_db_exists: boolean;
  entries: RecentWorkspaceEntry[];
  lines: string[];
  isolation_note: string;
}

function recentFilePath(home?: string): string {
  const h = home ?? process.env.HOME ?? "/tmp";
  const xdg = process.env.XDG_STATE_HOME;
  const root = xdg ? join(xdg, "evolveloop") : join(h, ".evolveloop");
  return join(root, "recent-workspaces.json");
}

function readRecent(home?: string): Array<{ path: string; last_used_at: string }> {
  const p = recentFilePath(home);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as {
      workspaces?: Array<{ path: string; last_used_at: string }>;
    };
    return Array.isArray(raw.workspaces) ? raw.workspaces : [];
  } catch {
    return [];
  }
}

/** Record a workspace path as recently used (thin local ledger). */
export function recordRecentWorkspace(
  workspaceRoot: string,
  opts?: { home?: string; now?: string },
): string {
  const abs = resolve(workspaceRoot);
  const now = opts?.now ?? new Date().toISOString();
  const file = recentFilePath(opts?.home);
  mkdirSync(dirname(file), { recursive: true });
  const prev = readRecent(opts?.home).filter((e) => resolve(e.path) !== abs);
  const next = [{ path: abs, last_used_at: now }, ...prev].slice(0, MAX_RECENT);
  writeFileSync(
    file,
    JSON.stringify({ kind: "RecentWorkspaces", workspaces: next }, null, 2),
    "utf-8",
  );
  return file;
}

function projectEntries(opsDir?: string): RecentWorkspaceEntry[] {
  try {
    const root = resolve(opsDir ?? defaultOpsDir());
    const registry = new ProjectRegistry(resolveOpsDataPaths(root));
    return registry
      .list()
      .filter((p) => p.availability !== "ARCHIVED")
      .map((p) => ({
        path: p.canonical_path,
        last_used_at: p.updated_at,
        has_state_db: existsSync(defaultStateDbPath(p.canonical_path)),
        source: "project" as const,
        project_id: p.project_id,
        name: p.name,
      }));
  } catch {
    return [];
  }
}

/**
 * List recent + project registry paths; always include active cwd.
 */
export function buildWorkspaceProductView(
  activeWorkspace: string,
  opts?: { home?: string; ops_dir?: string; limit?: number },
): WorkspaceProductView {
  const active = resolve(activeWorkspace);
  const limit = opts?.limit ?? MAX_RECENT;
  const state_db_path = defaultStateDbPath(active);
  const isolation_note =
    "Isolamento: cada Workspace tem o seu state.db sob <path>/.evolveloop/ — Tasks/contratos não vazam entre paths.";

  const byPath = new Map<string, RecentWorkspaceEntry>();

  const push = (e: RecentWorkspaceEntry) => {
    const key = resolve(e.path);
    const existing = byPath.get(key);
    if (!existing || existing.last_used_at < e.last_used_at) {
      byPath.set(key, { ...e, path: key });
    }
  };

  push({
    path: active,
    last_used_at: new Date().toISOString(),
    has_state_db: existsSync(state_db_path),
    source: "cwd",
    name: "(ativo)",
  });

  for (const r of readRecent(opts?.home)) {
    push({
      path: r.path,
      last_used_at: r.last_used_at,
      has_state_db: existsSync(defaultStateDbPath(r.path)),
      source: "recent",
    });
  }
  for (const p of projectEntries(opts?.ops_dir)) push(p);

  const entries = [...byPath.values()]
    .sort((a, b) => (a.last_used_at < b.last_used_at ? 1 : -1))
    .slice(0, limit);

  const lines: string[] = [
    "Workspace (produto)",
    `Ativo: ${active}`,
    `state.db: ${state_db_path}${existsSync(state_db_path) ? "" : " (ausente)"}`,
    "",
    "Recentes / registados:",
  ];
  if (entries.length === 0) {
    lines.push("  (vazio)");
  } else {
    entries.forEach((e, i) => {
      const mark = resolve(e.path) === active ? "*" : " ";
      const label = e.name ? ` · ${e.name}` : "";
      const db = e.has_state_db ? "state.db" : "sem state";
      lines.push(
        `  ${mark}${i + 1}. ${e.path}${label} [${e.source}/${db}]`,
      );
    });
  }
  lines.push("");
  lines.push("Abrir:  evolve --workspace <path>");
  lines.push("        evolve use <path>     # confirma + regista recente");
  lines.push("≠ evolve workspace (integration/worktree V3.5)");
  lines.push(isolation_note);

  return {
    active,
    state_db_path,
    state_db_exists: existsSync(state_db_path),
    entries,
    lines,
    isolation_note,
  };
}

export function confirmWorkspaceUse(
  targetPath: string,
  opts?: { home?: string; record?: boolean },
): {
  ok: boolean;
  path: string;
  state_db_path: string;
  lines: string[];
  exitCode: number;
} {
  const abs = resolve(targetPath);
  if (!existsSync(abs)) {
    return {
      ok: false,
      path: abs,
      state_db_path: defaultStateDbPath(abs),
      exitCode: 1,
      lines: [
        `Workspace: path não existe: ${abs}`,
        "Crie o diretório ou escolha outro path.",
        "Uso: evolve use <path>  |  evolve --workspace <path>",
      ],
    };
  }
  let canonical = abs;
  try {
    canonical = realpathSync(abs);
  } catch {
    /* keep abs */
  }
  if (opts?.record !== false) {
    recordRecentWorkspace(canonical, { home: opts?.home });
  }
  const state_db_path = defaultStateDbPath(canonical);
  const lines = [
    "Workspace ativo confirmado",
    `Path: ${canonical}`,
    `state.db: ${state_db_path}${existsSync(state_db_path) ? "" : " (ainda não criado — evolve setup)"}`,
    "",
    "Abrir neste path:",
    `  evolve --workspace ${canonical}`,
    "  # ou: cd " + canonical + " && evolve",
    "",
    "Isolamento: state.db scoped a este path — não partilha Tasks com outros Workspaces.",
    "≠ evolve workspace (integration/worktree).",
  ];
  return { ok: true, path: canonical, state_db_path, lines, exitCode: 0 };
}

function usePositionals(argv: string[]): string[] {
  const idx = argv.findIndex((a) => a === "use" || a === "switch");
  if (idx < 0) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < argv.length; i++) {
    const t = argv[i]!;
    if (t.startsWith("--")) {
      if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * Handle `evolve use|switch …`.
 */
export function handleWorkspaceProductSurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "use" && args.group !== "switch") return { handled: false };

  const cwd = resolve(args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));
  const positionals = usePositionals(opts?.argv ?? process.argv);
  const cmd = (positionals[0] ?? args.command ?? "list").toLowerCase();

  if (cmd === "help" || cmd === "true") {
    console.log(
      [
        "evolve use — trocar / confirmar Workspace produto (V4.2)",
        "alias: evolve switch",
        "",
        "  evolve use list                 # recentes + project registry",
        "  evolve use active               # path ativo (cwd / --workspace)",
        "  evolve use <path>               # confirma + regista recente",
        "  evolve use --workspace <path>   # idem",
        "",
        "Abrir TUI: evolve --workspace <path>",
        "≠ evolve workspace = integration/worktree (use: evolve integration …)",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "list" || cmd === "ls") {
    const view = buildWorkspaceProductView(args.workspace ? resolve(args.workspace) : cwd, {
      ops_dir: args["ops-dir"],
    });
    if (args.format === "json") print(view);
    else console.log(view.lines.join("\n"));
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "active" || cmd === "show" || cmd === "current") {
    const active = resolve(args.workspace ?? cwd);
    const view = buildWorkspaceProductView(active, { ops_dir: args["ops-dir"] });
    const slim = {
      active: view.active,
      state_db_path: view.state_db_path,
      state_db_exists: view.state_db_exists,
      isolation_note: view.isolation_note,
      lines: [
        `Workspace ativo: ${view.active}`,
        `state.db: ${view.state_db_path}${view.state_db_exists ? "" : " (ausente)"}`,
        view.isolation_note,
        "Trocar: evolve use <path>  ·  Abrir: evolve --workspace <path>",
      ],
    };
    if (args.format === "json") print(slim);
    else console.log(slim.lines.join("\n"));
    return { handled: true, exitCode: 0 };
  }

  const reserved = new Set(["list", "ls", "active", "show", "current", "help", "true"]);
  // Path: positional `evolve use <path>` OR `evolve use --workspace <path>` (command=help)
  const maybePath = !reserved.has(cmd)
    ? positionals[0] ?? args.workspace
    : cmd === "help" || cmd === "true"
      ? args.workspace
      : undefined;

  if (maybePath) {
    const confirmed = confirmWorkspaceUse(maybePath);
    if (args.format === "json") print(confirmed);
    else console.log(confirmed.lines.join("\n"));
    return { handled: true, exitCode: confirmed.exitCode };
  }

  // Default: list
  const view = buildWorkspaceProductView(args.workspace ? resolve(args.workspace) : cwd, {
    ops_dir: args["ops-dir"],
  });
  if (args.format === "json") print(view);
  else console.log(view.lines.join("\n"));
  return { handled: true, exitCode: 0 };
}

/** Alias group: integration → workspace (V3.5), with taxonomy note. */
export function normalizeWorkspaceIntegrationGroup(group: string): {
  group: string;
  aliased_from_integration: boolean;
} {
  if (group === "integration") {
    return { group: "workspace", aliased_from_integration: true };
  }
  return { group, aliased_from_integration: false };
}

export function integrationAliasNote(): string {
  return [
    "Nota: `evolve integration …` é alias de `evolve workspace …` (integration/worktree V3.5).",
    "Workspace produto (jornada) = cwd / --workspace · use: evolve use list|active|<path>.",
  ].join("\n");
}
