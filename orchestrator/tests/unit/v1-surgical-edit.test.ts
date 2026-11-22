/**
 * V1-TOK-11 — Surgical REPLACE/DELETE with hash/offset validation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applySurgicalEdit,
  hashLineRange,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-11 surgical edit", () => {
  let tmp: string;
  let file: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok11-"));
    file = path.join(tmp, "target.ts");
    await fs.writeFile(
      file,
      ["line-1", "line-2", "line-3", "line-4", "line-5"].join("\n") + "\n",
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("REPLACE succeeds with matching hash", async () => {
    const src = await fs.readFile(file, "utf-8");
    const expectedHash = hashLineRange(src, 2, 3);
    const result = applySurgicalEdit(file, {
      op: "REPLACE",
      start: 2,
      end: 3,
      content: "replaced-a\nreplaced-b",
      expectedHash,
    });
    expect(result.ok).toBe(true);
    expect(result.error_code).toBeUndefined();
    expect(result.lines_removed).toBe(2);
    expect(result.lines_inserted).toBe(2);

    const after = await fs.readFile(file, "utf-8");
    expect(after).toBe(
      ["line-1", "replaced-a", "replaced-b", "line-4", "line-5"].join("\n") + "\n",
    );
  });

  it("DELETE succeeds with matching hash", async () => {
    const src = await fs.readFile(file, "utf-8");
    const expectedHash = hashLineRange(src, 2, 4);
    const result = applySurgicalEdit(file, {
      op: "DELETE",
      start: 2,
      end: 4,
      expectedHash,
    });
    expect(result.ok).toBe(true);
    expect(result.lines_removed).toBe(3);
    expect(result.lines_inserted).toBe(0);

    const after = await fs.readFile(file, "utf-8");
    expect(after).toBe(["line-1", "line-5"].join("\n") + "\n");
  });

  it("hash mismatch fails without mutating file", async () => {
    const before = await fs.readFile(file, "utf-8");
    const result = applySurgicalEdit(file, {
      op: "REPLACE",
      start: 2,
      end: 3,
      content: "nope",
      expectedHash: "deadbeef",
    });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("HASH_MISMATCH");
    expect(await fs.readFile(file, "utf-8")).toBe(before);
  });

  it("offset mismatch fails", async () => {
    const src = await fs.readFile(file, "utf-8");
    const expectedHash = hashLineRange(src, 2, 2);
    const result = applySurgicalEdit(file, {
      op: "DELETE",
      start: 2,
      end: 2,
      expectedHash,
      expectedOffset: 9999,
    });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("OFFSET_MISMATCH");
  });

  it("workspace-root confinement works", async () => {
    const src = await fs.readFile(file, "utf-8");
    const expectedHash = hashLineRange(src, 1, 1);
    const result = applySurgicalEdit(
      "target.ts",
      { op: "REPLACE", start: 1, end: 1, content: "X", expectedHash },
      tmp,
    );
    expect(result.ok).toBe(true);
    expect(await fs.readFile(file, "utf-8")).toMatch(/^X\n/);
  });
});
