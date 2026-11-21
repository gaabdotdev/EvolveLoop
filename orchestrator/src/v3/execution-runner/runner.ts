/**
 * Unique ExecutionRunner — realpath, symlink escape block, env allowlist,
 * detached pgid, timeout, stdout filter, cancel via kill(-pgid).
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import {
  cancelProcessTree,
  identifyProcess,
  type SupervisedProcessIdentity,
} from "../sandbox/process-supervisor.js";
import { DEFAULT_ENV_ALLOWLIST } from "../security/types.js";
import { pathEscapesWorkspace } from "../../authority/capability-authority.js";
import type {
  ExecutionHandle,
  ExecutionRunnerRequest,
  ExecutionRunnerResult,
} from "./types.js";

const LIMITATIONS = [
  "Not an OS sandbox — confinement is realpath + cwd + env scrub only",
  "Cancel uses kill(-pgid) with /proc starttime reuse guard when available",
];

function safeRealpath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : resolve(p);
  } catch {
    return resolve(p);
  }
}

function assertWorkspacePath(label: string, target: string, workspaceRoot: string): string {
  const root = safeRealpath(workspaceRoot);
  const abs = resolve(target);
  if (pathEscapesWorkspace(abs, root)) {
    throw new ExecutionRunnerError("SYMLINK_OR_PATH_ESCAPE", `${label} escapes workspace: ${abs}`);
  }
  if (existsSync(abs)) {
    const real = safeRealpath(abs);
    if (pathEscapesWorkspace(real, root)) {
      throw new ExecutionRunnerError("SYMLINK_OR_PATH_ESCAPE", `${label} realpath escapes workspace: ${real}`);
    }
    return real;
  }
  // Non-existent: ensure parent chain does not escape via symlink.
  let walk = dirname(abs);
  while (walk && walk !== sep) {
    if (existsSync(walk)) {
      const realParent = safeRealpath(walk);
      if (pathEscapesWorkspace(realParent, root)) {
        throw new ExecutionRunnerError(
          "SYMLINK_OR_PATH_ESCAPE",
          `${label} parent realpath escapes workspace: ${realParent}`,
        );
      }
      break;
    }
    const parent = dirname(walk);
    if (parent === walk) break;
    walk = parent;
  }
  return abs;
}

function scrubEnv(
  allowExtra: string[] | undefined,
  explicit: Record<string, string> | undefined,
): NodeJS.ProcessEnv {
  const allow = new Set([...DEFAULT_ENV_ALLOWLIST, ...(allowExtra ?? [])]);
  const out: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    if (explicit && Object.prototype.hasOwnProperty.call(explicit, key)) {
      out[key] = explicit[key];
    } else if (process.env[key] != null) {
      out[key] = process.env[key];
    }
  }
  // Never inherit secrets unless explicitly allowlisted by caller.
  return out;
}

function filterOutput(text: string, deny: RegExp[] | undefined, maxBytes: number): string {
  let lines = text.split(/\r?\n/);
  if (deny && deny.length > 0) {
    lines = lines.filter((line) => !deny.some((re) => re.test(line)));
  }
  let joined = lines.join("\n");
  if (Buffer.byteLength(joined, "utf-8") > maxBytes) {
    joined = joined.slice(0, maxBytes) + "\n…[truncated]";
  }
  return joined;
}

export class ExecutionRunnerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionRunnerError";
  }
}

export class ExecutionRunner {
  private active = new Map<number, SupervisedProcessIdentity>();

  async run(req: ExecutionRunnerRequest): Promise<ExecutionRunnerResult> {
    if (!req.argv?.length) {
      return this.blocked("EMPTY_ARGV", "argv required", req);
    }
    let cwd: string;
    let workspace: string;
    try {
      workspace = safeRealpath(req.workspace_root);
      cwd = assertWorkspacePath("cwd", req.cwd, workspace);
      // Bare PATH commands (npm, node, bash) are allowed.
      // Absolute host CLIs outside the workspace (e.g. /usr/bin/node, ~/.local/bin/agent)
      // are allowed — confinement applies to cwd + workspace-relative argv0 only.
      const bin = req.argv[0]!;
      if (bin.includes("/") || bin.startsWith(".")) {
        const absBin = bin.startsWith("/") ? bin : resolve(cwd, bin);
        const inside =
          absBin === workspace || absBin.startsWith(workspace + sep);
        if (inside || !bin.startsWith("/")) {
          assertWorkspacePath("argv0", absBin, workspace);
        }
      }
    } catch (err) {
      const code = err instanceof ExecutionRunnerError ? err.code : "PATH_BLOCKED";
      return this.blocked(code, err instanceof Error ? err.message : String(err), req);
    }

    const timeout_ms = req.timeout_ms ?? 60_000;
    const max_output_bytes = req.max_output_bytes ?? 256_000;
    const env = scrubEnv(req.env_extra_allowlist, req.env);
    const started = Date.now();

    const child = spawn(req.argv[0]!, req.argv.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const identity = child.pid != null ? identifyProcess(child.pid) : undefined;
    if (identity) this.active.set(identity.pid, identity);

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const handle: ExecutionHandle | undefined =
      identity != null
        ? {
            pid: identity.pid,
            pgid: identity.pgid,
            starttime: identity.starttime,
            cancel: (signal = "SIGTERM") => {
              const r = cancelProcessTree(identity, signal);
              return r;
            },
          }
        : undefined;

    try {
      const outcome = await new Promise<{
        status: "ok" | "timeout" | "failed" | "cancelled";
        exit_code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolvePromise) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (handle) handle.cancel("SIGKILL");
          else if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              try {
                child.kill("SIGKILL");
              } catch {
                /* ignore */
              }
            }
          }
          resolvePromise({ status: "timeout", exit_code: null, signal: "SIGKILL" });
        }, timeout_ms);

        child.on("error", (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stderr += `\n${err.message}`;
          resolvePromise({ status: "failed", exit_code: 1, signal: null });
        });

        child.on("exit", (code, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (signal === "SIGTERM" || signal === "SIGKILL") {
            resolvePromise({
              status: "cancelled",
              exit_code: code,
              signal,
            });
            return;
          }
          resolvePromise({
            status: code === 0 ? "ok" : "failed",
            exit_code: code,
            signal: signal as NodeJS.Signals | null,
          });
        });
      });

      return {
        kind: "ExecutionRunnerResult",
        status: outcome.status,
        code:
          outcome.status === "ok"
            ? "EXIT_ZERO"
            : outcome.status === "timeout"
              ? "TIMEOUT"
              : outcome.status === "cancelled"
                ? "CANCELLED"
                : "EXIT_NONZERO",
        exit_code: outcome.exit_code,
        signal: outcome.signal,
        stdout: filterOutput(stdout, req.stdout_deny_patterns, max_output_bytes),
        stderr: filterOutput(stderr, req.stdout_deny_patterns, max_output_bytes),
        duration_ms: Date.now() - started,
        pid: identity?.pid,
        pgid: identity?.pgid,
        argv: req.argv,
        cwd,
        limitations: [...LIMITATIONS, "env_scrubbed_allowlist"],
      };
    } finally {
      if (identity) this.active.delete(identity.pid);
    }
  }

  cancel(pid: number, signal: NodeJS.Signals = "SIGTERM"): { signalled: boolean; reason: string } {
    const id = this.active.get(pid);
    if (!id) return { signalled: false, reason: "unknown_pid" };
    return cancelProcessTree(id, signal);
  }

  private blocked(
    code: string,
    message: string,
    req: ExecutionRunnerRequest,
  ): ExecutionRunnerResult {
    return {
      kind: "ExecutionRunnerResult",
      status: "blocked",
      code,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: message,
      duration_ms: 0,
      argv: req.argv ?? [],
      cwd: req.cwd,
      limitations: [...LIMITATIONS],
    };
  }
}

/** Singleton for V0 circuit — adapters must not spawn outside this runner. */
export const defaultExecutionRunner = new ExecutionRunner();
