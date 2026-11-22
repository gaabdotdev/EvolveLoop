/**
 * V3-SEC-03 — Out-of-band eBPF audit: OOB ↔ runtime correlation + 0% bypass battery.
 *
 * Host may lack CAP_BPF / bpftool: simulated path must stay deterministic and
 * must not invent PASS_LIVE. Honesty: reported | estimated | UNAVAILABLE.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectEbpfCapability,
  parseCapEffFromStatus,
  createEbpfAuditor,
  correlateOutOfBand,
  correlateSession,
  runBypassBattery,
  evaluateEbpfAudit,
  BYPASS_BATTERY_CASES,
  EBPF_AUDIT_SCHEMA_VERSION,
  EBPF_AUDIT_PROFILE_ID,
  EBPF_LIVE_RUNTIME,
  CAP_BPF,
  CAP_PERFMON,
  CAP_SYS_ADMIN,
  type OutOfBandEvent,
  type RuntimeAuditLogEntry,
} from "../../src/v3/security/index.js";

function capMask(...bits: number[]): string {
  let mask = 0n;
  for (const b of bits) mask |= 1n << BigInt(b);
  return mask.toString(16).padStart(16, "0");
}

describe("V3-SEC-03 eBPF out-of-band audit", () => {
  it("documents optional privileged live eBPF as NÃO_HABILITADO by default", () => {
    expect(EBPF_LIVE_RUNTIME).toBe("NÃO_HABILITADO");
  });

  let tmp: string;
  let fakeBpftool: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "v3-sec03-"));
    fakeBpftool = path.join(tmp, "bpftool");
    writeFileSync(fakeBpftool, "#!/bin/sh\necho fake-bpftool\n");
    chmodSync(fakeBpftool, 0o755);
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("parseCapEffFromStatus reads CAP_BPF / PERFMON / SYS_ADMIN bits", () => {
    const withBpf = parseCapEffFromStatus(
      `Name:\tnode\nCapEff:\t${capMask(CAP_BPF, CAP_PERFMON)}\n`,
    );
    expect(withBpf.cap_bpf_effective).toBe(true);
    expect(withBpf.cap_perfmon_effective).toBe(true);
    expect(withBpf.cap_sys_admin_effective).toBe(false);

    const legacy = parseCapEffFromStatus(`CapEff:\t${capMask(CAP_SYS_ADMIN)}\n`);
    expect(legacy.cap_sys_admin_effective).toBe(true);
    expect(legacy.cap_bpf_effective).toBe(false);

    const empty = parseCapEffFromStatus("CapEff:\t0000000000000000\n");
    expect(empty.cap_bpf_effective).toBe(false);
  });

  it("detectEbpfCapability reports unavailable without CAP_BPF and bpftool (honest)", () => {
    const d = detectEbpfCapability({
      capability: {
        cap_bpf_effective: false,
        cap_perfmon_effective: false,
        cap_sys_admin_effective: false,
        bpftool_path: null,
        bpf_fs_accessible: false,
      },
    });
    expect(d.kind).toBe("EbpfCapabilityDetection");
    expect(d.backend_status).toBe("unavailable");
    expect(d.bpftool_path).toBeNull();
    expect(d.honesty).toBe("reported");
    expect(d.notes.some((n) => n.includes("UNAVAILABLE"))).toBe(true);
  });

  it("detectEbpfCapability → live only when CAP_BPF (or SYS_ADMIN) + bpftool", () => {
    const noTool = detectEbpfCapability({
      capability: {
        cap_bpf_effective: true,
        bpftool_path: null,
        bpf_fs_accessible: true,
      },
    });
    expect(noTool.backend_status).toBe("unavailable");

    const live = detectEbpfCapability({
      capability: {
        cap_bpf_effective: true,
        cap_perfmon_effective: true,
        bpftool_path: fakeBpftool,
        bpf_fs_accessible: true,
      },
    });
    expect(live.backend_status).toBe("live");
    expect(live.bpftool_path).toBe(fakeBpftool);

    const legacy = detectEbpfCapability({
      capability: {
        cap_bpf_effective: false,
        cap_sys_admin_effective: true,
        bpftool_path: fakeBpftool,
        bpf_fs_accessible: true,
      },
    });
    expect(legacy.backend_status).toBe("live");
  });

  it("recordOutOfBand + runtime correlate 1:1 when honest", () => {
    const { oob, runtime, mode } = createEbpfAuditor({
      force_simulate: true,
      capability: {
        cap_bpf_effective: false,
        bpftool_path: null,
        bpf_fs_accessible: false,
      },
    });
    expect(mode).toBe("simulated");

    const rec = oob.recordOutOfBand({
      correlation_id: "c1",
      category: "file",
      subject: "/workspace/a.ts",
      action: "open",
      timestamp_ms: 100,
    });
    expect(rec.accepted).toBe(true);
    expect(rec.event.source).toBe("simulated");

    runtime.append({
      correlation_id: "c1",
      category: "file",
      subject: "/workspace/a.ts",
      action: "open",
      timestamp_ms: 100,
    });

    const corr = correlateOutOfBand(rec.event, runtime.list());
    expect(corr.matched).toBe(true);
    expect(corr.bypass_detected).toBe(false);
    expect(corr.discrepancy).toBe("none");
  });

  it("OOB ledger is immutable: no mutate/replace; seal blocks further records", () => {
    const { oob, runtime } = createEbpfAuditor({
      force_simulate: true,
      capability: {
        cap_bpf_effective: false,
        bpftool_path: null,
      },
    });

    const first = oob.recordOutOfBand({
      correlation_id: "immutable",
      category: "process",
      subject: "/bin/sh",
      action: "exec",
      timestamp_ms: 1,
    });
    expect(first.accepted).toBe(true);

    const dup = oob.recordOutOfBand({
      correlation_id: "immutable",
      category: "process",
      subject: "/bin/evil",
      action: "exec",
      timestamp_ms: 2,
    });
    expect(dup.accepted).toBe(false);
    expect(dup.reason).toContain("immutable");
    expect(oob.list()[0]!.subject).toBe("/bin/sh");

    // Runtime CAN be tampered — that is the point of OOB correlation
    runtime.append({
      correlation_id: "immutable",
      category: "process",
      subject: "/bin/sh",
      action: "exec",
      timestamp_ms: 1,
    });
    expect(runtime.tamperRewrite("immutable", { subject: "/bin/benign" })).toBe(
      true,
    );
    const afterTamper = correlateOutOfBand(first.event, runtime.list());
    expect(afterTamper.bypass_detected).toBe(true);
    expect(afterTamper.discrepancy).toBe("subject_mismatch");

    oob.seal();
    const afterSeal = oob.recordOutOfBand({
      correlation_id: "new",
      category: "network",
      subject: "x:443",
      action: "connect",
      timestamp_ms: 3,
    });
    expect(afterSeal.accepted).toBe(false);
    expect(afterSeal.reason).toBe("ledger_sealed_immutable");
  });

  it("correlateSession detects omit / alter across file+process+network", () => {
    const oobEvents: OutOfBandEvent[] = [
      {
        kind: "OutOfBandEvent",
        event_id: "e1",
        category: "file",
        subject: "/etc/shadow",
        action: "open",
        timestamp_ms: 1,
        correlation_id: "a",
        source: "simulated",
      },
      {
        kind: "OutOfBandEvent",
        event_id: "e2",
        category: "network",
        subject: "evil:443",
        action: "connect",
        timestamp_ms: 2,
        correlation_id: "b",
        source: "simulated",
      },
      {
        kind: "OutOfBandEvent",
        event_id: "e3",
        category: "process",
        subject: "/usr/bin/node",
        action: "exec",
        timestamp_ms: 3,
        correlation_id: "c",
        source: "simulated",
      },
    ];
    const runtime: RuntimeAuditLogEntry[] = [
      {
        kind: "RuntimeAuditLogEntry",
        log_id: "r2",
        correlation_id: "b",
        category: "network",
        subject: "good.example:443",
        action: "connect",
        timestamp_ms: 2,
        agent_visible: true,
      },
      {
        kind: "RuntimeAuditLogEntry",
        log_id: "r3",
        correlation_id: "c",
        category: "process",
        subject: "/usr/bin/node",
        action: "exec",
        timestamp_ms: 3,
        agent_visible: true,
      },
    ];

    const results = correlateSession(oobEvents, runtime);
    expect(results[0]!.bypass_detected).toBe(true);
    expect(results[0]!.discrepancy).toBe("runtime_omitted");
    expect(results[1]!.bypass_detected).toBe(true);
    expect(results[1]!.discrepancy).toBe("subject_mismatch");
    expect(results[2]!.matched).toBe(true);
    expect(results[2]!.bypass_detected).toBe(false);
  });

  it("bypass battery: 0% bypass in simulated mode", () => {
    const detection = detectEbpfCapability({
      capability: {
        cap_bpf_effective: false,
        bpftool_path: null,
        bpf_fs_accessible: false,
      },
    });
    const battery = runBypassBattery(detection, { force_simulate: true });
    expect(battery.mode).toBe("simulated");
    expect(battery.cases).toHaveLength(BYPASS_BATTERY_CASES.length);
    expect(battery.bypass_rate).toBe(0);
    expect(battery.zero_bypass).toBe(true);
    expect(battery.honesty).toBe("reported");

    for (const c of battery.cases) {
      const meta = BYPASS_BATTERY_CASES.find((x) => x.id === c.id)!;
      if (meta.tamper === "honest") {
        expect(c.matched).toBe(true);
        expect(c.bypass_detected).toBe(false);
      } else {
        expect(c.bypass_detected).toBe(true);
      }
    }
  });

  it("evaluateEbpfAudit → PASS_SIMULATED when CAP_BPF/bpftool unavailable", () => {
    const ev = evaluateEbpfAudit({
      capability: {
        cap_bpf_effective: false,
        cap_sys_admin_effective: false,
        bpftool_path: null,
        bpf_fs_accessible: false,
      },
    });
    expect(ev.kind).toBe("EbpfAuditEvaluation");
    expect(ev.schema_version).toBe(EBPF_AUDIT_SCHEMA_VERSION);
    expect(ev.profile_id).toBe(EBPF_AUDIT_PROFILE_ID);
    expect(ev.gate_status).toBe("PASS_SIMULATED");
    expect(ev.backend_status).toBe("unavailable");
    expect(ev.mode).toBe("simulated");
    expect(ev.battery.zero_bypass).toBe(true);
    expect(ev.evidence.bypass_rate.value).toBe(0);
    expect(ev.evidence.gate_status.honesty).toBe("reported");
  });

  it("evaluateEbpfAudit → UNAVAILABLE when require_live and no capability", () => {
    const ev = evaluateEbpfAudit({
      require_live: true,
      capability: {
        cap_bpf_effective: false,
        bpftool_path: null,
      },
    });
    expect(ev.gate_status).toBe("UNAVAILABLE");
    expect(ev.mode).toBe("unavailable");
    expect(ev.evidence.zero_bypass.honesty).toBe("UNAVAILABLE");
  });

  it("evaluateEbpfAudit → PASS_LIVE when CAP_BPF + bpftool (estimated attach)", () => {
    const ev = evaluateEbpfAudit({
      capability: {
        cap_bpf_effective: true,
        cap_perfmon_effective: true,
        bpftool_path: fakeBpftool,
        bpf_fs_accessible: true,
      },
    });
    expect(ev.gate_status).toBe("PASS_LIVE");
    expect(ev.backend_status).toBe("live");
    expect(ev.mode).toBe("live");
    expect(ev.battery.zero_bypass).toBe(true);
    expect(ev.evidence.bypass_rate.honesty).toBe("estimated");
  });

  it("force_simulate overrides live capability → PASS_SIMULATED", () => {
    const ev = evaluateEbpfAudit({
      force_simulate: true,
      capability: {
        cap_bpf_effective: true,
        bpftool_path: fakeBpftool,
        bpf_fs_accessible: true,
      },
    });
    expect(ev.gate_status).toBe("PASS_SIMULATED");
    expect(ev.backend_status).toBe("live");
    expect(ev.mode).toBe("simulated");
  });

  it("host probe (no injection): documents real backend without inventing LIVE", () => {
    const host = detectEbpfCapability();
    const ev = evaluateEbpfAudit();
    expect(["live", "unavailable"]).toContain(host.backend_status);
    expect(ev.backend_status).toBe(host.backend_status);
    if (host.backend_status === "unavailable") {
      expect(ev.gate_status).toBe("PASS_SIMULATED");
      expect(ev.mode).toBe("simulated");
      expect(ev.battery.bypass_rate).toBe(0);
    } else {
      expect(ev.gate_status).toBe("PASS_LIVE");
    }
    expect(ev.evidence.gate_status.honesty).not.toBe("UNAVAILABLE");
  });
});
