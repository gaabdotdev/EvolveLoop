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
  return {
    pid,
    pgid: pid, // when spawned detached, pgid === pid
    starttime,
    cmdline: readProcCmdline(pid),
  };
}

export function sameProcess(identity: SupervisedProcessIdentity): boolean {
  const current = readProcStarttime(identity.pid);
  return current != null && current === identity.starttime;
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

/**
 * V0-SEC-04 — full-tree kill with SIGTERM → grace → SIGKILL escalation.
 */
export async function cancelProcessTreeEscalating(
  identity: SupervisedProcessIdentity,
  opts?: { grace_ms?: number },
): Promise<{ signalled: boolean; reason: string; escalated: boolean }> {
  const grace_ms = opts?.grace_ms ?? 2_000;
  const first = cancelProcessTree(identity, "SIGTERM");
  if (!first.signalled && first.reason === "pid_reuse_or_gone") {
    return { ...first, escalated: false };
  }
  const deadline = Date.now() + grace_ms;
  while (Date.now() < deadline) {
    if (!sameProcess(identity)) {
      return { signalled: first.signalled, reason: "terminated_after_SIGTERM", escalated: false };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!sameProcess(identity)) {
    return { signalled: first.signalled, reason: "terminated_after_SIGTERM", escalated: false };
  }
  const second = cancelProcessTree(identity, "SIGKILL");
  return {
    signalled: second.signalled || first.signalled,
    reason: second.signalled ? "escalated_SIGKILL" : first.reason,
    escalated: true,
  };
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
