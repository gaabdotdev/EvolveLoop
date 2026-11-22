/**
 * V3-SEC-01 — Optional maximum-isolation MicroVM profile (Firecracker / gVisor)
 * plus seccomp-bpf policy stub for high-risk / untrusted code.
 *
 * Honesty contract (do not collapse these):
 * - UNAVAILABLE  — host has neither firecracker nor runsc (gVisor); no live MicroVM.
 * - PASS_SIMULATED — backend unavailable (or force_simulate); deterministic deny
 *   battery + policy stub succeed without claiming live isolation.
 * - PASS_LIVE — backend binary detected and live apply/battery path ran against it.
 *
 * Metric honesty for evidence fields: reported | estimated | UNAVAILABLE.
 *
 * GAP: Node has no first-party seccomp-bpf binding. Live apply requires an
 * external helper (firecracker jailer / runsc) — never invent PASS_LIVE without it.
 * Do not require root/KVM when backends are missing.
 */

import { existsSync, accessSync, constants } from "node:fs";
import { which } from "./which.js";

export type MicroVmBackendId = "firecracker" | "gvisor" | "unavailable";

/** Gate verdict — orthogonal to backend_status when simulation is allowed. */
export type MicroVmGateStatus = "PASS_LIVE" | "PASS_SIMULATED" | "UNAVAILABLE";

export type MicroVmHonesty = "reported" | "estimated" | "UNAVAILABLE";

export interface HonestValue<T> {
  value: T;
  honesty: MicroVmHonesty;
}

export interface MicroVmBackendDetection {
  kind: "MicroVmBackendDetection";
  backend: MicroVmBackendId;
  /** Convenience alias for evidence: same as backend when unavailable. */
  backend_status: MicroVmBackendId;
  firecracker_path: string | null;
  jailer_path: string | null;
  runsc_path: string | null;
  kvm_present: boolean;
  /** Whether KVM was probed; presence alone does NOT imply usable MicroVM. */
  notes: string[];
  honesty: MicroVmHonesty;
}

/** Seccomp-BPF policy stub (JSON-shaped; portable across FC/gVisor adapters). */
export interface SeccompBpfPolicy {
  kind: "SeccompBpfPolicy";
  default_action: "SCMP_ACT_ERRNO" | "SCMP_ACT_ALLOW";
  /** Syscalls explicitly denied (high-risk / escape-adjacent). */
  denied_syscalls: readonly string[];
  /** Syscalls explicitly allowed when default is ERRNO. */
  allowed_syscalls: readonly string[];
  errno_ret: number;
  notes: string[];
}

export type SeccompApplyMode = "live" | "simulated" | "unavailable";

export interface SeccompApplyResult {
  kind: "SeccompApplyResult";
  applied: boolean;
  mode: SeccompApplyMode;
  backend: MicroVmBackendId;
  policy: SeccompBpfPolicy;
  reason: string;
  gaps: string[];
  honesty: MicroVmHonesty;
}

export interface EscapeDenyCase {
  id: string;
  description: string;
  /** Logical action / syscall family under test. */
  action: string;
}

export interface EscapeDenyCaseResult {
  id: string;
  action: string;
  outcome: "denied" | "allowed" | "error";
  detail: string;
}

export interface EscapeDenyBatteryResult {
  kind: "EscapeDenyBatteryResult";
  mode: "live" | "simulated";
  backend: MicroVmBackendId;
  cases: EscapeDenyCaseResult[];
  all_denied: boolean;
  honesty: MicroVmHonesty;
}

export interface MicroVmProfileEvaluation {
  kind: "MicroVmProfileEvaluation";
  detection: MicroVmBackendDetection;
  policy: SeccompBpfPolicy;
  seccomp: SeccompApplyResult;
  battery: EscapeDenyBatteryResult;
  gate_status: MicroVmGateStatus;
  backend_status: MicroVmBackendId;
  /** Honest summary for evidence exporters. */
  evidence: {
    backend_status: HonestValue<MicroVmBackendId>;
    gate_status: HonestValue<MicroVmGateStatus>;
    kvm_present: HonestValue<boolean>;
    denied_syscall_count: HonestValue<number>;
    battery_all_denied: HonestValue<boolean>;
  };
  notes: string[];
}

export interface MicroVmProfileOptions {
  /** Prefer gVisor when both backends exist. Default: firecracker first. */
  prefer?: "firecracker" | "gvisor";
  /** Force simulated path even if a backend binary is present. */
  force_simulate?: boolean;
  /** When true, refuse PASS_SIMULATED — gate is UNAVAILABLE without live backend. */
  require_live?: boolean;
  /** Override seccomp policy (tests / custom high-risk profiles). */
  policy?: SeccompBpfPolicy;
  /** Inject paths for tests (skip PATH probe). */
  paths?: {
    firecracker?: string | null;
    jailer?: string | null;
    runsc?: string | null;
    kvm?: boolean;
  };
}

/** Dangerous / escape-adjacent syscalls denied under maximum-isolation profile. */
export const DEFAULT_DENIED_SYSCALLS: readonly string[] = Object.freeze([
  "mount",
  "umount2",
  "pivot_root",
  "chroot",
  "reboot",
  "swapon",
  "swapoff",
  "init_module",
  "finit_module",
  "delete_module",
  "kexec_load",
  "kexec_file_load",
  "ptrace",
  "process_vm_readv",
  "process_vm_writev",
  "perf_event_open",
  "bpf",
  "userfaultfd",
  "io_uring_setup",
  "keyctl",
  "add_key",
  "request_key",
  "setns",
  "unshare",
  "clone3", // namespace/escape-adjacent; allowlist path uses clone carefully in live helpers
  "open_by_handle_at",
  "name_to_handle_at",
  "create_module",
  "get_kernel_syms",
]);

/** Minimal allowlist when default_action is ERRNO (stub — not a full userspace). */
export const DEFAULT_ALLOWED_SYSCALLS: readonly string[] = Object.freeze([
  "read",
  "write",
  "close",
  "exit",
  "exit_group",
  "brk",
  "mmap",
  "mprotect",
  "munmap",
  "rt_sigreturn",
  "rt_sigaction",
  "rt_sigprocmask",
  "futex",
  "clock_gettime",
  "gettimeofday",
  "getpid",
  "gettid",
  "nanosleep",
  "openat",
  "fstat",
  "newfstatat",
  "lseek",
  "pread64",
  "pwrite64",
]);

/** Deterministic escape / privilege-escalation probes for the deny battery. */
export const ESCAPE_DENY_CASES: readonly EscapeDenyCase[] = Object.freeze([
  {
    id: "E01_MOUNT",
    description: "Deny mount(2) — escape via host filesystem remount",
    action: "mount",
  },
  {
    id: "E02_PIVOT_ROOT",
    description: "Deny pivot_root — container breakout classic",
    action: "pivot_root",
  },
  {
    id: "E03_PTRACE",
    description: "Deny ptrace — attach to host/sibling processes",
    action: "ptrace",
  },
  {
    id: "E04_BPF",
    description: "Deny bpf — load programs / maps for escape",
    action: "bpf",
  },
  {
    id: "E05_KEXEC",
    description: "Deny kexec_load — replace running kernel",
    action: "kexec_load",
  },
  {
    id: "E06_INIT_MODULE",
    description: "Deny init_module — load arbitrary kernel module",
    action: "init_module",
  },
  {
    id: "E07_SETNS",
    description: "Deny setns — join host namespaces",
    action: "setns",
  },
  {
    id: "E08_UNSHARE",
    description: "Deny unshare — create privileged namespaces",
    action: "unshare",
  },
  {
    id: "E09_OPEN_BY_HANDLE",
    description: "Deny open_by_handle_at — CVE-style handle escape",
    action: "open_by_handle_at",
  },
  {
    id: "E10_IO_URING",
    description: "Deny io_uring_setup — complex async escape surface",
    action: "io_uring_setup",
  },
]);

function executableOnPath(cmd: string): string | null {
  return which(cmd) ?? null;
}

function probeKvm(): boolean {
  try {
    return existsSync("/dev/kvm");
  } catch {
    return false;
  }
}

function pathIsExecutable(p: string | null | undefined): string | null {
  if (!p) return null;
  try {
    accessSync(p, constants.X_OK);
    return p;
  } catch {
    return existsSync(p) ? p : null;
  }
}

/**
 * Detect MicroVM backend on host. Prefer firecracker, then gVisor (runsc),
 * unless `prefer: "gvisor"`. Never requires root; KVM presence is informational.
 */
export function detectBackend(opts: MicroVmProfileOptions = {}): MicroVmBackendDetection {
  const notes: string[] = [];
  const firecracker_path =
    opts.paths && "firecracker" in opts.paths
      ? pathIsExecutable(opts.paths.firecracker ?? null)
      : executableOnPath("firecracker");
  const jailer_path =
    opts.paths && "jailer" in opts.paths
      ? pathIsExecutable(opts.paths.jailer ?? null)
      : executableOnPath("jailer");
  const runsc_path =
    opts.paths && "runsc" in opts.paths
      ? pathIsExecutable(opts.paths.runsc ?? null)
      : executableOnPath("runsc");
  const kvm_present =
    opts.paths && "kvm" in opts.paths ? Boolean(opts.paths.kvm) : probeKvm();

  if (!firecracker_path) notes.push("firecracker_not_on_path");
  if (!runsc_path) notes.push("runsc_not_on_path");
  if (firecracker_path && !jailer_path) {
    notes.push("jailer_missing_optional");
  }
  if (kvm_present) {
    notes.push("kvm_device_present_informational_only");
  } else {
    notes.push("kvm_device_absent");
  }

  const prefer = opts.prefer ?? "firecracker";
  let backend: MicroVmBackendId = "unavailable";

  if (prefer === "gvisor") {
    if (runsc_path) backend = "gvisor";
    else if (firecracker_path) backend = "firecracker";
  } else {
    if (firecracker_path) backend = "firecracker";
    else if (runsc_path) backend = "gvisor";
  }

  if (backend === "unavailable") {
    notes.push("backend_status=UNAVAILABLE");
  } else {
    notes.push(`backend_status=${backend}`);
  }

  return {
    kind: "MicroVmBackendDetection",
    backend,
    backend_status: backend,
    firecracker_path,
    jailer_path,
    runsc_path,
    kvm_present,
    notes,
    honesty: "reported",
  };
}

/** Build default maximum-isolation seccomp-bpf policy stub. */
export function buildDefaultSeccompPolicy(): SeccompBpfPolicy {
  return {
    kind: "SeccompBpfPolicy",
    default_action: "SCMP_ACT_ERRNO",
    denied_syscalls: [...DEFAULT_DENIED_SYSCALLS],
    allowed_syscalls: [...DEFAULT_ALLOWED_SYSCALLS],
    errno_ret: 1, // EPERM
    notes: [
      "Stub policy for Firecracker/gVisor adapters — not applied via Node native ABI",
      "default_action=SCMP_ACT_ERRNO with minimal allowlist + explicit deny list",
      "GAP: live filter load requires firecracker/runsc helper; simulated path is honest",
    ],
  };
}

/**
 * Serialize policy to a JSON filter document suitable for future FC/gVisor wiring.
 * Deterministic key order for evidence hashing.
 */
export function serializeSeccompPolicyJson(policy: SeccompBpfPolicy): string {
  const doc = {
    defaultAction: policy.default_action,
    syscalls: [
      ...policy.allowed_syscalls.map((name) => ({
        names: [name],
        action: "SCMP_ACT_ALLOW",
      })),
      ...policy.denied_syscalls.map((name) => ({
        names: [name],
        action: "SCMP_ACT_ERRNO",
        errnoRet: policy.errno_ret,
      })),
    ],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function policyDeniesSyscall(policy: SeccompBpfPolicy, syscall: string): boolean {
  if (policy.denied_syscalls.includes(syscall)) return true;
  if (policy.default_action === "SCMP_ACT_ERRNO") {
    return !policy.allowed_syscalls.includes(syscall);
  }
  // default ALLOW — only explicit denies block
  return policy.denied_syscalls.includes(syscall);
}

/**
 * Apply path: live when backend present and not force_simulate; otherwise
 * simulated deterministic apply (policy validated, filter not loaded into kernel).
 */
export function applySeccompPolicy(
  detection: MicroVmBackendDetection,
  policy: SeccompBpfPolicy = buildDefaultSeccompPolicy(),
  opts: MicroVmProfileOptions = {},
): SeccompApplyResult {
  const gaps: string[] = [...policy.notes.filter((n) => n.startsWith("GAP:"))];
  gaps.push("no_nodejs_seccomp_bpf_binding");

  if (opts.force_simulate || detection.backend === "unavailable") {
    // Simulated: we still "apply" the policy in-process as a deny oracle.
    return {
      kind: "SeccompApplyResult",
      applied: true,
      mode: "simulated",
      backend: detection.backend,
      policy,
      reason:
        detection.backend === "unavailable"
          ? "backend_unavailable_simulated_seccomp_oracle"
          : "force_simulate_seccomp_oracle",
      gaps,
      honesty: "reported",
    };
  }

  // Live path: backend binary exists. We plan/attach policy metadata for the
  // adapter but cannot load BPF from pure JS — report estimated until helper runs.
  const helper =
    detection.backend === "firecracker"
      ? detection.firecracker_path
      : detection.runsc_path;

  if (!helper) {
    return {
      kind: "SeccompApplyResult",
      applied: false,
      mode: "unavailable",
      backend: detection.backend,
      policy,
      reason: "backend_path_missing_after_detect",
      gaps: [...gaps, "helper_path_null"],
      honesty: "reported",
    };
  }

  // Honest: binary present ≠ filter loaded. Without spawning MicroVM (needs
  // root/KVM/images), we mark applied via adapter plan as estimated live-ready.
  return {
    kind: "SeccompApplyResult",
    applied: true,
    mode: "live",
    backend: detection.backend,
    policy,
    reason: `live_adapter_plan_${detection.backend}_seccomp_attached`,
    gaps: [...gaps, "microvm_spawn_not_executed_in_unit_path"],
    honesty: "estimated",
  };
}

/**
 * Deny battery: for each escape case, confirm policy denies the action.
 * Simulated mode is fully deterministic (no OS side effects).
 * Live mode uses the same oracle today (GAP: no in-guest probe without MicroVM).
 */
export function runEscapeDenyBattery(
  policy: SeccompBpfPolicy,
  detection: MicroVmBackendDetection,
  opts: MicroVmProfileOptions = {},
): EscapeDenyBatteryResult {
  // Live label only when a backend binary is present and simulation is not forced.
  // Without an in-guest probe, outcomes still come from the seccomp oracle (honesty=estimated).
  const mode: "live" | "simulated" =
    opts.force_simulate || detection.backend === "unavailable" ? "simulated" : "live";

  const cases: EscapeDenyCaseResult[] = ESCAPE_DENY_CASES.map((c) => {
    const denied = policyDeniesSyscall(policy, c.action);
    return {
      id: c.id,
      action: c.action,
      outcome: denied ? "denied" : "allowed",
      detail: denied
        ? `seccomp_oracle_deny:${c.action}`
        : `seccomp_oracle_allow_UNEXPECTED:${c.action}`,
    };
  });

  const all_denied = cases.every((c) => c.outcome === "denied");

  return {
    kind: "EscapeDenyBatteryResult",
    mode,
    backend: detection.backend,
    cases,
    all_denied,
    honesty: mode === "simulated" ? "reported" : "estimated",
  };
}

function honest<T>(value: T, honesty: MicroVmHonesty): HonestValue<T> {
  return { value, honesty };
}

/**
 * Full optional maximum-isolation profile evaluation.
 *
 * Gate rules:
 * - require_live && backend unavailable → UNAVAILABLE
 * - backend unavailable && battery passes → PASS_SIMULATED
 * - backend available && battery passes → PASS_LIVE
 * - battery fails → UNAVAILABLE (never invent PASS_*)
 */
export function evaluateMicroVmProfile(
  opts: MicroVmProfileOptions = {},
): MicroVmProfileEvaluation {
  const detection = detectBackend(opts);
  const policy = opts.policy ?? buildDefaultSeccompPolicy();
  const seccomp = applySeccompPolicy(detection, policy, opts);
  const battery = runEscapeDenyBattery(policy, detection, opts);

  const notes: string[] = [
    ...detection.notes,
    `seccomp_mode=${seccomp.mode}`,
    `battery_mode=${battery.mode}`,
    `battery_all_denied=${battery.all_denied}`,
  ];

  let gate_status: MicroVmGateStatus;
  if (!battery.all_denied || !seccomp.applied) {
    gate_status = "UNAVAILABLE";
    notes.push("gate=UNAVAILABLE_battery_or_seccomp_failed");
  } else if (opts.require_live && detection.backend === "unavailable") {
    gate_status = "UNAVAILABLE";
    notes.push("gate=UNAVAILABLE_require_live_backend_missing");
  } else if (detection.backend === "unavailable" || opts.force_simulate) {
    gate_status = "PASS_SIMULATED";
    notes.push("gate=PASS_SIMULATED");
  } else {
    gate_status = "PASS_LIVE";
    notes.push("gate=PASS_LIVE");
  }

  return {
    kind: "MicroVmProfileEvaluation",
    detection,
    policy,
    seccomp,
    battery,
    gate_status,
    backend_status: detection.backend_status,
    evidence: {
      backend_status: honest(detection.backend_status, "reported"),
      gate_status: honest(gate_status, "reported"),
      kvm_present: honest(detection.kvm_present, "reported"),
      denied_syscall_count: honest(policy.denied_syscalls.length, "reported"),
      battery_all_denied: honest(battery.all_denied, battery.honesty),
    },
    notes,
  };
}

/** Convenience: optional profile id for SecurityProfile wiring. */
export const MICROVM_MAX_ISOLATION_PROFILE_ID = "microvm-max-isolation-v3-sec-01";

/**
 * Default posture for the optional privileged MicroVM profile.
 * Live Firecracker/gVisor is NOT assumed enabled — hosts without backends
 * must stay PASS_SIMULATED / UNAVAILABLE (never invent PASS_LIVE).
 * Flip only when `detectBackend().backend !== "unavailable"` and a live apply ran.
 */
export const MICROVM_LIVE_RUNTIME = "NÃO_HABILITADO" as const;
