/**
 * V1-SEC-03 — Phase network isolation --unshare-net + cgroups v2.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  phaseRequiresUnshareNet,
  planPhaseIsolation,
  NETLESS_PHASES,
  probeCgroupV2,
  planCgroupV2Limits,
  applyCgroupV2Limits,
  releaseCgroupV2,
  isBwrapAvailable,
  CGROUP_CPU_CONTROLLER,
} from "../../src/v3/sandbox/index.js";

describe("V1-SEC-03 phase isolation + cgroups", () => {
  it("documents cpu.max controller as NÃO_HABILITADO until can_cpu", () => {
    expect(CGROUP_CPU_CONTROLLER).toBe("NÃO_HABILITADO");
  });

  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-sec03-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("read/analyze phases require unshare-net", () => {
    expect(phaseRequiresUnshareNet("read")).toBe(true);
    expect(phaseRequiresUnshareNet("analyze")).toBe(true);
    expect(phaseRequiresUnshareNet("intake")).toBe(true);
    expect(phaseRequiresUnshareNet("implement")).toBe(false);
    expect(NETLESS_PHASES.has("validate")).toBe(false);
  });

  it("plans limits with mock cgroup when forced", () => {
    const plan = planPhaseIsolation({
      phase: "analyze",
      workspace_rw: tmp,
      argv: ["/bin/true"],
      force_mock_cgroup: true,
      limits: { memory_bytes: 128 * 1024 * 1024, pids_max: 32, cpu_max: "25000 100000" },
    });
    expect(plan.unshare_net).toBe(true);
    expect(plan.planned_limits["memory.max"]).toBe(String(128 * 1024 * 1024));
    expect(plan.planned_limits["pids.max"]).toBe("32");
    expect(plan.planned_limits["cpu.max"]).toBe("25000 100000");
    expect(plan.cgroup.mocked).toBe(true);
    expect(planBwrapHasUnshare(plan)).toBe(true);
  });

  it("planCgroupV2Limits is pure", () => {
    expect(planCgroupV2Limits({ memory_bytes: 1, pids_max: 2 })).toEqual({
      "memory.max": "1",
      "pids.max": "2",
    });
  });

  it("probeCgroupV2 reports host capability honestly", () => {
    const probe = probeCgroupV2();
    expect(probe.kind).toBe("CgroupV2Probe");
    expect(Array.isArray(probe.controllers)).toBe(true);
    expect(Array.isArray(probe.gaps)).toBe(true);
  });

  it("applyCgroupV2Limits: real or mock without throwing", () => {
    const probe = probeCgroupV2();
    const result = applyCgroupV2Limits("sec03-test", {
      memory_bytes: 64 * 1024 * 1024,
      pids_max: 16,
      cpu_max: "10000 100000",
    });
    expect(result.kind).toBe("CgroupV2ApplyResult");
    if (probe.can_memory || probe.can_pids) {
      // May apply partially; cpu often GAP
      expect(result.applied || result.mocked).toBe(true);
    } else {
      expect(result.mocked).toBe(true);
      expect(result.gaps.length).toBeGreaterThan(0);
    }
    releaseCgroupV2(result.path);
  });

  it.runIf(isBwrapAvailable())("analyze plan includes --unshare-net in bwrap argv", () => {
    const plan = planPhaseIsolation({
      phase: "read",
      workspace_rw: tmp,
      argv: ["/bin/true"],
      force_mock_cgroup: true,
    });
    expect(plan.bwrap.available).toBe(true);
    expect(plan.bwrap.argv).toContain("--unshare-net");
  });

  it("host proof: cgroup memory/pids apply OR honest FAIL; unshare-net via bwrap when present", () => {
    const probe = probeCgroupV2();
    const applied = applyCgroupV2Limits("v1-gate-prod-cg", {
      memory_bytes: 64 * 1024 * 1024,
      pids_max: 16,
      cpu_max: "10000 100000",
    });

    // Document CPU GAP without failing if memory/pids work
    if (!probe.can_cpu) {
      expect(probe.gaps.some((g) => /cpu/i.test(g))).toBe(true);
    }

    const provedCgroup = applied.applied === true && applied.mocked === false;
    if (!provedCgroup) {
      releaseCgroupV2(applied.path);
      expect.fail(
        `V1-GATE-PROD cgroup FAIL: cannot apply real limits on host. probe=${JSON.stringify(probe)} result=${JSON.stringify(applied)}`,
      );
    }
    expect(applied.reason).toMatch(/applied:(memory|pids)/);
    releaseCgroupV2(applied.path);

    if (isBwrapAvailable()) {
      const plan = planPhaseIsolation({
        phase: "analyze",
        workspace_rw: tmp,
        argv: ["/bin/true"],
        force_mock_cgroup: true,
      });
      expect(plan.unshare_net).toBe(true);
      expect(plan.bwrap.argv).toContain("--unshare-net");
    } else {
      expect.fail("V1-GATE-PROD unshare-net FAIL: bwrap unavailable — cannot prove --unshare-net");
    }
  });
});

function planBwrapHasUnshare(plan: ReturnType<typeof planPhaseIsolation>): boolean {
  return plan.unshare_net === true;
}
