/**
 * Dual evolve control-plane honesty (ISSUE-ARCH-DUAL-EVOLVE-001 / PUB-001).
 *
 * Two real surfaces exist and must not be silently conflated:
 * - cursor_pda / execution_engine: `/evolve` → agents-orch / run-engine (Capability IR)
 * - v3_product_cli: `evolve` bin → Goal/Coordinator/TaskGraph/V3.5+
 *
 * Unification is a bridge with an explicit plane id — not a pretend single entry.
 */

export type ControlPlaneId = "v3_product_cli" | "execution_engine" | "cursor_pda";

export interface ControlPlaneDescriptor {
  id: ControlPlaneId;
  entry: string;
  owns: string[];
  does_not_own: string[];
}

export const CONTROL_PLANES: ControlPlaneDescriptor[] = [
  {
    id: "v3_product_cli",
    entry: "orchestrator dist/cli/evolve.js (`evolve` bin)",
    owns: [
      "GoalContract",
      "TaskGraph",
      "CoordinatorDaemon",
      "ApprovalBroker",
      "EngineeringLoop",
      "GlobalOps",
    ],
    does_not_own: ["Capability IR ExecutionEngine hot path unless bridged"],
  },
  {
    id: "execution_engine",
    entry: "orchestrator dist/cli/run-engine.js",
    owns: ["Capability IR", "EventBus", "Scheduler", "ProviderRouter", "MeasurementPlane adapter"],
    does_not_own: ["V3 GoalContract/CoordinatorDaemon as primary"],
  },
  {
    id: "cursor_pda",
    entry: ".cursor/commands/evolve.md → orquestrar / agents-orch",
    owns: ["PDA orchestration skills", "GATE_BUNDLE", "wiki grounding hooks"],
    does_not_own: ["Persistent V3 daemon unless operator starts `evolve service`"],
  },
];

export function resolveControlPlane(
  env: NodeJS.ProcessEnv = process.env,
): { plane: ControlPlaneId | null; explicit: boolean; warning?: string } {
  const raw = env.EVOLVELOOP_CONTROL_PLANE?.trim();
  if (!raw) {
    return {
      plane: null,
      explicit: false,
      warning:
        "EVOLVELOOP_CONTROL_PLANE unset — dual evolve surfaces; do not assume /evolve exercises V3 product CLI",
    };
  }
  if (raw === "v3_product_cli" || raw === "execution_engine" || raw === "cursor_pda") {
    return { plane: raw, explicit: true };
  }
  return {
    plane: null,
    explicit: false,
    warning: `unknown EVOLVELOOP_CONTROL_PLANE=${raw}`,
  };
}

/** Fail-closed helper for operators that require an explicit plane. */
export function requireControlPlane(
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneId {
  const r = resolveControlPlane(env);
  if (!r.plane) {
    throw new Error(r.warning ?? "control_plane_required");
  }
  return r.plane;
}
