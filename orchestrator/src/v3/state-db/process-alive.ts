/**
 * Process liveness helpers for workspace lease auto-heal (stale shell locks).
 */

/** Extract PID from holder ids shaped like `shell-<pid>`. */
export function extractShellHolderPid(holderId: string): number | undefined {
  const m = /^shell-(\d+)$/.exec(holderId.trim());
  if (!m) return undefined;
  const pid = Number(m[1]);
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  return pid;
}

/**
 * True if the process exists.
 * - ESRCH → dead
 * - EPERM → alive (no signal permission, but process exists)
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return false;
  }
}

/** True when holder looks like a dead shell lock. */
export function isStaleShellHolder(holderId: string): boolean {
  const pid = extractShellHolderPid(holderId);
  if (pid === undefined) return false;
  return !isPidAlive(pid);
}
