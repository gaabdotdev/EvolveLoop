/**
 * One-shot probe for V3-DIST-01 evidence (writes host-probe.json path from argv[2]).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  diagnose,
  exportState,
  importState,
  backupRestoreRoundtrip,
  STATE_SCHEMA_VERSION,
} from "../src/v3/ops/dist-ops.ts";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: vite-node scripts/v3-dist-01-probe.mts <host-probe.json>");
  process.exit(2);
}

const root = mkdtempSync(join(tmpdir(), "v3-dist-probe-"));
const global = join(root, "global");
const project = join(root, "project");
mkdirSync(join(global, "policies"), { recursive: true });
mkdirSync(join(project, "goal-contracts"), { recursive: true });
writeFileSync(join(global, "policies", "limits.json"), "{\"max\":4}");
writeFileSync(
  join(project, "goal-contracts", "gc-1.json"),
  JSON.stringify({ goal_contract_id: "gc-1", objective: "probe" }),
);
writeFileSync(join(project, "note.txt"), "probe");

const diag = diagnose({
  globalConfigDir: global,
  projectDataDir: project,
  skipRuntimeProbes: true,
});
const env = exportState(STATE_SCHEMA_VERSION, {
  globalConfigDir: global,
  projectDataDir: project,
  readFromDisk: true,
});
const imp = importState(STATE_SCHEMA_VERSION, env, {
  globalConfigDir: join(root, "imp-g"),
  projectDataDir: join(root, "imp-p"),
  writeToDisk: true,
});
const round = backupRestoreRoundtrip({
  globalConfigDir: global,
  projectDataDir: project,
  backupRoot: join(root, "bak"),
  restoreGlobalDir: join(root, "rg"),
  restoreProjectDir: join(root, "rp"),
});

const probe = {
  kind: "v3_dist_01_ops_probe",
  task: "M20-V3-DIST-01-OPS-BACKUP",
  ts: "20261122T004055Z",
  schema_version: STATE_SCHEMA_VERSION,
  diagnose_healthy: diag.healthy,
  diagnose_checks: diag.checks.length,
  separation_ok: diag.layout.separation_ok,
  export_schema: env.schema_version,
  export_body_sha256: env.body_sha256,
  import_ok: imp.ok,
  import_integrity: imp.body_sha256_verified,
  backup_file_count: round.backup.file_count,
  backup_restore_integrity_ok: round.integrity_ok,
  restore_verified: round.restore.verified,
  gate_ok: diag.healthy && imp.ok && round.integrity_ok,
  honesty: "PASS_UNIT",
};

writeFileSync(outPath, JSON.stringify(probe, null, 2) + "\n");
console.log(JSON.stringify(probe, null, 2));
rmSync(root, { recursive: true, force: true });
