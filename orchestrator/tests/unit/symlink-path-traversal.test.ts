import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathEscapesWorkspace, authorize } from "../../src/authority/capability-authority.js";
import { assertPathConfined } from "../../src/knowledge/uks/storage-core.js";
import { assertFeatureIdConfined, JsonlEventPersister } from "../../src/persistence/jsonl-event-persister.js";
import { assertRunIdConfined, JobStore } from "../../src/jobs/job-store.js";
import { assertKnowledgeIdConfined } from "../../src/knowledge/filesystem-knowledge-store.js";

describe("symlink and path traversal confinement", () => {
  let wsDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    wsDir = await fs.mkdtemp(path.join(os.tmpdir(), "orch-ws-"));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "orch-outside-"));
    await fs.writeFile(path.join(outsideDir, "secret.txt"), "outside secret");
  });

  afterEach(async () => {
    await fs.rm(wsDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("detects symlink pointing outside workspace in pathEscapesWorkspace", async () => {
    const symlinkPath = path.join(wsDir, "symlink_to_outside");
    await fs.symlink(outsideDir, symlinkPath);

    // Target via symlink points to outsideDir/secret.txt
    const targetViaSymlink = path.join(symlinkPath, "secret.txt");
    expect(pathEscapesWorkspace(targetViaSymlink, wsDir)).toBe(true);
  });

  it("assertPathConfined rejects symlinks escaping root directory", async () => {
    const symlinkPath = path.join(wsDir, "symlink_dir");
    await fs.symlink(outsideDir, symlinkPath);

    expect(() => {
      assertPathConfined(path.join(symlinkPath, "secret.txt"), wsDir);
    }).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
  });

  it("CapabilityAuthority prevents masking when multiple paths are passed (cwd vs path)", () => {
    const auth = authorize({
      capability: "filesystem.read",
      targetPath: "safe.txt",
      cwd: "../../etc",
      context: { workspaceRoot: wsDir },
    });

    expect(auth.decision).toBe("deny");
    expect(auth.reason).toBe("path_escape_denied");
  });

  it("assertFeatureIdConfined and assertRunIdConfined reject traversal patterns", () => {
    expect(() => assertFeatureIdConfined("../evil")).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
    expect(() => assertFeatureIdConfined("foo/bar")).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
    expect(() => assertRunIdConfined("../evil-run")).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
    expect(() => assertRunIdConfined("evil\\run")).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
    expect(() => assertKnowledgeIdConfined("../evil-entry")).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
  });

  it("JobStore writes result file before marking job completed", async () => {
    const jobsDir = path.join(wsDir, "jobs");
    await fs.mkdir(jobsDir, { recursive: true });
    const store = new JobStore(jobsDir);

    const initialJob = {
      apiVersion: "v2.5",
      kind: "SkillJob" as const,
      run_id: "test-run-1",
      provider_id: "test",
      skill_path: "skills/test",
      capability: "test",
      node_id: "n1",
      briefing: "test briefing",
      definition_of_done: [],
      inputs: [],
      status: "pending" as const,
    };

    await fs.writeFile(path.join(jobsDir, "test-run-1.json"), JSON.stringify(initialJob));

    store.completeJob("test-run-1", {
      success: true,
      evidence_path: "evidence/1.json",
    });

    expect(store.hasCompletedResult("test-run-1")).toBe(true);
    const completedJob = store.readJob("test-run-1");
    const result = store.readResult("test-run-1");

    expect(completedJob?.status).toBe("completed");
    expect(result?.success).toBe(true);
  });
});
