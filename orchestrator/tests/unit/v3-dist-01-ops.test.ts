/**
 * V3-DIST-01 — Distribution ops: diagnose, versioned export/import, backup/restore.
 *
 * Contrato: META-DIST-001..006 (ops slices) + NFR-009 portabilidade de estado.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  STATE_SCHEMA_VERSION,
  STATE_SCHEMA_MIN_SUPPORTED,
  diagnose,
  exportState,
  importState,
  backup,
  restore,
  backupRestoreRoundtrip,
  migrateV1toV2,
  migrateStateBody,
  canonicalJson,
  DistOpsError,
  type StateExportEnvelope,
  type StateExportV1Body,
} from "../../src/v3/ops/index.js";
import { createHash } from "node:crypto";

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function seedLayout(root: string): { global: string; project: string } {
  const global = join(root, "global");
  const project = join(root, "project");
  mkdirSync(join(global, "policies"), { recursive: true });
  mkdirSync(join(project, "goal-contracts"), { recursive: true });
  mkdirSync(join(project, "events"), { recursive: true });
  mkdirSync(join(project, "memories"), { recursive: true });
  mkdirSync(join(project, "evidence"), { recursive: true });
  writeFileSync(
    join(global, "policies", "limits.json"),
    JSON.stringify({ max_parallel_tasks: 4 }, null, 2),
  );
  writeFileSync(
    join(global, "credentials.env"),
    "OPENROUTER_API_KEY=sk-secret-must-not-backup\n",
    { mode: 0o600 },
  );
  writeFileSync(
    join(project, "goal-contracts", "gc-1.json"),
    JSON.stringify({
      goal_contract_id: "gc-1",
      objective: "ship dist ops",
      version: 1,
    }),
  );
  writeFileSync(
    join(project, "events", "ev-1.json"),
    JSON.stringify({ event_id: "ev-1", type: "task.completed" }),
  );
  writeFileSync(
    join(project, "memories", "mem-1.json"),
    JSON.stringify({ memory_id: "mem-1", body: "portable memory" }),
  );
  writeFileSync(
    join(project, "evidence", "e-1.json"),
    JSON.stringify({ id: "e-1", gate: "V3-DIST-01" }),
  );
  writeFileSync(join(project, "notes.txt"), "project-local note");
  return { global, project };
}

describe("V3-DIST-01 schema constants", () => {
  it("publishes current + min supported versions", () => {
    expect(STATE_SCHEMA_VERSION).toBe(2);
    expect(STATE_SCHEMA_MIN_SUPPORTED).toBe(1);
  });
});

describe("V3-DIST-01 diagnose()", () => {
  it("reports healthy with injectable checks and PT summary", () => {
    const root = tempDir("v3-dist-diag-");
    const { global, project } = seedLayout(root);
    const report = diagnose({
      globalConfigDir: global,
      projectDataDir: project,
      checks: [
        { id: "runtime:node", status: "ok", message: "v20", meta_ref: "META-DIST-002" },
        {
          id: "discovery_vs_enablement",
          status: "ok",
          message: "discovered ≠ enabled",
          meta_ref: "META-DIST-003",
        },
      ],
    });
    expect(report.kind).toBe("EvolveLoopDiagnoseReport");
    expect(report.healthy).toBe(true);
    expect(report.summary_pt).toMatch(/Diagnóstico OK/);
    expect(report.layout.separation_ok).toBe(true);
    expect(report.meta_dist_coverage["NFR-009"]).toMatch(/schema/);
  });

  it("fails when global and project paths collide (META-DIST-005)", () => {
    const root = tempDir("v3-dist-sep-");
    mkdirSync(root, { recursive: true });
    const report = diagnose({
      globalConfigDir: root,
      projectDataDir: root,
      skipRuntimeProbes: true,
    });
    expect(report.healthy).toBe(false);
    expect(
      report.checks.some(
        (c) => c.id === "global_vs_project_separation" && c.status === "error",
      ),
    ).toBe(true);
  });
});

describe("V3-DIST-01 exportState / importState (NFR-009)", () => {
  it("export v2 seals body_sha256 and roundtrips through import", () => {
    const root = tempDir("v3-dist-exp-");
    const { global, project } = seedLayout(root);
    const env = exportState(2, {
      globalConfigDir: global,
      projectDataDir: project,
      readFromDisk: true,
    });
    expect(env.kind).toBe("EvolveLoopStateExport");
    expect(env.schema_version).toBe(2);
    expect(env.body_sha256).toBe(sha256(canonicalJson(env.body)));
    expect(env.body.schema_version).toBe(2);
    if (env.body.schema_version !== 2) throw new Error("expected v2");
    expect(env.body.project_state.contracts.some((c) => c.goal_contract_id === "gc-1")).toBe(
      true,
    );
    // credentials.env values must not appear in export files; names may
    expect(JSON.stringify(env.body)).not.toContain("sk-secret-must-not-backup");
    expect(env.body.global_config.credential_names).toContain("OPENROUTER_API_KEY");

    const dest = tempDir("v3-dist-imp-");
    const g2 = join(dest, "g");
    const p2 = join(dest, "p");
    const result = importState(2, env, {
      globalConfigDir: g2,
      projectDataDir: p2,
      writeToDisk: true,
    });
    expect(result.ok).toBe(true);
    expect(result.body_sha256_verified).toBe(true);
    expect(result.migrated).toBe(false);
    expect(existsSync(join(g2, "policies", "limits.json"))).toBe(true);
    expect(existsSync(join(p2, "goal-contracts", "gc-1.json"))).toBe(true);
    expect(readFileSync(join(p2, "notes.txt"), "utf-8")).toBe("project-local note");
  });

  it("migrates v1 → v2 on importState(2)", () => {
    const v1Body: StateExportV1Body = {
      schema_version: 1,
      blob: {
        global_files: { "cfg.json": "{\"x\":1}" },
        credential_names: ["TOKEN_A"],
        contracts: [{ goal_contract_id: "legacy-gc", objective: "migrate me" }],
        events: [{ event_id: "e0" }],
        memories: [{ memory_id: "m0", body: "old" }],
        evidence: [{ id: "ev0" }],
        project_files: { "a.txt": "hello" },
      },
    };
    const migrated = migrateV1toV2(v1Body);
    expect(migrated.schema_version).toBe(2);
    expect(migrated.global_config.files["cfg.json"]).toBe("{\"x\":1}");
    expect(migrated.project_state.contracts[0].goal_contract_id).toBe("legacy-gc");

    const chain = migrateStateBody(v1Body, 2);
    expect(chain.migrations_applied).toEqual([1]);
    expect(chain.body.schema_version).toBe(2);

    const envelope: StateExportEnvelope = {
      kind: "EvolveLoopStateExport",
      schema_version: 1,
      exported_at: new Date().toISOString(),
      body_sha256: sha256(canonicalJson(v1Body)),
      body: v1Body,
    };
    const dest = tempDir("v3-dist-mig-");
    const result = importState(2, envelope, {
      globalConfigDir: join(dest, "g"),
      projectDataDir: join(dest, "p"),
      writeToDisk: true,
    });
    expect(result.ok).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.migrations_applied).toEqual([1]);
    expect(result.schema_version_out).toBe(2);
    expect(existsSync(join(dest, "p", "goal-contracts", "legacy-gc.json"))).toBe(true);
  });

  it("rejects tampered envelope (integrity)", () => {
    const env = exportState(2, {
      globalConfigDir: "/tmp",
      projectDataDir: "/tmp/p",
      global: { files: { "a.json": "{}" }, credential_names: [] },
      project: {
        contracts: [{ goal_contract_id: "x" }],
        events: [],
        memories: [],
        evidence: [],
        files: {},
      },
    });
    const tampered: StateExportEnvelope = {
      ...env,
      body:
        env.body.schema_version === 2
          ? {
              ...env.body,
              project_state: {
                ...env.body.project_state,
                contracts: [{ goal_contract_id: "evil" }],
              },
            }
          : env.body,
    };
    const result = importState(2, tampered, {
      globalConfigDir: join(tempDir("t-"), "g"),
      projectDataDir: join(tempDir("t2-"), "p"),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("INTEGRITY_FAILED");
  });

  it("exportState rejects unsupported version", () => {
    expect(() =>
      exportState(99, {
        globalConfigDir: "/tmp/g",
        projectDataDir: "/tmp/p",
      }),
    ).toThrow(DistOpsError);
  });
});

describe("V3-DIST-01 backup() / restore() integrity", () => {
  it("roundtrips with verified hashes and skips credential values", () => {
    const root = tempDir("v3-dist-bak-");
    const { global, project } = seedLayout(root);
    const bakRoot = join(root, "backups");
    const round = backupRestoreRoundtrip({
      globalConfigDir: global,
      projectDataDir: project,
      backupRoot: bakRoot,
      restoreGlobalDir: join(root, "restore-g"),
      restoreProjectDir: join(root, "restore-p"),
    });
    expect(round.integrity_ok).toBe(true);
    expect(round.backup.file_count).toBeGreaterThan(0);
    expect(round.restore.verified).toBe(true);
    expect(
      existsSync(join(root, "restore-p", "goal-contracts", "gc-1.json")),
    ).toBe(true);
    expect(existsSync(join(root, "restore-g", "policies", "limits.json"))).toBe(
      true,
    );
    // credentials.env must not be in backup
    expect(
      round.backup.manifest.files.some((f) =>
        f.relative_path.includes("credentials.env"),
      ),
    ).toBe(false);
    expect(existsSync(join(root, "restore-g", "credentials.env"))).toBe(false);
  });

  it("restore refuses when a file hash is tampered", () => {
    const root = tempDir("v3-dist-tamper-");
    const { global, project } = seedLayout(root);
    const bak = backup({
      globalConfigDir: global,
      projectDataDir: project,
      backupRoot: join(root, "backups"),
      backupId: "bak-fixed",
    });
    const victim = bak.manifest.files.find((f) =>
      f.relative_path.includes("notes.txt"),
    );
    expect(victim).toBeTruthy();
    const victimPath = join(bak.backup_dir, "data", victim!.relative_path);
    writeFileSync(victimPath, "TAMPERED");
    const res = restore({
      backupDir: bak.backup_dir,
      globalConfigDir: join(root, "rg"),
      projectDataDir: join(root, "rp"),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^INTEGRITY_FAILED:/);
  });

  it("backup refuses identical global/project roots", () => {
    const root = tempDir("v3-dist-same-");
    expect(() =>
      backup({
        globalConfigDir: root,
        projectDataDir: root,
        backupRoot: join(root, "b"),
      }),
    ).toThrow(/SEPARATION|differ/);
  });
});
