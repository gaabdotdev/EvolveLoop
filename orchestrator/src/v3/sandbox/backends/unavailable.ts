import type {
  SandboxAvailability,
  SandboxBackend,
  SandboxExecRequest,
  SandboxExecResult,
} from "../types.js";

/** Fail-closed backend used when no OS sandbox is available. */
export class UnavailableSandboxBackend implements SandboxBackend {
  readonly backend_id = "unavailable" as const;

  probe(): SandboxAvailability {
    return {
      available: false,
      backend_id: "unavailable",
      reason: "no_os_sandbox_backend",
      notes: ["Silent host fallback is forbidden when require_os_sandbox=true"],
    };
  }

  async exec(request: SandboxExecRequest): Promise<SandboxExecResult> {
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
      block_reason: request.profile.require_os_sandbox
        ? "sandbox_required_unavailable"
        : "backend_unavailable",
      limitations: this.probe().notes,
    };
  }
}
