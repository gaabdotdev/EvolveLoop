/**
 * V3 §22.11 — Honest adapter capability + runtime probe (no live consent required).
 *
 * For each catalog adapter:
 *   - dump declared capabilities / execution_bridge / certification
 *   - probe CLI presence (when relevant)
 *   - invoke dry-run / fail-closed path and record status+code
 *
 * usage:
 *   npx vite-node scripts/v3-adapters-runtime-probe.mts <out.json>
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listAdapterContracts, getAdapterContract } from "../src/v3/adapters/catalog.ts";
import { getAdapterDriver, listAdapterDrivers } from "../src/v3/adapters/drivers/registry.ts";
import { probeAllHarnessClis } from "../src/v3/adapters/drivers/cli-probe.ts";
import { resolveV3DataPaths } from "../src/v3/paths.ts";
import type { AdapterId } from "../src/v3/adapters/types.ts";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: npx vite-node scripts/v3-adapters-runtime-probe.mts <out.json>");
  process.exit(2);
}

const consent = process.env.EVOLVELOOP_HARNESS_CONSENT === "true";
const work = mkdtempSync(join(tmpdir(), "v3-adapter-probe-"));
const paths = resolveV3DataPaths(work);
mkdirSync(paths.root, { recursive: true });

const cli_probes = probeAllHarnessClis();
const catalog = listAdapterContracts();
const drivers = listAdapterDrivers();

type ProbeRow = {
  adapter_id: AdapterId;
  catalog_execution_bridge: string;
  catalog_certification: string;
  capability_levels: Record<string, string>;
  driver_can_invoke: boolean;
  driver_notes: string[];
  invoke_mode: "dry_run" | "blocked" | "failed" | "accepted_other";
  invoke_status: string;
  invoke_code?: string;
  invoke_message?: string;
  honesty: string;
};

const rows: ProbeRow[] = [];

for (const contract of catalog) {
  const id = contract.adapter_id;
  const driver = getAdapterDriver(id);
  const desc = driver.describe();
  const capability_levels: Record<string, string> = {};
  for (const c of contract.capabilities) {
    capability_levels[c.key] = c.level;
  }

  const invoke = await driver.invoke(paths, {
    work_id: `probe-${id}`,
    task_id: `t-${id}`,
    provider_mode: "mock",
    note: "§22.11 honesty probe — dry-run / fail-closed only",
  });

  let invoke_mode: ProbeRow["invoke_mode"] = "accepted_other";
  if (invoke.status === "blocked") invoke_mode = "blocked";
  else if (invoke.status === "failed") invoke_mode = "failed";
  else if (invoke.code === "DRY_RUN_PROMPT_WRITTEN" || invoke.status === "accepted") {
    invoke_mode = invoke.code === "DRY_RUN_PROMPT_WRITTEN" ? "dry_run" : "accepted_other";
  }

  let honesty: string;
  if (contract.execution_bridge === "none" && !driver.can_invoke) {
    honesty =
      "catalog bridge=none; driver blocked (CLI absent) — capabilities not over-claimed";
  } else if (contract.execution_bridge === "none" && driver.can_invoke) {
    honesty =
      "catalog declares bridge=none (conservative/declared); driver can dry-run when CLI present — live spawn still needs consent";
  } else if (contract.execution_bridge === "jobs_pickup") {
    honesty =
      "jobs_pickup (cursor-skill) — invoke without ir_path fails closed; no live IDE API claimed";
  } else if (contract.execution_bridge === "cli_process") {
    honesty =
      "cli_process declared; dry-run prompt path exercised when CLI present, else blocked";
  } else {
    honesty = `bridge=${contract.execution_bridge}; invoke=${invoke.status}/${invoke.code ?? "?"}`;
  }

  rows.push({
    adapter_id: id,
    catalog_execution_bridge: contract.execution_bridge,
    catalog_certification: contract.certification,
    capability_levels,
    driver_can_invoke: driver.can_invoke,
    driver_notes: desc.notes,
    invoke_mode,
    invoke_status: invoke.status,
    invoke_code: invoke.code,
    invoke_message: invoke.message,
    honesty,
  });
}

const report = {
  kind: "V3AdapterRuntimeProbe",
  ts: new Date().toISOString(),
  criterion: "§22.11",
  consent_env: consent,
  work_dir: work,
  cli_probes,
  catalog_ids: catalog.map((c) => c.adapter_id),
  driver_ids: drivers.map((d) => d.adapter_id),
  adapters: rows,
  supported_runtimes_note:
    "Supported = declared execution_bridge ≠ none OR driver can_invoke with dry-run/fail-closed exercised. Live IDE spawn requires EVOLVELOOP_HARNESS_CONSENT=true (not claimed here).",
  catalog_spot_checks: {
    cursor: {
      bridge: getAdapterContract("cursor").execution_bridge,
      streaming: getAdapterContract("cursor").capabilities.find((c) => c.key === "streaming")
        ?.level,
    },
    "claude-code": {
      bridge: getAdapterContract("claude-code").execution_bridge,
    },
    codex: { bridge: getAdapterContract("codex").execution_bridge },
    antigravity: { bridge: getAdapterContract("antigravity").execution_bridge },
  },
};

mkdirSync(join(outPath, ".."), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
console.log(JSON.stringify({ ok: true, out: outPath, adapters: rows.length }, null, 2));
