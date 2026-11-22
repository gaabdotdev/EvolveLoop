/**
 * V1-SEC-03 — Phase network isolation: read/analyze without net (--unshare-net)
 * plus cgroup v2 resource caps.
 */

import { planBwrapWrapper, type BwrapWrapperPlan } from "./bwrap-wrapper.js";
import {
  applyCgroupV2Limits,
  planCgroupV2Limits,
  probeCgroupV2,
  type CgroupV2ApplyResult,
  type CgroupV2Limits,
} from "./cgroup-v2.js";

export type IsolationPhase =
  | "intake"
  | "analyze"
  | "read"
  | "implement"
  | "validate"
  | "deploy";

/** Phases that must run without network. */
export const NETLESS_PHASES: ReadonlySet<IsolationPhase> = new Set([
  "intake",
  "analyze",
  "read",
]);

export interface PhaseIsolationRequest {
  phase: IsolationPhase;
  workspace_rw: string;
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  limits?: CgroupV2Limits;
  /** Force mock cgroup path (unit tests). */
  force_mock_cgroup?: boolean;
}

export interface PhaseIsolationPlan {
  kind: "PhaseIsolationPlan";
  phase: IsolationPhase;
  unshare_net: boolean;
  bwrap: BwrapWrapperPlan;
  cgroup: CgroupV2ApplyResult;
  planned_limits: Record<string, string>;
  gaps: string[];
}

export function phaseRequiresUnshareNet(phase: IsolationPhase): boolean {
  return NETLESS_PHASES.has(phase);
}

/**
 * Build isolation plan for a pipeline phase.
 * Read/analyze → --unshare-net; always attach planned cgroup limits.
 */
export function planPhaseIsolation(req: PhaseIsolationRequest): PhaseIsolationPlan {
  const unshare_net = phaseRequiresUnshareNet(req.phase);
  const limits: CgroupV2Limits = {
    memory_bytes: req.limits?.memory_bytes ?? 512 * 1024 * 1024,
    pids_max: req.limits?.pids_max ?? 64,
    cpu_max: req.limits?.cpu_max ?? "50000 100000",
  };

  const bwrap = planBwrapWrapper({
    workspace_rw: req.workspace_rw,
    argv: req.argv,
    cwd: req.cwd,
    env: req.env,
    unshare_net,
  });

  const cgroup = applyCgroupV2Limits(`phase-${req.phase}`, limits, {
    force_mock: req.force_mock_cgroup === true,
  });

  const gaps = [...bwrap.gaps, ...cgroup.gaps];
  const probe = probeCgroupV2();
  if (!probe.can_cpu) gaps.push("GAP:cpu_controller_not_delegated_on_host");

  return {
    kind: "PhaseIsolationPlan",
    phase: req.phase,
    unshare_net,
    bwrap,
    cgroup,
    planned_limits: planCgroupV2Limits(limits),
    gaps: [...new Set(gaps)],
  };
}
