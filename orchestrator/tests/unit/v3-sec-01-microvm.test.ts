/**
 * V3-SEC-01 — MicroVM max-isolation profile + seccomp-bpf policy / deny battery.
 *
 * Host may lack Firecracker/gVisor: simulated path must remain deterministic and
 * must not invent PASS_LIVE. Honesty: reported | estimated | UNAVAILABLE.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { chmodSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectBackend,
  buildDefaultSeccompPolicy,
  serializeSeccompPolicyJson,
  policyDeniesSyscall,
  applySeccompPolicy,
  runEscapeDenyBattery,
  evaluateMicroVmProfile,
  DEFAULT_DENIED_SYSCALLS,
  ESCAPE_DENY_CASES,
  MICROVM_MAX_ISOLATION_PROFILE_ID,
  MICROVM_LIVE_RUNTIME,
  type SeccompBpfPolicy,
} from "../../src/v3/sandbox/index.js";

describe("V3-SEC-01 microvm profile + seccomp", () => {
  it("documents optional privileged live MicroVM as NÃO_HABILITADO by default", () => {
    expect(MICROVM_LIVE_RUNTIME).toBe("NÃO_HABILITADO");
  });

  let tmp: string;
  let fakeFc: string;
  let fakeRunsc: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v3-sec01-"));
    fakeFc = path.join(tmp, "firecracker");
    fakeRunsc = path.join(tmp, "runsc");
    writeFileSync(fakeFc, "#!/bin/sh\necho fake-fc\n");
    writeFileSync(fakeRunsc, "#!/bin/sh\necho fake-runsc\n");
    chmodSync(fakeFc, 0o755);
    chmodSync(fakeRunsc, 0o755);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("detectBackend reports unavailable when no FC/gVisor (honest)", () => {
    const d = detectBackend({
      paths: {
        firecracker: null,
        jailer: null,
        runsc: null,
        kvm: false,
      },
    });
    expect(d.kind).toBe("MicroVmBackendDetection");
    expect(d.backend).toBe("unavailable");
    expect(d.backend_status).toBe("unavailable");
    expect(d.kvm_present).toBe(false);
    expect(d.honesty).toBe("reported");
    expect(d.notes.some((n) => n.includes("UNAVAILABLE"))).toBe(true);
  });

  it("detectBackend prefers firecracker then gvisor; prefer=gvisor flips", () => {
    const fc = detectBackend({
      paths: { firecracker: fakeFc, runsc: fakeRunsc, kvm: true },
    });
    expect(fc.backend).toBe("firecracker");
    expect(fc.kvm_present).toBe(true);

    const gv = detectBackend({
      prefer: "gvisor",
      paths: { firecracker: fakeFc, runsc: fakeRunsc, kvm: true },
    });
    expect(gv.backend).toBe("gvisor");
    expect(gv.runsc_path).toBe(fakeRunsc);

    const onlyGv = detectBackend({
      paths: { firecracker: null, runsc: fakeRunsc, kvm: false },
    });
    expect(onlyGv.backend).toBe("gvisor");
  });

  it("buildDefaultSeccompPolicy denies escape-adjacent syscalls", () => {
    const policy = buildDefaultSeccompPolicy();
    expect(policy.kind).toBe("SeccompBpfPolicy");
    expect(policy.default_action).toBe("SCMP_ACT_ERRNO");
    expect(policy.denied_syscalls).toEqual([...DEFAULT_DENIED_SYSCALLS]);
    for (const c of ESCAPE_DENY_CASES) {
      expect(policyDeniesSyscall(policy, c.action)).toBe(true);
    }
    expect(policyDeniesSyscall(policy, "read")).toBe(false);
    expect(policyDeniesSyscall(policy, "write")).toBe(false);
  });

  it("serializeSeccompPolicyJson is deterministic JSON stub", () => {
    const a = serializeSeccompPolicyJson(buildDefaultSeccompPolicy());
    const b = serializeSeccompPolicyJson(buildDefaultSeccompPolicy());
    expect(a).toBe(b);
    expect(a).toContain("SCMP_ACT_ERRNO");
    expect(a).toContain("mount");
    expect(a).toContain("SCMP_ACT_ALLOW");
  });

  it("applySeccompPolicy simulated when backend unavailable", () => {
    const detection = detectBackend({
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    const result = applySeccompPolicy(detection);
    expect(result.applied).toBe(true);
    expect(result.mode).toBe("simulated");
    expect(result.backend).toBe("unavailable");
    expect(result.honesty).toBe("reported");
    expect(result.gaps.some((g) => g.includes("no_nodejs_seccomp"))).toBe(true);
  });

  it("applySeccompPolicy live adapter plan when firecracker present (estimated)", () => {
    const detection = detectBackend({
      paths: { firecracker: fakeFc, runsc: null, kvm: true },
    });
    const result = applySeccompPolicy(detection);
    expect(result.applied).toBe(true);
    expect(result.mode).toBe("live");
    expect(result.backend).toBe("firecracker");
    expect(result.honesty).toBe("estimated");
    expect(result.gaps).toContain("microvm_spawn_not_executed_in_unit_path");
  });

  it("force_simulate overrides live backend → simulated apply", () => {
    const detection = detectBackend({
      paths: { firecracker: fakeFc, runsc: null, kvm: true },
    });
    const result = applySeccompPolicy(detection, buildDefaultSeccompPolicy(), {
      force_simulate: true,
    });
    expect(result.mode).toBe("simulated");
    expect(result.applied).toBe(true);
  });

  it("escape deny battery: all ESCAPE_DENY_CASES denied (simulated)", () => {
    const detection = detectBackend({
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    const policy = buildDefaultSeccompPolicy();
    const battery = runEscapeDenyBattery(policy, detection);
    expect(battery.mode).toBe("simulated");
    expect(battery.cases).toHaveLength(ESCAPE_DENY_CASES.length);
    expect(battery.all_denied).toBe(true);
    expect(battery.honesty).toBe("reported");
    for (const c of battery.cases) {
      expect(c.outcome).toBe("denied");
    }
  });

  it("escape deny battery fails closed when policy omits a deny", () => {
    const detection = detectBackend({
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    const weak: SeccompBpfPolicy = {
      ...buildDefaultSeccompPolicy(),
      default_action: "SCMP_ACT_ALLOW",
      denied_syscalls: ["mount"], // missing ptrace etc.
    };
    const battery = runEscapeDenyBattery(weak, detection);
    expect(battery.all_denied).toBe(false);
    expect(battery.cases.some((c) => c.action === "ptrace" && c.outcome === "allowed")).toBe(
      true,
    );
  });

  it("evaluateMicroVmProfile → PASS_SIMULATED when backend unavailable", () => {
    const ev = evaluateMicroVmProfile({
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    expect(ev.gate_status).toBe("PASS_SIMULATED");
    expect(ev.backend_status).toBe("unavailable");
    expect(ev.seccomp.mode).toBe("simulated");
    expect(ev.battery.all_denied).toBe(true);
    expect(ev.evidence.backend_status).toEqual({
      value: "unavailable",
      honesty: "reported",
    });
    expect(ev.evidence.gate_status.honesty).toBe("reported");
    expect(ev.evidence.denied_syscall_count.value).toBeGreaterThan(0);
  });

  it("evaluateMicroVmProfile → UNAVAILABLE when require_live and no backend", () => {
    const ev = evaluateMicroVmProfile({
      require_live: true,
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    expect(ev.gate_status).toBe("UNAVAILABLE");
    expect(ev.backend_status).toBe("unavailable");
  });

  it("evaluateMicroVmProfile → PASS_LIVE when firecracker stub present", () => {
    const ev = evaluateMicroVmProfile({
      paths: { firecracker: fakeFc, jailer: null, runsc: null, kvm: true },
    });
    expect(ev.gate_status).toBe("PASS_LIVE");
    expect(ev.backend_status).toBe("firecracker");
    expect(ev.seccomp.mode).toBe("live");
    expect(ev.battery.mode).toBe("live");
    expect(ev.battery.all_denied).toBe(true);
    // Live battery without in-guest probe remains estimated honesty
    expect(ev.evidence.battery_all_denied.honesty).toBe("estimated");
  });

  it("evaluateMicroVmProfile → PASS_SIMULATED under force_simulate even with backend", () => {
    const ev = evaluateMicroVmProfile({
      force_simulate: true,
      paths: { firecracker: fakeFc, runsc: null, kvm: true },
    });
    expect(ev.gate_status).toBe("PASS_SIMULATED");
    expect(ev.backend_status).toBe("firecracker");
    expect(ev.seccomp.mode).toBe("simulated");
  });

  it("evaluateMicroVmProfile → UNAVAILABLE when battery fails (weak policy)", () => {
    const weak: SeccompBpfPolicy = {
      ...buildDefaultSeccompPolicy(),
      default_action: "SCMP_ACT_ALLOW",
      denied_syscalls: ["mount"],
    };
    const ev = evaluateMicroVmProfile({
      policy: weak,
      paths: { firecracker: null, runsc: null, kvm: false },
    });
    expect(ev.battery.all_denied).toBe(false);
    expect(ev.gate_status).toBe("UNAVAILABLE");
    expect(MICROVM_MAX_ISOLATION_PROFILE_ID).toBe("microvm-max-isolation-v3-sec-01");
  });

  it("host probe (no injection): documents real backend_status without inventing LIVE", () => {
    const host = detectBackend();
    const ev = evaluateMicroVmProfile();
    expect(["firecracker", "gvisor", "unavailable"]).toContain(host.backend);
    expect(ev.backend_status).toBe(host.backend);
    if (host.backend === "unavailable") {
      expect(ev.gate_status).toBe("PASS_SIMULATED");
      expect(ev.seccomp.mode).toBe("simulated");
    } else {
      expect(ev.gate_status).toBe("PASS_LIVE");
    }
    // Never invent UNAVAILABLE honesty on gate when evaluation completed
    expect(ev.evidence.gate_status.honesty).not.toBe("UNAVAILABLE");
  });
});
