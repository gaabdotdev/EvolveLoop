/**
 * SandboxManager — selects backend, enforces fail-closed, exposes doctor status.
 * Integrates ApprovalBroker for require_approval decisions (ISSUE-SEC-C01).
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
import { assertAllowed, evaluateCapability, SecurityPolicyError } from "../security/enforcer.js";
import type { ApprovalBroker } from "../approvals/broker.js";
import type { CapabilityAction } from "../security/types.js";

export class SandboxManager {
  private readonly backends: SandboxBackend[];
  private readonly broker?: ApprovalBroker;

  constructor(backends?: SandboxBackend[], broker?: ApprovalBroker) {
    this.backends = backends ?? [new BubblewrapBackend(), new UnavailableSandboxBackend()];
    this.broker = broker;
  }

  status(): {
    preferred?: SandboxAvailability;
    backends: SandboxAvailability[];
    os: NodeJS.Platform;
    approval_broker_wired: boolean;
  } {
    const backends = this.backends.map((b) => b.probe());
    const preferred = backends.find((b) => b.available);
    return {
      preferred,
      backends,
      os: process.platform,
      approval_broker_wired: !!this.broker,
    };
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

  /**
   * Gate a sensitive capability: allow | deny | pending_approval | authorized via grant.
   * Production callers must use this (or ApprovalBroker directly) — never treat
   * require_approval as silent allow.
   */
  gateAction(
    profile: SandboxProfile,
    action: CapabilityAction,
    opts: {
      work_id: string;
      resource: string;
      justification: string;
      approval_id?: string;
      task_id?: string;
      agent_id?: string;
      goal_id?: string;
    },
  ):
    | { status: "allow" }
    | { status: "deny"; reason: string }
    | { status: "pending_approval"; approval_id: string }
    | { status: "authorized"; approval_id: string } {
    if (opts.approval_id) {
      if (!this.broker) {
        return { status: "deny", reason: "approval_broker_not_wired" };
      }
      const auth = this.broker.authorize(opts.approval_id, action, opts.resource);
      if (!auth.ok) return { status: "deny", reason: auth.reason };
      return { status: "authorized", approval_id: opts.approval_id };
    }

    if (!this.broker) {
      // Fail-closed when policy requires approval and no broker is attached.
      const decision = evaluateCapability(profile, action, { resource: opts.resource });
      if (decision.decision === "require_approval") {
        return { status: "deny", reason: "requires_approval_broker_unwired" };
      }
      if (decision.decision === "deny") {
        return { status: "deny", reason: decision.reason };
      }
      return { status: "allow" };
    }

    const result = this.broker.evaluateAndMaybeRequest(profile, action, {
      work_id: opts.work_id,
      resource: opts.resource,
      justification: opts.justification,
      task_id: opts.task_id,
      agent_id: opts.agent_id,
      goal_id: opts.goal_id,
    });
    if (result.status === "pending_approval") {
      return { status: "pending_approval", approval_id: result.approval.approval_id };
    }
    return result;
  }

  async exec(request: SandboxExecRequest): Promise<SandboxExecResult> {
    // Capability gate before spawn.
    try {
      if (request.approval_id && this.broker) {
        const op = (request.approval_operation ?? "process.spawn") as CapabilityAction;
        const resource = request.approval_resource ?? request.argv.join(" ");
        const auth = this.broker.authorize(request.approval_id, op, resource);
        if (!auth.ok) {
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
            block_reason: `approval_denied:${auth.reason}`,
            limitations: ["approval_required"],
          };
        }
      } else {
        assertAllowed(request.profile, "process.spawn");
        assertAllowed(request.profile, "shell.execute");
      }
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
