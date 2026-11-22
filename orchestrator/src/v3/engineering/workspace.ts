/**
 * Confined workspace mutations for Engineering Loop workers.
 * Uses realpath confinement — not a claim of full OS sandbox.
 *
 * V1-TOK-01: agent-facing reads are outlineFile + readLines only.
 * Unrestricted readFile is denied for workers; host/orchestrator uses readFileHost.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createAgentFileTools,
  denyUnrestrictedReadFile,
  outlineFile as sliceOutlineFile,
  readLines as sliceReadLines,
  type AgentFileTools,
  type OutlineFileResult,
  type ReadLinesResult,
  type ContextSlicingOptions,
} from "../token-economy/context-slicing.js";
import {
  selectToolsForMsoState,
  type LazyToolSchema,
} from "../token-economy/lazy-tools.js";
import {
  applySurgicalEdit,
  type SurgicalEditResult,
  type SurgicalEditSpec,
} from "../token-economy/surgical-edit.js";
import type { MsoState } from "../mso/states.js";

export class WorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "WorkspaceError";
  }
}

export class EngineeringWorkspace {
  readonly root: string;

  constructor(workspaceRoot: string) {
    mkdirSync(workspaceRoot, { recursive: true });
    this.root = realpathSync(workspaceRoot);
  }

  private resolveSafe(relOrAbs: string): string {
    const candidate = resolve(this.root, relOrAbs);
    if (existsSync(candidate)) {
      const real = realpathSync(candidate);
      if (!real.startsWith(this.root)) throw new WorkspaceError("ESCAPE", real);
      return real;
    }
    const parent = dirname(candidate);
    mkdirSync(parent, { recursive: true });
    const parentReal = realpathSync(parent);
    if (!parentReal.startsWith(this.root)) throw new WorkspaceError("ESCAPE", parentReal);
    return candidate;
  }

  writeFile(relPath: string, content: string): string {
    const full = this.resolveSafe(relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
    return full;
  }

  /**
   * @deprecated V1-TOK-01 — unrestricted full-file read is denied for agents/workers.
   * Use outlineFile + readLines, or readFileHost for orchestrator-internal loads.
   */
  readFile(relPath: string): never {
    return denyUnrestrictedReadFile(relPath);
  }

  /**
   * Orchestrator/host-only full read (evaluation, review heuristics).
   * Not part of the agent tool surface.
   */
  readFileHost(relPath: string): string {
    return readFileSync(this.resolveSafe(relPath), "utf-8");
  }

  /** Agent-facing: signatures + line map (no full body). */
  outlineFile(relPath: string): OutlineFileResult {
    return sliceOutlineFile(this.root, relPath);
  }

  /**
   * Agent-facing: inclusive line window, hard-capped at READ_LINES_HARD_CAP.
   * Default policy rejects ranges larger than the cap.
   */
  readLines(
    relPath: string,
    start: number,
    end: number,
    opts?: ContextSlicingOptions,
  ): ReadLinesResult {
    return sliceReadLines(this.root, relPath, start, end, opts);
  }

  /** Bound agent tools for this workspace (no readFile). */
  agentFileTools(): AgentFileTools {
    return createAgentFileTools(this.root);
  }

  /**
   * V1-TOK-07 — Lazy tool schemas for the current MSO state (≤4 tools).
   * Prefer this over injecting the full tool catalog into agent prompts.
   */
  agentToolsForMsoState(state: MsoState | string): LazyToolSchema[] {
    return selectToolsForMsoState(state);
  }

  /** V1-TOK-11 — Surgical REPLACE/DELETE with hash/offset validation. */
  applySurgicalEdit(relPath: string, spec: SurgicalEditSpec): SurgicalEditResult {
    return applySurgicalEdit(relPath, spec, this.root);
  }

  appendFile(relPath: string, content: string): string {
    const full = this.resolveSafe(relPath);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, "utf-8");
    return full;
  }

  exists(relPath: string): boolean {
    try {
      return existsSync(this.resolveSafe(relPath));
    } catch {
      return false;
    }
  }

  run(
    command: string,
    args: string[],
    opts?: { timeoutMs?: number },
  ): { status: number | null; stdout: string; stderr: string } {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: process.env.LANG,
      NODE_ENV: "test",
    };
    const run = spawnSync(command, args, {
      cwd: this.root,
      encoding: "utf-8",
      env,
      timeout: opts?.timeoutMs ?? 60_000,
      shell: false,
    });
    return {
      status: run.status,
      stdout: run.stdout ?? "",
      stderr: run.stderr ?? "",
    };
  }

  relativeFromRoot(absPath: string): string {
    return absPath.startsWith(this.root) ? absPath.slice(this.root.length + 1) : absPath;
  }
}

export function walkRelFiles(root: string, base = ""): string[] {
  const dir = join(root, base);
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const rel = base ? join(base, name) : name;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...walkRelFiles(root, rel));
    else out.push(rel);
  }
  return out;
}
