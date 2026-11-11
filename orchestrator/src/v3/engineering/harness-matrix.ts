/**
 * Harness capability classification for V3.4 — honest levels only.
 */

import { getAdapterContract, listAdapterContracts } from "../adapters/catalog.js";
import { getAdapterDriver, listAdapterDrivers } from "../adapters/drivers/registry.js";
import { probeAllHarnessClis } from "../adapters/drivers/cli-probe.js";
import type { AdapterId } from "../adapters/types.js";

export type HarnessCapabilityClass =
  | "SUPPORTED"
  | "PARTIAL"
  | "PROBE_ONLY"
  | "DRY_RUN"
  | "BLOCKED"
  | "UNSUPPORTED";

export interface HarnessMatrixEntry {
  adapter_id: AdapterId;
  class: HarnessCapabilityClass;
  can_invoke: boolean;
  execution_bridge: string;
  cli_available?: boolean;
  notes: string[];
}

export function classifyHarness(adapterId: AdapterId): HarnessMatrixEntry {
  const contract = getAdapterContract(adapterId);
  const driver = getAdapterDriver(adapterId);
  const probes = probeAllHarnessClis();
  const notes = [...contract.limitations, ...driver.describe().notes];

  if (adapterId === "cursor" && driver.can_invoke) {
    return {
      adapter_id: adapterId,
      class: "PARTIAL",
      can_invoke: true,
      execution_bridge: contract.execution_bridge,
      notes: [...notes, "jobs_pickup / ExecutionBridge — not full IDE agent API"],
    };
  }

  if (adapterId === "claude-code") {
    const cli = probes.find((p) => p.cli_id === "claude");
    if (!cli?.available) {
      return {
        adapter_id: adapterId,
        class: "BLOCKED",
        can_invoke: false,
        execution_bridge: contract.execution_bridge,
        cli_available: false,
        notes: [...notes, "claude CLI absent"],
      };
    }
    return {
      adapter_id: adapterId,
      class: "DRY_RUN",
      can_invoke: true,
      execution_bridge: contract.execution_bridge,
      cli_available: true,
      notes: [
        ...notes,
        "Default invoke writes prompt package; SUPPORTED only after consented real spawn verified",
      ],
    };
  }

  if (adapterId === "codex" || adapterId === "antigravity") {
    const cliId = adapterId === "codex" ? "codex" : "antigravity";
    const cli = probes.find((p) => p.cli_id === cliId);
    if (!cli?.available) {
      return {
        adapter_id: adapterId,
        class: "PROBE_ONLY",
        can_invoke: false,
        execution_bridge: contract.execution_bridge,
        cli_available: false,
        notes: [...notes, `${cliId} not on PATH`],
      };
    }
    return {
      adapter_id: adapterId,
      class: "DRY_RUN",
      can_invoke: true,
      execution_bridge: contract.execution_bridge,
      cli_available: true,
      notes,
    };
  }

  return {
    adapter_id: adapterId,
    class: "UNSUPPORTED",
    can_invoke: false,
    execution_bridge: contract.execution_bridge,
    notes,
  };
}

export function buildHarnessMatrix(): HarnessMatrixEntry[] {
  return listAdapterContracts().map((c) => classifyHarness(c.adapter_id));
}

export function listDriverSummaries() {
  return listAdapterDrivers().map((d) => d.describe());
}
