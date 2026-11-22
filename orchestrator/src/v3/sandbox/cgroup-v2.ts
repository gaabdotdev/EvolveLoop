/**
 * V1-SEC-03 — cgroups v2 helpers (RAM / CPU / pids.max).
 * Detects host support; real apply when writable; otherwise mock/plan path.
 *
 * Honesty: memory/pids may be LIVE on delegated user slices; cpu.max often
 * lacks write perms → treat CPU controller as optional privileged and mark
 * CGROUP_CPU_CONTROLLER = NÃO_HABILITADO until probe.can_cpu === true.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** cpu.max write is frequently denied on user slices — do not claim LIVE CPU. */
export const CGROUP_CPU_CONTROLLER = "NÃO_HABILITADO" as const;

export interface CgroupV2Limits {
  /** memory.max bytes */
  memory_bytes?: number;
  /** cpu.max: quota period — e.g. "50000 100000" (50% of one CPU) */
  cpu_max?: string;
  /** pids.max */
  pids_max?: number;
}

export interface CgroupV2Probe {
  kind: "CgroupV2Probe";
  available: boolean;
  controllers: string[];
  writable_base: string | null;
  can_memory: boolean;
  can_cpu: boolean;
  can_pids: boolean;
  gaps: string[];
}

export interface CgroupV2ApplyResult {
  kind: "CgroupV2ApplyResult";
  applied: boolean;
  mocked: boolean;
  path: string | null;
  limits: CgroupV2Limits;
  gaps: string[];
  reason: string;
}

function readControllers(path: string): string[] {
  try {
    return readFileSync(path, "utf-8").trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Prefer current process cgroup parent / user app.slice for delegated writes.
 */
export function resolveWritableCgroupBase(): string | null {
  const candidates: string[] = [];
  try {
    const raw = readFileSync("/proc/self/cgroup", "utf-8").trim();
    const m = raw.match(/^0::(.+)$/m);
    if (m?.[1]) {
      const self = `/sys/fs/cgroup${m[1]}`;
      candidates.push(join(self, ".."));
      candidates.push(self);
    }
  } catch {
    /* ignore */
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  candidates.push(
    `/sys/fs/cgroup/user.slice/user-${uid}.slice/user@${uid}.service/app.slice`,
    `/sys/fs/cgroup/user.slice/user-${uid}.slice`,
  );

  for (const base of candidates) {
    if (!existsSync(base)) continue;
    const probe = join(base, `.el-cg-probe-${process.pid}`);
    try {
      mkdirSync(probe, { recursive: false });
      rmSync(probe, { recursive: true, force: true });
      return base;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function probeCgroupV2(): CgroupV2Probe {
  const gaps: string[] = [];
  const rootControllers = existsSync("/sys/fs/cgroup/cgroup.controllers")
    ? readControllers("/sys/fs/cgroup/cgroup.controllers")
    : [];
  if (rootControllers.length === 0) {
    gaps.push("cgroup_v2_controllers_unavailable");
  }

  const writable_base = resolveWritableCgroupBase();
  if (!writable_base) gaps.push("no_writable_cgroup_base");

  let can_memory = false;
  let can_cpu = false;
  let can_pids = false;

  if (writable_base) {
    const controllers = readControllers(join(writable_base, "cgroup.controllers"));
    const subtree = readControllers(join(writable_base, "cgroup.subtree_control"));
    const enabled = new Set([...controllers, ...subtree]);
    can_memory = enabled.has("memory");
    can_cpu = enabled.has("cpu");
    can_pids = enabled.has("pids");
    if (!can_memory) gaps.push("memory_controller_not_delegated");
    if (!can_cpu) gaps.push("cpu_controller_not_delegated");
    if (!can_pids) gaps.push("pids_controller_not_delegated");

    // Live capability check for memory/pids when possible
    const child = join(writable_base, `.el-cg-cap-${process.pid}`);
    try {
      mkdirSync(child, { recursive: false });
      if (can_memory) {
        try {
          writeFileSync(join(child, "memory.max"), String(64 * 1024 * 1024));
        } catch {
          can_memory = false;
          gaps.push("memory_max_write_denied");
        }
      }
      if (can_pids) {
        try {
          writeFileSync(join(child, "pids.max"), "64");
        } catch {
          can_pids = false;
          gaps.push("pids_max_write_denied");
        }
      }
      if (can_cpu) {
        try {
          writeFileSync(join(child, "cpu.max"), "50000 100000");
        } catch {
          can_cpu = false;
          gaps.push("cpu_max_write_denied");
        }
      }
      rmSync(child, { recursive: true, force: true });
    } catch {
      gaps.push("cgroup_child_create_failed");
    }
  }

  return {
    kind: "CgroupV2Probe",
    available: !!writable_base && (can_memory || can_pids || can_cpu),
    controllers: rootControllers,
    writable_base,
    can_memory,
    can_cpu,
    can_pids,
    gaps,
  };
}

/**
 * Apply limits. When host lacks perms, returns mocked plan (code path still exercised).
 */
export function applyCgroupV2Limits(
  name: string,
  limits: CgroupV2Limits,
  opts?: { force_mock?: boolean; base?: string | null },
): CgroupV2ApplyResult {
  const gaps: string[] = [];
  if (opts?.force_mock) {
    return {
      kind: "CgroupV2ApplyResult",
      applied: false,
      mocked: true,
      path: `/mock/cgroup/${name}`,
      limits,
      gaps: ["forced_mock"],
      reason: "mock_cgroup_limits_planned",
    };
  }

  const probe = probeCgroupV2();
  const base = opts?.base !== undefined ? opts.base : probe.writable_base;
  if (!base) {
    return {
      kind: "CgroupV2ApplyResult",
      applied: false,
      mocked: true,
      path: `/mock/cgroup/${name}`,
      limits,
      gaps: [...probe.gaps, "no_writable_base"],
      reason: "mock_fallback_no_cgroup_perms",
    };
  }

  const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const path = join(base, `el-${safeName}`);
  try {
    mkdirSync(path, { recursive: false });
  } catch (err) {
    return {
      kind: "CgroupV2ApplyResult",
      applied: false,
      mocked: true,
      path: `/mock/cgroup/${name}`,
      limits,
      gaps: [...probe.gaps, `mkdir_failed:${String(err)}`],
      reason: "mock_fallback_mkdir_failed",
    };
  }

  const appliedParts: string[] = [];
  if (limits.memory_bytes != null) {
    if (probe.can_memory) {
      try {
        writeFileSync(join(path, "memory.max"), String(limits.memory_bytes));
        appliedParts.push("memory");
      } catch {
        gaps.push("memory_apply_failed");
      }
    } else {
      gaps.push("memory_skipped_no_controller");
    }
  }
  if (limits.pids_max != null) {
    if (probe.can_pids) {
      try {
        writeFileSync(join(path, "pids.max"), String(limits.pids_max));
        appliedParts.push("pids");
      } catch {
        gaps.push("pids_apply_failed");
      }
    } else {
      gaps.push("pids_skipped_no_controller");
    }
  }
  if (limits.cpu_max != null) {
    if (probe.can_cpu) {
      try {
        writeFileSync(join(path, "cpu.max"), limits.cpu_max);
        appliedParts.push("cpu");
      } catch {
        gaps.push("cpu_apply_failed");
      }
    } else {
      gaps.push("cpu_skipped_no_controller");
    }
  }

  return {
    kind: "CgroupV2ApplyResult",
    applied: appliedParts.length > 0,
    mocked: false,
    path,
    limits,
    gaps: [...probe.gaps, ...gaps],
    reason:
      appliedParts.length > 0
        ? `applied:${appliedParts.join(",")}`
        : "created_but_no_limits_applied",
  };
}

export function releaseCgroupV2(path: string | null): void {
  if (!path || path.startsWith("/mock/")) return;
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    /* best-effort — cgroup may still have procs */
  }
}

/** Build planned limit strings for tests without touching sysfs. */
export function planCgroupV2Limits(limits: CgroupV2Limits): Record<string, string> {
  const out: Record<string, string> = {};
  if (limits.memory_bytes != null) out["memory.max"] = String(limits.memory_bytes);
  if (limits.pids_max != null) out["pids.max"] = String(limits.pids_max);
  if (limits.cpu_max != null) out["cpu.max"] = limits.cpu_max;
  return out;
}
