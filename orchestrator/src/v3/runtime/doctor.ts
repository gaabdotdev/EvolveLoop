/**
 * evolve runtime doctor — environment diagnosis without revealing secrets.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager } from "../sandbox/manager.js";
import { which } from "../sandbox/which.js";
import { harnessDoctor } from "../harness/runtime.js";
import { ipcSocketPath } from "../coordinator/ipc.js";
import { resolveV3DataPaths } from "../paths.js";

export function runtimeDoctor(dataDir: string): Record<string, unknown> {
  const paths = resolveV3DataPaths(dataDir);
  const sandbox = new SandboxManager().status();
  const sock = ipcSocketPath(dataDir);
  const leader = join(paths.coordinatorDir, "leader.lock");
  const systemdUser = which("systemctl") != null;

  return {
    kind: "RuntimeDoctorReport",
    checked_at: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    node: process.version,
    sandbox,
    cgroup_v2: existsSync("/sys/fs/cgroup/cgroup.controllers"),
    bubblewrap: which("bwrap") ?? null,
    unshare: which("unshare") ?? null,
    systemd_user_cli: systemdUser,
    coordinator: {
      socket_exists: existsSync(sock),
      leader_lock_exists: existsSync(leader),
      data_dir: paths.root,
    },
    harness: harnessDoctor(),
    insecure_flags: {
      harness_consent: process.env.EVOLVELOOP_HARNESS_CONSENT === "true",
      allow_host_fallback: process.env.EVOLVELOOP_ALLOW_HOST_FALLBACK === "true",
    },
    notes: [
      "Worktree is not OS sandbox",
      "Host fallback forbidden when profile.require_os_sandbox=true",
      "IDE session control not claimed without API",
    ],
  };
}
