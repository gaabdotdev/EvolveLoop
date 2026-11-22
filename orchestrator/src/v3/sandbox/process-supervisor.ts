/**
 * Process supervisor — PGID cancel, PID reuse protection via /proc starttime.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";

export interface SupervisedProcessIdentity {
  pid: number;
  pgid: number;
  starttime: string;
  cmdline: string;
}

export function readProcStarttime(pid: number): string | undefined {
  const statPath = `/proc/${pid}/stat`;
  if (!existsSync(statPath)) return undefined;
  try {
    const raw = readFileSync(statPath, "utf-8");
    const closeParen = raw.lastIndexOf(")");
    if (closeParen < 0) return undefined;
    const rest = raw.slice(closeParen + 2).split(" ");
    // fields after comm: state(0) ppid(1) pgrp(2) ... starttime is field 20 (0-indexed 19) in full stat
    // After ") ": index 19 is starttime (man proc_pid_stat).
    return rest[19];
  } catch {
    return undefined;
  }
}

export function readProcCmdline(pid: number): string {
  const p = `/proc/${pid}/cmdline`;
  if (!existsSync(p)) return "";
  try {
    return readFileSync(p, "utf-8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

export function identifyProcess(pid: number): SupervisedProcessIdentity | undefined {
  const starttime = readProcStarttime(pid);
  if (starttime == null) return undefined;
  // Prefer real PGRP from /proc; detached leaders still have pgid === pid.
  let pgid = pid;
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const closeParen = raw.lastIndexOf(")");
    if (closeParen >= 0) {
      const rest = raw.slice(closeParen + 2).split(" ");
      const pgrp = Number(rest[2]);
      if (Number.isFinite(pgrp) && pgrp > 0) pgid = pgrp;
    }
  } catch {
    /* keep pid fallback */
  }
  return {
    pid,
    pgid,
    starttime,
    cmdline: readProcCmdline(pid),
  };
}

/** Short sleep without async (cancel/pause confirmation paths). */
export function sleepMs(ms: number): void {
  if (ms <= 0) return;
  try {
    const buf = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(buf), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* spin fallback */
    }
  }
}

export function sameProcess(identity: SupervisedProcessIdentity): boolean {
  const current = readProcStarttime(identity.pid);
  return current != null && current === identity.starttime;
}

/**
 * Live (runnable/stopped) process with matching starttime.
 * Zombies (`Z`) still occupy the PID slot in /proc but are not live — treat as dead
 * so cancel confirmation does not hang on unreaped children.
 */
export function isProcessLive(identity: SupervisedProcessIdentity): boolean {
  if (!sameProcess(identity)) return false;
  const state = readProcState(identity.pid);
  return state != null && state !== "Z";
}

/**
 * Read single-char process state from /proc/<pid>/stat (R/S/D/T/Z/…).
 * `T` = stopped (SIGSTOP/SIGTSTP). Returns undefined when pid is gone.
 */
export function readProcState(pid: number): string | undefined {
  const statPath = `/proc/${pid}/stat`;
  if (!existsSync(statPath)) return undefined;
  try {
    const raw = readFileSync(statPath, "utf-8");
    const closeParen = raw.lastIndexOf(")");
    if (closeParen < 0) return undefined;
    const rest = raw.slice(closeParen + 2).split(" ");
    return rest[0];
  } catch {
    return undefined;
  }
}

/** True when the same process identity is in state T (stopped). */
export function isProcessStopped(identity: SupervisedProcessIdentity): boolean {
  if (!isProcessLive(identity)) return false;
  return readProcState(identity.pid) === "T";
}

/**
 * Signal a verified process tree (PGID preferred). Refuses PID reuse.
 * Use for SIGSTOP / SIGCONT / SIGTERM / SIGKILL — never without identity fencing.
 */
export function signalProcessTree(
  identity: SupervisedProcessIdentity,
  signal: NodeJS.Signals,
): { signalled: boolean; reason: string } {
  return cancelProcessTree(identity, signal);
}

export function cancelProcessTree(identity: SupervisedProcessIdentity, signal: NodeJS.Signals = "SIGTERM"): {
  signalled: boolean;
  reason: string;
} {
  if (!sameProcess(identity)) {
    return { signalled: false, reason: "pid_reuse_or_gone" };
  }
  try {
    process.kill(-identity.pgid, signal);
    return { signalled: true, reason: `signal_${signal}_pgid` };
  } catch {
    try {
      if (sameProcess(identity)) {
        process.kill(identity.pid, signal);
        return { signalled: true, reason: `signal_${signal}_pid` };
      }
      return { signalled: false, reason: "pid_reuse_or_gone" };
    } catch {
      return { signalled: false, reason: "kill_failed" };
    }
  }
}

export interface CancelEscalateResult {
  signalled: boolean;
  reason: string;
  escalated: boolean;
  /** True when identity no longer matches a live process (gone or reused). */
  dead: boolean;
}

/**
 * Sync SIGTERM → grace → SIGKILL with identity fence. Prefer this when the
 * caller must confirm death before persisting cancelled / updating TUI.
 */
export function cancelProcessTreeEscalatingSync(
  identity: SupervisedProcessIdentity,
  opts?: { grace_ms?: number },
): CancelEscalateResult {
  const grace_ms = opts?.grace_ms ?? 2_000;
  if (!isProcessLive(identity)) {
    return {
      signalled: false,
      reason: sameProcess(identity) ? "already_zombie" : "pid_reuse_or_gone",
      escalated: false,
      dead: true,
    };
  }
  // Stopped tasks may defer SIGTERM until continued — nudge then terminate.
  if (isProcessStopped(identity)) {
    cancelProcessTree(identity, "SIGCONT");
    sleepMs(30);
  }
  const first = cancelProcessTree(identity, "SIGTERM");
  if (!first.signalled && first.reason === "pid_reuse_or_gone") {
    return { ...first, escalated: false, dead: true };
  }
  const deadline = Date.now() + grace_ms;
  while (Date.now() < deadline) {
    if (!isProcessLive(identity)) {
      return {
        signalled: first.signalled,
        reason: "terminated_after_SIGTERM",
        escalated: false,
        dead: true,
      };
    }
    sleepMs(50);
  }
  if (!isProcessLive(identity)) {
    return {
      signalled: first.signalled,
      reason: "terminated_after_SIGTERM",
      escalated: false,
      dead: true,
    };
  }
  const second = cancelProcessTree(identity, "SIGKILL");
  sleepMs(80);
  const dead = !isProcessLive(identity);
  return {
    signalled: second.signalled || first.signalled,
    reason: dead
      ? second.signalled
        ? "escalated_SIGKILL"
        : "terminated_after_SIGTERM"
      : "LIMITATION_still_alive_after_SIGKILL",
    escalated: true,
    dead,
  };
}

/**
 * V0-SEC-04 — full-tree kill with SIGTERM → grace → SIGKILL escalation.
 */
export async function cancelProcessTreeEscalating(
  identity: SupervisedProcessIdentity,
  opts?: { grace_ms?: number },
): Promise<CancelEscalateResult> {
  return cancelProcessTreeEscalatingSync(identity, opts);
}

export interface SpawnSupervisedOptions {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout_ms?: number;
}

export interface SpawnSupervisedResult {
  child: ChildProcess;
  identity: SupervisedProcessIdentity | undefined;
}

/** Spawn detached (own process group) for tree cancel. */
export function spawnSupervised(opts: SpawnSupervisedOptions): SpawnSupervisedResult {
  const [cmd, ...args] = opts.argv;
  if (!cmd) throw new Error("EMPTY_ARGV");
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const identity = child.pid != null ? identifyProcess(child.pid) : undefined;
  return { child, identity };
}

export function listOrphans(
  owned: SupervisedProcessIdentity[],
): { live: SupervisedProcessIdentity[]; gone: SupervisedProcessIdentity[]; reused: SupervisedProcessIdentity[] } {
  const live: SupervisedProcessIdentity[] = [];
  const gone: SupervisedProcessIdentity[] = [];
  const reused: SupervisedProcessIdentity[] = [];
  for (const id of owned) {
    const st = readProcStarttime(id.pid);
    if (st == null) gone.push(id);
    else if (st !== id.starttime) reused.push(id);
    else live.push(id);
  }
  return { live, gone, reused };
}
