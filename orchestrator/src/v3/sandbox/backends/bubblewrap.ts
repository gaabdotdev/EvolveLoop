/**
 * Linux bubblewrap sandbox backend.
 * Uses established kernel primitives via bwrap — not a custom kernel sandbox.
 */

import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { which } from "../which.js";
import type {
  SandboxAvailability,
  SandboxBackend,
  SandboxExecRequest,
  SandboxExecResult,
} from "../types.js";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[truncated ${s.length - max} bytes]`;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function buildBwrapArgs(req: SandboxExecRequest, bwrapPath: string): { args: string[]; env: Record<string, string> } {
  const profile = req.profile;
  if (!existsSync(profile.filesystem.workspace_rw)) {
    throw new Error(`SANDBOX_WORKSPACE_MISSING: ${profile.filesystem.workspace_rw}`);
  }
  const workspace = safeRealpath(profile.filesystem.workspace_rw);
  const args: string[] = [
    bwrapPath,
    "--die-with-parent",
  ];

  if (profile.network.mode === "deny") {
    args.push("--unshare-net");
  } else if (profile.network.mode === "allowlist") {
    // ISSUE-SEC-H04-NET: host allowlist filtering is not implemented in bwrap backend.
    // Fail-closed unless operator explicitly opts into unrestricted ("*") allowlist.
    const list = profile.network.allowlist ?? [];
    const unrestricted = list.length === 1 && list[0] === "*";
    if (!unrestricted) {
      throw new Error(
        "SANDBOX_ALLOWLIST_UNIMPLEMENTED: network.mode=allowlist without allowlist=['*'] is fail-closed until host filtering exists",
      );
    }
    // unrestricted "*": network shared with host — never claim per-host filtering
  }

  // Debian/Ubuntu merged-/usr: bind /usr then recreate /bin,/lib,/lib64,/sbin as symlinks.
  // Binding /bin as a directory when it is a symlink breaks the dynamic linker.
  if (!isDir("/usr")) {
    throw new Error("SANDBOX_USR_MISSING");
  }
  args.push("--ro-bind", "/usr", "/usr");
  for (const [link, target] of [
    ["/bin", "usr/bin"],
    ["/sbin", "usr/sbin"],
    ["/lib", "usr/lib"],
    ["/lib64", "usr/lib64"],
  ] as const) {
    if (existsSync(link) || isSymlink(link) || existsSync(`/${target}`)) {
      args.push("--symlink", target, link);
    }
  }

  // Selective /etc (avoid mounting entire home via accidental paths)
  for (const etc of ["/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/resolv.conf", "/etc/ssl", "/etc/ld.so.cache"]) {
    if (existsSync(etc)) {
      args.push("--ro-bind", etc, etc);
    }
  }
  for (const p of profile.filesystem.read_only_paths) {
    if (
      existsSync(p) &&
      p !== "/usr" &&
      !p.startsWith("/usr/") &&
      p !== "/bin" &&
      p !== "/lib" &&
      p !== "/lib64" &&
      p !== "/sbin"
    ) {
      args.push("--ro-bind", p, p);
    }
  }

  args.push("--dev", "/dev");
  args.push("--proc", "/proc");
  args.push("--tmpfs", "/tmp");
  args.push("--tmpfs", "/run");
  args.push("--bind", workspace, workspace);

  // Explicitly avoid binding home / primary checkout.
  if (profile.filesystem.protect_primary_checkout) {
    const primary = safeRealpath(profile.filesystem.protect_primary_checkout);
    if (primary !== workspace && existsSync(primary)) {
      // Do not mount primary at all — absence is denial.
    }
  }

  const cwd = safeRealpath(req.cwd ?? workspace);
  if (cwd !== workspace && !cwd.startsWith(workspace + sep)) {
    throw new Error(`SANDBOX_CWD_ESCAPE: ${cwd}`);
  }
  args.push("--chdir", cwd);

  // Clear env then set allowlist.
  args.push("--clearenv");
  const env: Record<string, string> = {};
  const allow = new Set(profile.secrets.env_allowlist);
  const incoming = req.env ?? {};
  for (const key of allow) {
    if (incoming[key] != null) env[key] = incoming[key]!;
    else if (process.env[key] != null && key !== "HOME") env[key] = process.env[key]!;
  }
  // Home inside workspace only.
  env.HOME = workspace;
  env.TMPDIR = "/tmp";
  if (!env.PATH) env.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

  // Scoped secrets (never logged by caller).
  if (req.secrets) {
    for (const [k, v] of Object.entries(req.secrets)) {
      if (profile.secrets.injectable_secret_keys.includes(k)) {
        env[k] = v;
      }
    }
  }

  for (const [k, v] of Object.entries(env)) {
    args.push("--setenv", k, v);
  }

  // argv — no shell.
  if (!req.argv.length) throw new Error("SANDBOX_EMPTY_ARGV");
  args.push("--", ...req.argv);

  // Optional resource limits via prlimit (RLIMIT_*) when binary available.
  // Honest: not cgroup v2. NEVER map max_pids → RLIMIT_NPROC: that limit is
  // user-wide and causes "namespace failed: Resource temporarily unavailable"
  // when the operator already has many processes.
  const prlimit = which("prlimit");
  if (prlimit) {
    const wrap: string[] = [prlimit];
    if (profile.process.memory_bytes != null) {
      wrap.push(`--as=${profile.process.memory_bytes}`);
    }
    if (profile.process.cpu_seconds != null) {
      wrap.push(`--cpu=${profile.process.cpu_seconds}`);
    }
    if (wrap.length > 1) {
      wrap.push("--");
      return { args: [...wrap, ...args], env };
    }
  }

  return { args, env };
}

export class BubblewrapBackend implements SandboxBackend {
  readonly backend_id = "bubblewrap" as const;

  probe(): SandboxAvailability {
    const path = which("bwrap");
    if (!path) {
      return {
        available: false,
        backend_id: "bubblewrap",
        reason: "bwrap_not_on_path",
        notes: ["Install bubblewrap (bwrap) for Linux OS sandbox"],
      };
    }
    return {
      available: true,
      backend_id: "bubblewrap",
      version_hint: path,
      notes: [
        "Rootless bubblewrap — namespaces via bwrap",
        "Network deny uses --unshare-net",
        which("prlimit")
          ? "Resource caps via prlimit RLIMIT_AS/CPU when profile sets them; max_pids not mapped to RLIMIT_NPROC (user-wide hazard)"
          : "prlimit absent — timeout/output limits only",
        "Not a claim of perfect kernel isolation against privileged attackers",
      ],
    };
  }

  async exec(request: SandboxExecRequest): Promise<SandboxExecResult> {
    const availability = this.probe();
    const limitations = availability.notes;
    if (!availability.available) {
      return {
        kind: "SandboxExecResult",
        backend_id: this.backend_id,
        exit_code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timed_out: false,
        duration_ms: 0,
        blocked: true,
        block_reason: availability.available === false ? availability.reason : "unavailable",
        limitations,
      };
    }

    if (request.profile.require_os_sandbox && !availability.available) {
      return {
        kind: "SandboxExecResult",
        backend_id: this.backend_id,
        exit_code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timed_out: false,
        duration_ms: 0,
        blocked: true,
        block_reason: "sandbox_required_unavailable",
        limitations,
      };
    }

    const bwrapPath = which("bwrap")!;
    let built: { args: string[]; env: Record<string, string> };
    try {
      built = buildBwrapArgs(request, bwrapPath);
    } catch (err) {
      return {
        kind: "SandboxExecResult",
        backend_id: this.backend_id,
        exit_code: null,
        signal: null,
        stdout: "",
        stderr: String(err),
        timed_out: false,
        duration_ms: 0,
        blocked: true,
        block_reason: "sandbox_setup_failed",
        limitations,
      };
    }

    const timeout = request.profile.process.timeout_ms;
    const maxOut = request.profile.process.max_output_bytes;
    const started = Date.now();
    const graceMs = request.cancel_grace_ms ?? 2_000;

    if (request.signal?.aborted) {
      return {
        kind: "SandboxExecResult",
        backend_id: this.backend_id,
        exit_code: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "aborted_before_start",
        timed_out: false,
        cancelled: true,
        duration_ms: 0,
        blocked: false,
        limitations,
      };
    }

    return new Promise((resolvePromise) => {
      // Spawn bwrap directly (args[0] is bwrap path); remaining are argv to bwrap.
      const [cmd, ...cmdArgs] = built.args;
      const child = spawn(cmd!, cmdArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
        env: {}, // env already applied inside bwrap via --setenv
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      let killEscalation: ReturnType<typeof setTimeout> | undefined;

      const killTree = (sig: NodeJS.Signals) => {
        if (child.pid == null) return;
        try {
          process.kill(-child.pid, sig);
        } catch {
          try {
            child.kill(sig);
          } catch {
            /* gone */
          }
        }
      };

      const finish = (exit_code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        if (killEscalation) clearTimeout(killEscalation);
        request.signal?.removeEventListener("abort", onAbort);
        resolvePromise({
          kind: "SandboxExecResult",
          backend_id: this.backend_id,
          exit_code,
          signal,
          stdout: truncate(stdout, maxOut),
          stderr: truncate(stderr, maxOut),
          timed_out: timedOut,
          cancelled,
          duration_ms: Date.now() - started,
          pid: child.pid,
          pgid: child.pid,
          limitations,
        });
      };

      const onAbort = () => {
        cancelled = true;
        killTree("SIGTERM");
        killEscalation = setTimeout(() => killTree("SIGKILL"), graceMs);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGKILL");
      }, timeout);

      request.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout?.on("data", (buf: Buffer) => {
        if (stdout.length < maxOut) stdout += buf.toString("utf-8");
      });
      child.stderr?.on("data", (buf: Buffer) => {
        if (stderr.length < maxOut) stderr += buf.toString("utf-8");
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        stderr += String(err);
        finish(null, null);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        finish(code, signal);
      });

      if (request.stdin != null) {
        child.stdin?.end(request.stdin);
      } else {
        child.stdin?.end();
      }
    });
  }
}

/** Exported for unit tests of arg construction without spawn. */
export function buildBubblewrapArgvForTest(req: SandboxExecRequest, bwrapPath = "/usr/bin/bwrap"): string[] {
  return buildBwrapArgs(req, bwrapPath).args;
}
