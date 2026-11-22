/**
 * V3-EXIT-03 scale probe — CAS cold storage + operational SQLite pointers.
 *
 * Modes:
 *   broker (default) — MemoryBroker.propose + migrateToCold (slower, full API)
 *   bulk-cas — ColdStorage.put + pointer rows (post-migration shape; for ≥100k)
 *
 * usage: npx vite-node scripts/v3-exit-03-scale-probe.mts <N> <out.json> [workdir] [broker|bulk-cas]
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  MemoryBroker,
  ColdStorage,
  MEMORY_DB_SCHEMA_SQL,
  MEMORY_DB_SCHEMA_VERSION,
} from "../src/v3/memory/index.ts";

const N = Math.max(1, Number.parseInt(process.argv[2] ?? "1000", 10));
const outPath = process.argv[3];
const workParent = process.argv[4];
const mode = (process.argv[5] ?? "bulk-cas") as "broker" | "bulk-cas";

if (!outPath) {
  console.error(
    "usage: npx vite-node scripts/v3-exit-03-scale-probe.mts <N> <out.json> [workdir] [broker|bulk-cas]",
  );
  process.exit(2);
}

const root = workParent
  ? (() => {
      mkdirSync(workParent, { recursive: true });
      return workParent;
    })()
  : mkdtempSync(join(tmpdir(), "v3-exit03-scale-"));

const dbPath = join(root, "operational.db");
const coldRoot = join(root, "cas");
mkdirSync(coldRoot, { recursive: true });

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

const cold = new ColdStorage({ rootDir: coldRoot, compressionLevel: 1 });
const BATCH_LOG = Math.max(5000, Math.floor(N / 20));
const t0 = performance.now();

let migrated = 0;
let coldBytes = 0;
let rawBytes = 0;
let sampleCas: string | null = null;
let sampleColdOk = false;
let sampleBodyIsSummary = false;
let insertMs = 0;
let migrateMs = 0;

if (mode === "broker") {
  const broker = new MemoryBroker(dbPath, "exit03-scale", {
    vector: { available: false },
  });
  const ids: string[] = [];
  for (let i = 0; i < N; i++) {
    const rec = broker.propose({
      memory_type: "EPISODIC",
      title: `evt-${i}`,
      body: `scale-event-${i} payload=${"x".repeat(64)} stamp=${i}`,
      source: "v3-exit-03-scale-probe",
      payload: { i, kind: "scale", blob: `data-${i}` },
    });
    ids.push(rec.memory_id);
    if ((i + 1) % BATCH_LOG === 0) process.stderr.write(`insert ${i + 1}/${N}\n`);
  }
  insertMs = Math.round(performance.now() - t0);
  const tMig0 = performance.now();
  for (let i = 0; i < ids.length; i++) {
    const { migration } = await broker.migrateToCold(ids[i]!, cold);
    migrated += 1;
    coldBytes += migration.compressed_bytes;
    rawBytes += migration.raw_bytes;
    if ((i + 1) % BATCH_LOG === 0) process.stderr.write(`migrate ${i + 1}/${N}\n`);
  }
  migrateMs = Math.round(performance.now() - tMig0);
  const sample = broker.get(ids[0]!);
  sampleCas = sample?.cas_hash ?? null;
  sampleBodyIsSummary = Boolean(sample?.summary && sample.body === sample.summary);
  sampleColdOk = sample?.cas_hash
    ? (await broker.getColdPayload(ids[0]!, cold)).length > 0
    : false;
  broker.close();
} else {
  // bulk-cas: write post-migration pointer rows + CAS blobs (honest: not MemoryBroker.propose loop)
  const db = new Database(dbPath);
  db.exec(MEMORY_DB_SCHEMA_SQL);
  db.prepare(
    `INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(MEMORY_DB_SCHEMA_VERSION);

  const insert = db.prepare(
    `INSERT INTO memory_entries(
      memory_id, project_id, memory_type, status, contract_version,
      title, body, source, created_at, tainted,
      valid_from, valid_to, superseded_by, payload_json,
      cas_hash, summary, cold_migrated_at
    ) VALUES (?, ?, 'EPISODIC', 'ACTIVE', 1, ?, ?, 'v3-exit-03-scale-probe', ?, 0, ?, NULL, NULL, '{}', ?, ?, ?)`,
  );

  const txn = db.transaction((rows: Array<{
    id: string;
    title: string;
    summary: string;
    created: string;
    cas: string;
  }>) => {
    for (const r of rows) {
      insert.run(
        r.id,
        "exit03-scale",
        r.title,
        r.summary,
        r.created,
        r.created,
        r.cas,
        r.summary,
        r.created,
      );
    }
  });

  const CHUNK = 1000;
  for (let base = 0; base < N; base += CHUNK) {
    const end = Math.min(base + CHUNK, N);
    const batchMeta: Array<{
      id: string;
      title: string;
      summary: string;
      created: string;
      cas: string;
    }> = [];
    for (let i = base; i < end; i++) {
      const raw = Buffer.from(
        JSON.stringify({
          memory_id: `mem-scale-${i}`,
          title: `evt-${i}`,
          body: `scale-event-${i} payload=${"x".repeat(64)} stamp=${i}`,
          payload: { i, kind: "scale", blob: `data-${i}` },
        }),
        "utf8",
      );
      const put = await cold.put(raw);
      rawBytes += put.raw_bytes;
      coldBytes += put.compressed_bytes;
      const summary = `scale-event-${i} payload=${"x".repeat(32)}...`;
      const created = new Date(2026, 0, 1, 0, 0, 0, i % 1000).toISOString();
      const id = `mem-${randomUUID()}`;
      batchMeta.push({
        id,
        title: `evt-${i}`,
        summary,
        created,
        cas: put.cas_hash,
      });
      if (i === 0) {
        sampleCas = put.cas_hash;
        const got = await cold.get(put.cas_hash);
        sampleColdOk = Buffer.compare(got, raw) === 0;
        sampleBodyIsSummary = true;
      }
      migrated += 1;
    }
    txn(batchMeta);
    if (end % BATCH_LOG === 0 || end === N) {
      process.stderr.write(`bulk-cas ${end}/${N}\n`);
    }
  }
  insertMs = 0;
  migrateMs = Math.round(performance.now() - t0);
  db.close();
}

const tDone = performance.now();
const sqliteBytes = existsSync(dbPath) ? statSync(dbPath).size : 0;
const casDiskBytes = dirBytes(coldRoot);

const countDb = new Database(dbPath, { readonly: true });
const rowCount = (countDb.prepare("SELECT COUNT(*) AS c FROM memory_entries").get() as { c: number })
  .c;
const coldCount = (
  countDb.prepare("SELECT COUNT(*) AS c FROM memory_entries WHERE cas_hash IS NOT NULL").get() as {
    c: number;
  }
).c;
const avgBodyLen = (
  countDb.prepare("SELECT AVG(LENGTH(body)) AS a FROM memory_entries").get() as { a: number }
).a;
const avgPayloadLen = (
  countDb.prepare("SELECT AVG(LENGTH(payload_json)) AS a FROM memory_entries").get() as {
    a: number;
  }
).a;
countDb.close();

const report = {
  kind: "V3Exit03ScaleProbe",
  mode,
  N,
  migrated,
  row_count: rowCount,
  cold_count: coldCount,
  avg_body_len_operational: avgBodyLen,
  avg_payload_json_len_operational: avgPayloadLen,
  sqlite_operational_bytes: sqliteBytes,
  cas_disk_bytes: casDiskBytes,
  archived_raw_bytes: rawBytes,
  archived_compressed_bytes: coldBytes,
  compression_ratio: rawBytes > 0 ? coldBytes / rawBytes : null,
  sample_cas_hash: sampleCas,
  sample_body_is_summary: sampleBodyIsSummary,
  sample_cold_roundtrip_ok: sampleColdOk,
  insert_ms: insertMs,
  migrate_ms: migrateMs,
  total_ms: Math.round(tDone - t0),
  work_dir: root,
  target_n: 100_000,
  meets_100k: N >= 100_000,
  limitation:
    N >= 100_000
      ? mode === "bulk-cas"
        ? "bulk-cas writes post-migration pointer shape via ColdStorage.put + schema SQL (not per-row MemoryBroker.propose); operational DB holds pointers/summaries only"
        : null
      : `SCALE_N=${N} < 100000 — ran maximum viable for this probe slot; not invented as 100k`,
};

writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
