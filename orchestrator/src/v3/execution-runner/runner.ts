/**
 * Unique ExecutionRunner — V0-SEC-01..05:
 * realpath + symlink escape block, strict env scrub + ephemeral HOME,
 * secret redaction, detached pgid, SIGTERM→SIGKILL, Capability Gate.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  cancelProcessTree,
  cancelProcessTreeEscalating,
  identifyProcess,
  type SupervisedProcessIdentity,
} from "../sandbox/process-supervisor.js";
import { planBwrapWrapper } from "../sandbox/bwrap-wrapper.js";
import { STRICT_ENV_ALLOWLIST } from "../security/types.js";
import { capabilityGate } from "../security/capability-gate.js";
import { pathEscapesWorkspace } from "../../authority/capability-authority.js";
import { redactSecrets } from "../../evidence/secret-redaction.js";
import { filterProcessOutput } from "../token-economy/stdout-filter.js";
import type {
  ExecutionHandle,
  ExecutionRunnerPort,
  ExecutionRunnerRequest,
  ExecutionRunnerResult,
} from "./types.js";

const LIMITATIONS = [
  "Base confinement: realpath + cwd + env scrub; OS sandbox optional via os_sandbox",
  "Cancel uses kill(-pgid) SIGTERM→SIGKILL with /proc starttime reuse guard",
  "Env allowlist strict: PATH, LANG, TERM + ephemeral HOME",
  "Stdout/stderr pass deterministic secret redaction",
];

function resolveOsSandboxSpawn(
  req: ExecutionRunnerRequest,
  cwd: string,
  workspace: string,
  env: NodeJS.ProcessEnv,
): {
  argv: string[];
  meta: NonNullable<ExecutionRunnerResult["os_sandbox"]>;
  blocked?: ExecutionRunnerResult;
} {
  if (!req.os_sandbox) {
    return {
      argv: req.argv,
      meta: { used: false, backend: "none" },
    };
  }

  const plan = planBwrapWrapper({
    workspace_rw: workspace,
    argv: req.argv,
    cwd,
    env: Object.fromEntries(
      Object.entries(env).filter((e): e is [string, string] => e[1] != null),
    ),
    unshare_net: req.unshare_net === true,
  });

  // AUD-STUB-01 — any requested OS sandbox must fail-closed (no silent host spawn).
  if (!plan.available || plan.argv.length === 0) {
    const gaps = plan.gaps.length ? plan.gaps : ["os_sandbox_unavailable"];
    return {
      argv: req.argv,
      meta: {
        used: false,
        backend: "none",
        isolates_home: plan.isolates_home,
        isolates_ssh: plan.isolates_ssh,
        gaps,
      },
      blocked: {
        kind: "ExecutionRunnerResult",
        status: "blocked",
        code: "OS_SANDBOX_UNAVAILABLE",
        exit_code: null,
        signal: null,
        stdout: "",
        stderr: `bwrap required but unavailable: ${gaps.join(",")}`,
        duration_ms: 0,
        argv: req.argv,
        cwd,
        os_sandbox: { used: false, backend: "none", gaps },
        limitations: [
          ...LIMITATIONS,
          "os_sandbox_require_failed",
          "silent_host_fallback_forbidden",
        ],
      },
    };
  }

  // plan.argv[0] is bwrap path; rest are bwrap args including -- command
  return {
    argv: plan.argv,
    meta: {
      used: true,
      backend: "bubblewrap",
      isolates_home: plan.isolates_home,
      isolates_ssh: plan.isolates_ssh,
      gaps: plan.gaps,
    },
  };
}

export function safeRealpath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : resolve(p);
  } catch {
    return resolve(p);
  }
}

/**
 * V0-SEC-02 — canonical realpath + block symlink/path escape before mutation.
 */
export function assertWorkspacePath(label: string, target: string, workspaceRoot: string): string {
  const root = safeRealpath(workspaceRoot);
  const abs = resolve(target);
  if (pathEscapesWorkspace(abs, root)) {
    throw new ExecutionRunnerError("SYMLINK_OR_PATH_ESCAPE", `${label} escapes workspace: ${abs}`);
  }
  if (existsSync(abs)) {
    const real = safeRealpath(abs);
    if (pathEscapesWorkspace(real, root)) {
      throw new ExecutionRunnerError(
        "SYMLINK_OR_PATH_ESCAPE",
        `${label} realpath escapes workspace: ${real}`,
      );
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

/** Path-traversal / symlink guard usable before any filesystem mutation. */
export function guardPathBeforeMutation(target: string, workspaceRoot: string): string {
  return assertWorkspacePath("mutation_target", target, workspaceRoot);
}

function scrubEnv(
  allowExtra: string[] | undefined,
  explicit: Record<string, string> | undefined,
  ephemeralHome: string,
  inheritHome: boolean | undefined,
): NodeJS.ProcessEnv {
  const allow = new Set([...STRICT_ENV_ALLOWLIST, ...(allowExtra ?? [])]);
  // HOME is always present: ephemeral by default; real HOME only when inherit + allowlisted.
  allow.add("HOME");
  const out: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    if (key === "HOME") continue;
    if (explicit && Object.prototype.hasOwnProperty.call(explicit, key)) {
      out[key] = explicit[key];
    } else if (process.env[key] != null) {
      out[key] = process.env[key];
    }
  }
  if (inheritHome && allowExtra?.includes("HOME") && process.env.HOME) {
    out.HOME = explicit?.HOME ?? process.env.HOME;
  } else if (explicit?.HOME && allowExtra?.includes("HOME")) {
    out.HOME = explicit.HOME;
  } else {
    out.HOME = ephemeralHome;
  }
  return out;
}

/**
 * V0-TOK-04 filter + secret redaction + byte cap.
 * ANSI strip, hide passed tests, dedupe stacks, head 30 + tail 20.
 */
function filterAndRedact(text: string, deny: RegExp[] | undefined, maxBytes: number): string {
  const filtered = filterProcessOutput(text, { deny });
  let joined = redactSecrets(filtered.text, { redactSensitivePaths: true });
  if (Buffer.byteLength(joined, "utf-8") > maxBytes) {
    joined = joined.slice(0, maxBytes) + "\n…[truncated]";
  }
  return joined;
}

function createEphemeralHome(workspaceRoot: string): string {
  const base = join(tmpdir(), "evolveloop-ephemeral-home");
  mkdirSync(base, { recursive: true });
  // Prefer under tmp; still record workspace for audit.
  void workspaceRoot;
  return mkdtempSync(join(base, "home-"));
}

function checkCapability(req: ExecutionRunnerRequest): ExecutionRunnerResult | null {
  if (!req.capability) return null;
  const gate = capabilityGate({
    action: req.capability,
    workspace_root: req.workspace_root,
    profile: req.profile,
    authority: req.authority,
    approved: req.capability_approved,
  });
  if (gate.verdict === "BLOCKED") {
    return {
      kind: "ExecutionRunnerResult",
      status: "blocked",
      code: "CAPABILITY_BLOCKED",
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: gate.reason,
      duration_ms: 0,
      argv: req.argv ?? [],
      cwd: req.cwd,
      limitations: [...LIMITATIONS, `capability_gate:${gate.action}`],
    };
  }
  return null;
}

function preparePaths(req: ExecutionRunnerRequest): { cwd: string; workspace: string } {
  const workspace = safeRealpath(req.workspace_root);
  const cwd = assertWorkspacePath("cwd", req.cwd, workspace);
  const bin = req.argv[0]!;
  if (bin.includes("/") || bin.startsWith(".")) {
    const absBin = bin.startsWith("/") ? bin : resolve(cwd, bin);
    const inside = absBin === workspace || absBin.startsWith(workspace + sep);
    if (inside || !bin.startsWith("/")) {
      assertWorkspacePath("argv0", absBin, workspace);
    }
  }
  return { cwd, workspace };
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

export class ExecutionRunner implements ExecutionRunnerPort {
  private active = new Map<number, SupervisedProcessIdentity>();

  async run(req: ExecutionRunnerRequest): Promise<ExecutionRunnerResult> {
    if (!req.argv?.length) {
      return this.blocked("EMPTY_ARGV", "argv required", req);
    }
    const gated = checkCapability(req);
    if (gated) return gated;

    let cwd: string;
    let workspace: string;
    try {
      ({ cwd, workspace } = preparePaths(req));
    } catch (err) {
      const code = err instanceof ExecutionRunnerError ? err.code : "PATH_BLOCKED";
      return this.blocked(code, err instanceof Error ? err.message : String(err), req);
    }

    const timeout_ms = req.timeout_ms ?? 60_000;
    const max_output_bytes = req.max_output_bytes ?? 256_000;
    const ephemeral_home = createEphemeralHome(workspace);
    const env = scrubEnv(req.env_extra_allowlist, req.env, ephemeral_home, req.inherit_home);
    const started = Date.now();
    const grace_ms = req.kill_grace_ms ?? 2_000;

    const sandboxed = resolveOsSandboxSpawn(req, cwd, workspace, env);
    if (sandboxed.blocked) {
      try {
        rmSync(ephemeral_home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return sandboxed.blocked;
    }

    const spawnArgv = sandboxed.argv;
    const child = spawn(spawnArgv[0]!, spawnArgv.slice(1), {
      cwd: sandboxed.meta.used ? undefined : cwd,
      env: sandboxed.meta.used ? {} : env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const identity = child.pid != null ? identifyProcess(child.pid) : undefined;
    if (identity) {
      this.active.set(identity.pid, identity);
      try {
        req.onSpawned?.({
          pid: identity.pid,
          pgid: identity.pgid,
          starttime: identity.starttime,
        });
      } catch {
        /* registration must not break the run */
      }
    }

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
            cancel: (signal = "SIGTERM") => cancelProcessTree(identity, signal),
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
          void (async () => {
            if (settled) return;
            settled = true;
            if (identity) {
              await cancelProcessTreeEscalating(identity, { grace_ms });
            } else if (handle) {
              handle.cancel("SIGTERM");
              await new Promise((r) => setTimeout(r, Math.min(grace_ms, 500)));
              handle.cancel("SIGKILL");
            } else if (child.pid) {
              try {
                process.kill(-child.pid, "SIGTERM");
              } catch {
                /* ignore */
              }
              await new Promise((r) => setTimeout(r, Math.min(grace_ms, 500)));
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
          })();
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
        stdout: filterAndRedact(stdout, req.stdout_deny_patterns, max_output_bytes),
        stderr: filterAndRedact(stderr, req.stdout_deny_patterns, max_output_bytes),
        duration_ms: Date.now() - started,
        pid: identity?.pid,
        pgid: identity?.pgid,
        argv: req.argv,
        cwd,
        ephemeral_home,
        os_sandbox: sandboxed.meta,
        limitations: [
          ...LIMITATIONS,
          "env_scrubbed_strict_allowlist",
          ...(sandboxed.meta.used ? ["os_sandbox_bubblewrap"] : []),
          ...(sandboxed.meta.gaps?.length ? [`os_sandbox_gaps:${sandboxed.meta.gaps.join("|")}`] : []),
        ],
      };
    } finally {
      if (identity) this.active.delete(identity.pid);
      try {
        rmSync(ephemeral_home, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  /**
   * Synchronous path for short git/status ops — same confinement + scrub + gate.
   * Does not use detached pgid (spawnSync); still applies path/env/redaction gates.
   */
  runSync(req: ExecutionRunnerRequest): ExecutionRunnerResult {
    if (!req.argv?.length) {
      return this.blocked("EMPTY_ARGV", "argv required", req);
    }
    const gated = checkCapability(req);
    if (gated) return gated;

    let cwd: string;
    let workspace: string;
    try {
      ({ cwd, workspace } = preparePaths(req));
    } catch (err) {
      const code = err instanceof ExecutionRunnerError ? err.code : "PATH_BLOCKED";
      return this.blocked(code, err instanceof Error ? err.message : String(err), req);
    }

    const timeout_ms = req.timeout_ms ?? 60_000;
    const max_output_bytes = req.max_output_bytes ?? 256_000;
    const ephemeral_home = createEphemeralHome(workspace);
    const env = scrubEnv(req.env_extra_allowlist, req.env, ephemeral_home, req.inherit_home);
    const started = Date.now();

    const sandboxed = resolveOsSandboxSpawn(req, cwd, workspace, env);
    if (sandboxed.blocked) {
      try {
        rmSync(ephemeral_home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return sandboxed.blocked;
    }

    try {
      const spawnArgv = sandboxed.argv;
      const r = spawnSync(spawnArgv[0]!, spawnArgv.slice(1), {
        cwd: sandboxed.meta.used ? undefined : cwd,
        env: sandboxed.meta.used ? {} : env,
        encoding: "utf-8",
        timeout: timeout_ms,
        maxBuffer: max_output_bytes,
        killSignal: "SIGTERM",
      });

      const timedOut = r.error && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
      const status = timedOut
        ? "timeout"
        : r.error
          ? "failed"
          : r.status === 0
            ? "ok"
            : "failed";

      return {
        kind: "ExecutionRunnerResult",
        status,
        code: timedOut
          ? "TIMEOUT"
          : status === "ok"
            ? "EXIT_ZERO"
            : "EXIT_NONZERO",
        exit_code: r.status ?? null,
        signal: (r.signal as NodeJS.Signals | null) ?? null,
        stdout: filterAndRedact(r.stdout ?? "", req.stdout_deny_patterns, max_output_bytes),
        stderr: filterAndRedact(
          (r.stderr ?? "") + (r.error ? `\n${r.error.message}` : ""),
          req.stdout_deny_patterns,
          max_output_bytes,
        ),
        duration_ms: Date.now() - started,
        argv: req.argv,
        cwd,
        ephemeral_home,
        os_sandbox: sandboxed.meta,
        limitations: [
          ...LIMITATIONS,
          "runSync_uses_spawnSync_same_scrub_path_gate",
          "env_scrubbed_strict_allowlist",
          ...(sandboxed.meta.used ? ["os_sandbox_bubblewrap"] : []),
          ...(sandboxed.meta.gaps?.length ? [`os_sandbox_gaps:${sandboxed.meta.gaps.join("|")}`] : []),
        ],
      };
    } finally {
      try {
        rmSync(ephemeral_home, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
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

/** Singleton for V0 — adapters must not spawn outside this runner. */
export const defaultExecutionRunner: ExecutionRunnerPort = new ExecutionRunner();
