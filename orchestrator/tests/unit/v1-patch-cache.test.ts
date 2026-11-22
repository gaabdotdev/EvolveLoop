/**
 * V1-TOK-15 — Batching + semantic patch cache SQLite hit/miss.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  batchMicrotasksByModule,
  normalizeErrorSignature,
  SemanticPatchCache,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-15 patch cache + batching", () => {
  let tmp: string;
  let cache: SemanticPatchCache;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok15-"));
    cache = new SemanticPatchCache(path.join(tmp, "patch-cache.db"));
  });

  afterEach(async () => {
    cache.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("batches microtasks by module_path", () => {
    const batches = batchMicrotasksByModule([
      { id: "b", module_path: "src/foo.ts", error_text: "e1" },
      { id: "a", module_path: "src/bar.ts", error_text: "e2" },
      { id: "c", module_path: "src/foo.ts", error_text: "e3" },
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0]!.module_path).toBe("src/bar.ts");
    expect(batches[1]!.module_path).toBe("src/foo.ts");
    expect(batches[1]!.tasks.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("cache miss then hit on normalized signature", () => {
    const modulePath = "src/util.ts";
    const errA = "TypeError at /home/user/proj/src/util.ts:10:5 value undefined";
    const errB = "TypeError at /other/box/src/util.ts:99:1 value undefined";

    expect(normalizeErrorSignature(errA, modulePath)).toBe(
      normalizeErrorSignature(errB, modulePath),
    );

    const miss = cache.lookup(modulePath, errA);
    expect(miss.hit).toBe(false);
    expect(miss.entry).toBeNull();

    cache.put(modulePath, errA, "@@ -10 +10 @@\n-fix\n+fixed\n");

    const hit = cache.lookup(modulePath, errB);
    expect(hit.hit).toBe(true);
    expect(hit.entry?.patch_text).toContain("+fixed");
    expect(hit.entry?.hit_count).toBe(1);

    const hit2 = cache.lookup(modulePath, errA);
    expect(hit2.hit).toBe(true);
    expect(hit2.entry?.hit_count).toBe(2);
  });

  it("different modules do not collide", () => {
    const err = "ReferenceError: x is not defined";
    cache.put("a.ts", err, "patch-a");
    const miss = cache.lookup("b.ts", err);
    expect(miss.hit).toBe(false);
  });
});
