/**
 * SandboxManager — selects backend, enforces fail-closed, exposes doctor status.
 */

import { BubblewrapBackend } from "./backends/bubblewrap.js";
import { UnavailableSandboxBackend } from "./backends/unavailable.js";
import type {
  SandboxAvailability,
  SandboxBackend,
  SandboxExecRequest,
  SandboxExecResult,
} from "./types.js";
import type { SandboxProfile } from "../security/types.js";
import { assertAllowed, SecurityPolicyError } from "../security/enforcer.js";

export class SandboxManager {
  private readonly backends: SandboxBackend[];

  constructor(backends?: SandboxBackend[]) {
    this.backends = backends ?? [new BubblewrapBackend(), new UnavailableSandboxBackend()];
  }

  status(): {
    preferred?: SandboxAvailability;
    backends: SandboxAvailability[];
    os: NodeJS.Platform;
  } {
    const backends = this.backends.map((b) => b.probe());
    const preferred = backends.find((b) => b.available);
    return { preferred, backends, os: process.platform };
  }

  selectBackend(profile: SandboxProfile): SandboxBackend {
    for (const b of this.backends) {
      const p = b.probe();
      if (p.available) return b;
    }
    if (profile.require_os_sandbox) {
      return this.backends.find((b) => b.backend_id === "unavailable") ?? new UnavailableSandboxBackend();
    }
    return this.backends[this.backends.length - 1]!;
  }

  async exec(request: SandboxExecRequest): Promise<SandboxExecResult> {
    // Capability gate before spawn.
    try {
      assertAllowed(request.profile, "process.spawn");
      assertAllowed(request.profile, "shell.execute");
    } catch (err) {
      if (err instanceof SecurityPolicyError) {
        return {
          kind: "SandboxExecResult",
          backend_id: "unavailable",
          exit_code: null,
          signal: null,
          stdout: "",
          stderr: "",
          timed_out: false,
          duration_ms: 0,
          blocked: true,
          block_reason: err.message,
          limitations: ["policy_denied"],
        };
      }
      throw err;
    }

    const backend = this.selectBackend(request.profile);
    const probe = backend.probe();
    if (request.profile.require_os_sandbox && !probe.available) {
      return {
        kind: "SandboxExecResult",
        backend_id: backend.backend_id,
        exit_code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timed_out: false,
        duration_ms: 0,
        blocked: true,
        block_reason: "sandbox_required_unavailable_no_host_fallback",
        limitations: probe.notes,
      };
    }
    return backend.exec(request);
  }
}
