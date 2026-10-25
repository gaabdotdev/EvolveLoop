import { spawn } from "node:child_process";
import type { ExecutionResult } from "../../capabilities/results.js";
import { cleanOutput } from "../../capabilities/results.js";
import { resolveWorkspacePath } from "./paths.js";

export interface ShellExecuteOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  workspaceRoot: string;
  env?: Record<string, string>;
}

const SAFE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TERM",
  "TMPDIR",
  "TMP",
  "TEMP",
  "NODE_ENV",
  "PWD",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "CI",
  "HOSTNAME",
  "SHLVL",
]);

export function sanitizeEnvironment(
  rawEnv: NodeJS.ProcessEnv = process.env,
  customEnv?: Record<string, string | undefined>
): Record<string, string> {
  const safeEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawEnv)) {
    if (value === undefined) continue;
    const isSafeKey = SAFE_ENV_KEYS.has(key) || /^LC_[A-Z]+$/.test(key);
    const isSensitive = /(API_KEY|SECRET|TOKEN|AUTH|PASSWORD|CREDENTIAL|PRIVATE)/i.test(key);
    if (isSafeKey && !isSensitive) {
      safeEnv[key] = value;
    }
  }

  if (customEnv) {
    for (const [k, v] of Object.entries(customEnv)) {
      if (v !== undefined) {
        safeEnv[k] = v;
      }
    }
  }

  return safeEnv;
}

export function shellExecute(opts: ShellExecuteOptions): Promise<ExecutionResult> {
  const cwd = resolveWorkspacePath(opts.workspaceRoot, opts.cwd ?? ".");
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const start = Date.now();
  const isPosix = process.platform !== "win32";

  return new Promise((resolvePromise) => {
    const child = spawn(opts.command, {
      cwd,
      shell: true,
      detached: isPosix,
      env: sanitizeEnvironment(process.env, opts.env),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const killGroup = (sig: NodeJS.Signals = "SIGKILL") => {
      if (child.pid && isPosix) {
        try {
          process.kill(-child.pid, sig);
          return;
        } catch (err: any) {
          if (err?.code === "ESRCH") return;
        }
      }
      try {
        child.kill(sig);
      } catch {
        // ignore
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 20_000) stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 20_000) stderr += chunk.toString("utf-8");
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        kind: "ExecutionResult",
        command: opts.command,
        cwd,
        exit_code: exitCode,
        timed_out: timedOut,
        stdout_excerpt: cleanOutput(stdout, 4000),
        stderr_excerpt: cleanOutput(stderr, 2000),
        duration_ms: Date.now() - start,
      });
    };

    child.on("error", (err) => {
      stderr += String(err.message);
      finish(1);
    });
    child.on("close", (code) => finish(code));
  });
}
