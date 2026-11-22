/**
 * V3-MEM-01 — Content-Addressed Cold Storage (Zstd + SHA-256).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ColdStorage,
  ColdStorageError,
  MemoryBroker,
  sha256Hex,
  formatCasHash,
  parseCasHash,
  MEMORY_DB_SCHEMA_VERSION,
  MEMORY_COLD_V2_COLUMNS,
} from "../../src/v3/memory/index.js";

describe("V3-MEM-01 Content-Addressed Cold Storage", () => {
  let coldRoot: string;
  let cold: ColdStorage;
  let broker: MemoryBroker;

  beforeEach(() => {
    coldRoot = mkdtempSync(join(tmpdir(), "v3-mem01-cas-"));
    cold = new ColdStorage({ rootDir: coldRoot, compressionLevel: 3 });
    broker = new MemoryBroker(":memory:", "proj-cas-01");
  });

  afterEach(() => {
    broker.close();
    rmSync(coldRoot, { recursive: true, force: true });
  });

  it("roundtrips compress/decompress with SHA-256 integrity", async () => {
    const raw = Buffer.from(
      JSON.stringify({
        event: "evidence.dump",
        lines: Array.from({ length: 200 }, (_, i) => `line-${i}-payload-${"x".repeat(32)}`),
      }),
      "utf8",
    );

    const put = await cold.put(raw);
    expect(put.cas_hash).toBe(formatCasHash(sha256Hex(raw)));
    expect(put.raw_bytes).toBe(raw.length);
    expect(put.compressed_bytes).toBeLessThan(put.raw_bytes);
    expect(put.deduped).toBe(false);
    expect(existsSync(put.blob_path)).toBe(true);

    const got = await cold.get(put.cas_hash);
    expect(Buffer.compare(got, raw)).toBe(0);
    expect(sha256Hex(got)).toBe(parseCasHash(put.cas_hash));

    const again = await cold.put(raw);
    expect(again.deduped).toBe(true);
    expect(again.cas_hash).toBe(put.cas_hash);
  });

  it("rejects tampered blobs (integrity mismatch)", async () => {
    const raw = Buffer.from("trusted-cold-payload-v3-mem-01", "utf8");
    const put = await cold.put(raw);

    // Corrupt compressed bytes on disk without changing the address.
    const blob = readFileSync(put.blob_path);
    const tampered = Buffer.from(blob);
    tampered[Math.min(12, tampered.length - 1)] ^= 0xff;
    writeFileSync(put.blob_path, tampered);

    await expect(cold.get(put.cas_hash)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ColdStorageError);
      const code = (err as ColdStorageError).code;
      // Decompress may fail first, or decompress succeeds with wrong content → mismatch.
      return code === "INTEGRITY_MISMATCH" || code === "DECOMPRESS_FAILED";
    });
  });

  it("rejects a valid zstd blob whose raw hash does not match cas_hash", async () => {
    const a = Buffer.from("payload-A-aaaaaaaa", "utf8");
    const b = Buffer.from("payload-B-bbbbbbbb", "utf8");
    const putA = await cold.put(a);
    const putB = await cold.put(b);

    // Point A's address at B's compressed bytes → decompress OK, hash mismatch.
    writeFileSync(putA.blob_path, readFileSync(putB.blob_path));

    await expect(cold.get(putA.cas_hash)).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("after migrateToCold, SQLite has no raw payload and get via cas_hash works", async () => {
    const bulky = "RAW_EVIDENCE_" + "Z".repeat(4000);
    const proposed = broker.propose({
      memory_type: "evidence",
      title: "large evidence blob",
      body: bulky,
      source: "unit-test",
      payload: { dump: bulky, nested: { n: 42 } },
    });

    expect(proposed.cas_hash).toBeNull();
    expect(proposed.body).toContain("RAW_EVIDENCE_");
    expect(proposed.payload.dump).toBe(bulky);

    const { record, migration } = await broker.migrateToCold(proposed.memory_id, cold, {
      summary: "large evidence blob (cold)",
    });

    expect(migration.cas_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(record.cas_hash).toBe(migration.cas_hash);
    expect(record.summary).toBe("large evidence blob (cold)");
    expect(record.cold_migrated_at).toBeTruthy();

    // Active SQLite: no raw payload — only pointer + summary metadata.
    expect(record.body).toBe(record.summary);
    expect(record.payload).toEqual({});
    expect(JSON.stringify(record)).not.toContain("RAW_EVIDENCE_");

    const reloaded = broker.get(proposed.memory_id);
    expect(reloaded?.cas_hash).toBe(migration.cas_hash);
    expect(reloaded?.payload).toEqual({});
    expect(reloaded?.body).not.toContain("RAW_EVIDENCE_");

    const coldBytes = await broker.getColdPayload(proposed.memory_id, cold);
    const archived = JSON.parse(coldBytes.toString("utf8")) as {
      body: string;
      payload: { dump: string };
    };
    expect(archived.body).toBe(bulky);
    expect(archived.payload.dump).toBe(bulky);

    const viaCas = await cold.get(record.cas_hash!);
    expect(Buffer.compare(viaCas, coldBytes)).toBe(0);
  });

  it("schema v2 exposes cold pointer columns and MEMORY_DB_SCHEMA_VERSION is 2", () => {
    expect(MEMORY_DB_SCHEMA_VERSION).toBe("2");
    expect(MEMORY_COLD_V2_COLUMNS.map((c) => c.name).sort()).toEqual([
      "cas_hash",
      "cold_migrated_at",
      "summary",
    ]);

    const hot = broker.propose({
      memory_type: "episodic",
      title: "hot",
      body: "still hot",
      source: "unit",
    });
    expect(hot.cas_hash).toBeNull();
    expect(hot.summary).toBeNull();
    expect(hot.cold_migrated_at).toBeNull();
  });

  it("migrateToCold refuses double migration", async () => {
    const rec = broker.propose({
      memory_type: "semantic",
      title: "once",
      body: "payload-once",
      source: "unit",
    });
    await broker.migrateToCold(rec.memory_id, cold);
    await expect(broker.migrateToCold(rec.memory_id, cold)).rejects.toMatchObject({
      code: "ALREADY_COLD",
    });
  });
});
