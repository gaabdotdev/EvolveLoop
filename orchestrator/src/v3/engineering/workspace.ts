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
import { dirname, join, resolve, sep } from "node:path";
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

/** True iff child is root or a path under root+sep (blocks `/tmp/ws` vs `/tmp/ws-evil`). */
export function isPathInsideRoot(child: string, root: string): boolean {
  return child === root || child.startsWith(root + sep);
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
      if (!isPathInsideRoot(real, this.root)) throw new WorkspaceError("ESCAPE", real);
      return real;
    }
    // Lexical confinement before mkdir (ISSUE-SEC-H03-PATH): reject prefix escapes.
    if (!isPathInsideRoot(candidate, this.root)) {
      throw new WorkspaceError("ESCAPE", candidate);
    }
    const parent = dirname(candidate);
    mkdirSync(parent, { recursive: true });
    const parentReal = realpathSync(parent);
    if (!isPathInsideRoot(parentReal, this.root)) throw new WorkspaceError("ESCAPE", parentReal);
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
    return isPathInsideRoot(absPath, this.root) ? absPath.slice(this.root.length + 1) : absPath;
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
