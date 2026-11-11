/**
 * Confined workspace mutations for Engineering Loop workers.
 * Uses realpath confinement — not a claim of full OS sandbox.
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

  readFile(relPath: string): string {
    return readFileSync(this.resolveSafe(relPath), "utf-8");
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
