import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { isValidId } from "../../../src/v4/contracts/common.js";
import { MAX_ARTIFACT_BYTES } from "../../../src/v4/artifacts/index.js";
import { WORK, runtime } from "../ledger/helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M02 artifact store", () => {
  it("stores content-addressed bytes and verifies the hash", async () => {
    const opened = runtime();
    roots.push(opened.root);
    const bytes = new TextEncoder().encode("payload-one");
    const art = await opened.rt.artifacts.put({
      work_id: WORK,
      bytes,
      media_type: "text/plain",
      origin: {},
    });
    expect(isValidId("artifact", art.artifact_id)).toBe(true);
    expect(art.integrity_status).toBe("VERIFIED");
    expect(art.content.size_bytes).toBe(bytes.byteLength);
    expect(await opened.rt.artifacts.verify({ sha256: art.content.sha256 })).toBe("VERIFIED");
    expect(await opened.rt.artifacts.get(art.artifact_id)).toMatchObject({ artifact_id: art.artifact_id });
    expect(await opened.rt.artifacts.verify({ sha256: "c".repeat(64) })).toBe("MISSING");
  });

  it("refuses invalid work ids and oversized blobs", async () => {
    const opened = runtime();
    roots.push(opened.root);
    await expect(
      opened.rt.artifacts.put({ work_id: "../etc", bytes: new Uint8Array([1]), media_type: "text/plain", origin: {} }),
    ).rejects.toThrow();
    await expect(
      opened.rt.artifacts.put({
        work_id: WORK,
        bytes: new Uint8Array(MAX_ARTIFACT_BYTES + 1),
        media_type: "application/octet-stream",
        origin: {},
      }),
    ).rejects.toThrow(/artifact_too_large/);
  });

  it("is deny-by-default across projects (access.project_ids = work)", async () => {
    const opened = runtime();
    roots.push(opened.root);
    const art = await opened.rt.artifacts.put({
      work_id: WORK,
      bytes: new Uint8Array([9]),
      media_type: "application/octet-stream",
      origin: {},
    });
    expect(art.access.project_ids).toEqual([WORK]);
    expect(art.access.classification).toBe("INTERNAL");
  });
});
