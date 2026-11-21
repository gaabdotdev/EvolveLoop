/**
 * Native Harness Runtime facade — discovery, health, capability matrix.
 * Does not forge PASS when CLI/credentials are absent.
 */

import { listAdapterContracts } from "../adapters/catalog.js";
import { normalizeCapabilityLevel, type AdapterId, type AgentAdapterContract } from "../adapters/types.js";
import { getAdapterDriver, listAdapterDrivers } from "../adapters/drivers/registry.js";
import { probeHarnessCli, type HarnessCliId } from "../adapters/drivers/cli-probe.js";
import { ProcessSessionStore } from "../adapters/drivers/process-sessions.js";
import type { V3DataPaths } from "../paths.js";

export interface HarnessCapabilityRow {
  adapter_id: AdapterId;
  capability: string;
  level: ReturnType<typeof normalizeCapabilityLevel>;
  notes: string;
}

export interface HarnessInspectResult {
  contract: AgentAdapterContract;
  driver?: ReturnType<AgentAdapterDriverDescribe>;
  cli_probe?: ReturnType<typeof probeHarnessCli>;
  matrix: HarnessCapabilityRow[];
  execution_path: "real_eligible" | "dry_run" | "probe_only" | "blocked";
}

type AgentAdapterDriverDescribe = () => {
  adapter_id: AdapterId;
  can_invoke: boolean;
  notes: string[];
};

const CLI_MAP: Partial<Record<AdapterId, HarnessCliId>> = {
  "claude-code": "claude",
  codex: "codex",
  antigravity: "antigravity",
};

export function listHarnesses(): AgentAdapterContract[] {
  return listAdapterContracts();
}

export function inspectHarness(adapterId: AdapterId): HarnessInspectResult {
  const contracts = listAdapterContracts();
  const contract = contracts.find((c) => c.adapter_id === adapterId);
  if (!contract) {
    throw new Error(`ADAPTER_NOT_FOUND:${adapterId}`);
  }
  const driver = getAdapterDriver(adapterId);
  const cliId = CLI_MAP[adapterId];
  const cli_probe = cliId ? probeHarnessCli(cliId) : undefined;
  const matrix: HarnessCapabilityRow[] = contract.capabilities.map((c) => ({
    adapter_id: adapterId,
    capability: c.key,
    level: normalizeCapabilityLevel(c.level),
    notes: c.notes,
  }));

  let execution_path: HarnessInspectResult["execution_path"] = "blocked";
  if (contract.execution_bridge === "cli_process") {
    if (cli_probe?.available && process.env.EVOLVELOOP_HARNESS_CONSENT === "true") {
      execution_path = "real_eligible";
    } else if (cli_probe?.available) {
      execution_path = "dry_run";
    } else {
      execution_path = "probe_only";
    }
  } else if (contract.execution_bridge === "jobs_pickup") {
    execution_path = "dry_run";
  }

  return {
    contract,
    driver: driver?.describe(),
    cli_probe,
    matrix,
    execution_path,
  };
}

export function listHarnessSessions(paths: V3DataPaths, workId: string) {
  const store = new ProcessSessionStore(paths.processSessionsDir);
  return store.reconcile(workId);
}

export function harnessDoctor(): Record<string, unknown> {
  const adapters = listAdapterDrivers().map((d) => d.describe());
  const probes = (["claude", "codex", "antigravity"] as HarnessCliId[]).map((id) => probeHarnessCli(id));
  return {
    adapters,
    cli_probes: probes,
    consent: process.env.EVOLVELOOP_HARNESS_CONSENT === "true",
    notes: [
      "Real spawn requires consent env + available CLI",
      "Cursor Jobs uses ExecutionBridge — not full IDE session control",
    ],
  };
}
