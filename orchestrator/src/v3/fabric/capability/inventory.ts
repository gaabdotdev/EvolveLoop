/**
 * Capability discovery & resource inventory with provenance + freshness.
 */

import { arch, cpus, freemem, loadavg, platform, release, totalmem, type } from "node:os";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { CapabilityInventory, InventoryProvenance, ResourceInventorySample } from "../types.js";

export interface FreshnessPolicy {
  max_age_ms: number;
}

export function isInventoryFresh(sampledAtIso: string, policy: FreshnessPolicy, now = Date.now()): boolean {
  return now - Date.parse(sampledAtIso) <= policy.max_age_ms;
}

function probe(cmd: string, args: string[]): { ok: boolean; detail: string; provenance: InventoryProvenance } {
  try {
    const out = execFileSync(cmd, args, { timeout: 2000, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
    return { ok: true, detail: out.slice(0, 200), provenance: "OBSERVED" };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      provenance: "OBSERVED",
    };
  }
}

export function sampleResources(slotsTotal = 2): ResourceInventorySample {
  const cpu = cpus();
  return {
    sampled_at: new Date().toISOString(),
    provenance: "OBSERVED",
    cpu_cores: cpu.length,
    cpu_load_1m: loadavg()[0] ?? 0,
    memory_mb_total: Math.floor(totalmem() / (1024 * 1024)),
    memory_mb_available: Math.floor(freemem() / (1024 * 1024)),
    storage_mb_available: 0, // filled by caller if df probe available
    gpu_count: 0,
    slots_total: slotsTotal,
    slots_free: slotsTotal,
    network_ok: true,
  };
}

export function discoverCapabilities(opts?: { slots?: number }): CapabilityInventory {
  const probes: CapabilityInventory["probes"] = {
    node: probe(process.execPath, ["-v"]),
    bwrap: existsSync("/usr/bin/bwrap")
      ? probe("/usr/bin/bwrap", ["--version"])
      : { ok: false, detail: "bwrap_missing", provenance: "OBSERVED" },
    git: probe("git", ["--version"]),
    openssl: probe("openssl", ["version"]),
  };
  // Do not declare harness solely because binary name exists without probe
  const harnesses: string[] = [];
  if (existsSync("/usr/bin/cursor-agent") || existsSync(`${process.env.HOME}/.local/bin/cursor-agent`)) {
    const p = probe("cursor-agent", ["--help"]);
    probes["harness.cursor-agent"] = p;
    if (p.ok) harnesses.push("cursor-agent");
  } else {
    probes["harness.cursor-agent"] = { ok: false, detail: "binary_absent", provenance: "OBSERVED" };
  }

  const resourcesHint = sampleResources(opts?.slots ?? 2);
  // storage probe
  try {
    const df = execFileSync("df", ["-Pm", "."], { encoding: "utf8" });
    const line = df.trim().split("\n").at(-1) ?? "";
    const avail = Number(line.split(/\s+/)[3] ?? 0);
    resourcesHint.storage_mb_available = Number.isFinite(avail) ? avail : 0;
    probes.storage = { ok: true, detail: `avail_mb=${resourcesHint.storage_mb_available}`, provenance: "OBSERVED" };
  } catch {
    probes.storage = { ok: false, detail: "df_failed", provenance: "UNAVAILABLE" };
  }

  return {
    observed_at: new Date().toISOString(),
    provenance: "OBSERVED",
    os: platform(),
    kernel: release(),
    arch: arch(),
    runtime: `node ${process.version}`,
    sandbox_backends: probes.bwrap.ok ? ["bubblewrap"] : [],
    harnesses,
    providers: [],
    local_models: [],
    toolchains: probes.git.ok ? ["git"] : [],
    gpu_stack: [],
    mcp_tools_authorized: [],
    filesystem_roots: [process.cwd()],
    network_policy: "default-deny-until-contract",
    data_policy: "project-isolated",
    probes,
  };
}

export { type };
