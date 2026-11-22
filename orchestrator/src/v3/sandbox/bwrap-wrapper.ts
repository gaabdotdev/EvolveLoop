/**
 * V1-SEC-01 — Bubblewrap wrapper helpers for ExecutionRunner.
 * Builds argv that: workspace RW, system RO, isolates /home and ~/.ssh.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { which } from "./which.js";
import { buildDefaultLandlockPolicy, probeLandlock } from "./landlock.js";

export interface BwrapWrapperOptions {
  workspace_rw: string;
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** When true, add --unshare-net (read/analyze phases). */
  unshare_net?: boolean;
  /** Extra RO binds (e.g. /etc/ssl). */
  extra_ro?: string[];
  bwrap_path?: string;
}

export interface BwrapWrapperPlan {
  kind: "BwrapWrapperPlan";
  available: boolean;
  bwrap_path: string | null;
  argv: string[];
  landlock_policy: ReturnType<typeof buildDefaultLandlockPolicy>;
  landlock_probe: ReturnType<typeof probeLandlock>;
  isolates_home: boolean;
  isolates_ssh: boolean;
  gaps: string[];
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

/**
 * Construct bwrap argv without spawning. Safe for unit tests / mock hosts.
 */
export function planBwrapWrapper(opts: BwrapWrapperOptions): BwrapWrapperPlan {
  const gaps: string[] = [];
  const bwrap_path = opts.bwrap_path ?? which("bwrap");
  const landlock_policy = buildDefaultLandlockPolicy(opts.workspace_rw);
  const landlock_probe = probeLandlock();
  if (!landlock_probe.enforceable) {
    gaps.push(...landlock_probe.gaps.map((g) => `landlock:${g}`));
  }

  if (!bwrap_path) {
    return {
      kind: "BwrapWrapperPlan",
      available: false,
      bwrap_path: null,
      argv: [],
      landlock_policy,
      landlock_probe,
      isolates_home: true,
      isolates_ssh: true,
      gaps: [...gaps, "bwrap_not_on_path"],
    };
  }

  if (!existsSync(opts.workspace_rw)) {
    return {
      kind: "BwrapWrapperPlan",
      available: false,
      bwrap_path,
      argv: [],
      landlock_policy,
      landlock_probe,
      isolates_home: true,
      isolates_ssh: true,
      gaps: [...gaps, "workspace_missing"],
    };
  }

  const workspace = safeRealpath(opts.workspace_rw);
  const args: string[] = [bwrap_path, "--die-with-parent"];

  if (opts.unshare_net) args.push("--unshare-net");

  if (!isDir("/usr")) {
    gaps.push("usr_missing");
  } else {
    args.push("--ro-bind", "/usr", "/usr");
    for (const [link, target] of [
      ["/bin", "usr/bin"],
      ["/sbin", "usr/sbin"],
      ["/lib", "usr/lib"],
      ["/lib64", "usr/lib64"],
    ] as const) {
      if (existsSync(link) || existsSync(`/${target}`)) {
        args.push("--symlink", target, link);
      }
    }
  }

  for (const etc of [
    "/etc/passwd",
    "/etc/group",
    "/etc/nsswitch.conf",
    "/etc/resolv.conf",
    "/etc/ssl",
    "/etc/ld.so.cache",
  ]) {
    if (existsSync(etc)) args.push("--ro-bind", etc, etc);
  }
  for (const p of opts.extra_ro ?? []) {
    if (existsSync(p)) args.push("--ro-bind", p, p);
  }

  args.push("--dev", "/dev");
  args.push("--proc", "/proc");
  args.push("--tmpfs", "/tmp");
  args.push("--tmpfs", "/run");

  // Isolate /home: empty tmpfs so host home (and ~/.ssh) are invisible.
  if (existsSync("/home")) {
    args.push("--tmpfs", "/home");
  }
  // Also cover root's home and common ssh path under real HOME if outside /home.
  const home = homedir();
  const ssh = `${home}/.ssh`;
  // Do not bind host HOME or ~/.ssh — absence + tmpfs /home is isolation.
  void ssh;

  args.push("--bind", workspace, workspace);

  const cwd = safeRealpath(opts.cwd ?? workspace);
  args.push("--chdir", cwd);
  args.push("--clearenv");

  const env: Record<string, string> = {
    HOME: workspace,
    TMPDIR: "/tmp",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    ...(opts.env ?? {}),
  };
  for (const [k, v] of Object.entries(env)) {
    args.push("--setenv", k, v);
  }

  if (!opts.argv.length) {
    gaps.push("empty_argv");
  } else {
    args.push("--", ...opts.argv);
  }

  return {
    kind: "BwrapWrapperPlan",
    available: gaps.filter((g) => g === "workspace_missing" || g === "empty_argv" || g === "usr_missing")
      .length === 0,
    bwrap_path,
    argv: args,
    landlock_policy,
    landlock_probe,
    isolates_home: true,
    isolates_ssh: true,
    gaps,
  };
}

/** Pure mock planner for unit tests when bwrap is absent. */
export function mockBwrapWrapperPlan(opts: BwrapWrapperOptions): BwrapWrapperPlan {
  const base = planBwrapWrapper({ ...opts, bwrap_path: opts.bwrap_path ?? "/usr/bin/bwrap" });
  return {
    ...base,
    available: true,
    bwrap_path: opts.bwrap_path ?? "/usr/bin/bwrap",
    gaps: base.gaps.filter((g) => g !== "bwrap_not_on_path"),
  };
}

export function isBwrapAvailable(): boolean {
  return !!which("bwrap");
}
