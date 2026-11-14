import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerRuntime, buildContract } from "../../../src/v3/fabric/worker-runtime/runtime.js";

describe("V3.7 worker runtime sandbox", () => {
  it("executes under bubblewrap when sandbox_profile requires OS isolation", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-wsand-"));
    const rt = new WorkerRuntime({
      worker_node_id: "wn_sandbox",
      workRoot: root,
      slots: 1,
      requireOsSandbox: true,
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "sand1",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: ["bubblewrap"],
      permissions: ["workspace.write"],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "agent-workspace",
      network_policy: "default-deny",
      worker_node_id: "wn_sandbox",
      lease_id: "lease1",
      fencing_epoch: 1,
      evidence_requirements: ["stdout"],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 1000, force_after_ms: 2000 },
    });
    const result = await rt.execute(contract, {
      command: [process.execPath, "-e", "console.log('sandboxed:'+process.env.EL_TASK_ID)"],
    });
    expect(result.status).toBe("completed");
    expect(result.supervision.sandbox_id).toBe("bubblewrap");
    expect(result.stdout).toMatch(/sandboxed:sand1/);
  });

  it("fail-closes when OS sandbox required but backend unavailable", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-wsand-miss-"));
    const { SandboxManager } = await import("../../../src/v3/sandbox/manager.js");
    const { UnavailableSandboxBackend } = await import("../../../src/v3/sandbox/backends/unavailable.js");
    const rt = new WorkerRuntime({
      worker_node_id: "wn_sandbox",
      workRoot: root,
      slots: 1,
      requireOsSandbox: true,
      sandboxManager: new SandboxManager([new UnavailableSandboxBackend()]),
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "sand2",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: ["bubblewrap"],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "agent-workspace",
      network_policy: "default-deny",
      worker_node_id: "wn_sandbox",
      lease_id: "lease2",
      fencing_epoch: 1,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 1000, force_after_ms: 2000 },
    });
    const result = await rt.execute(contract);
    expect(result.status).toBe("failed");
    expect(result.supervision.correlation_ids.reject).toMatch(/sandbox/);
  });

  it("rejects path traversal outside workspace via contract workspace isolation", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-wsand-trav-"));
    const secret = join(root, "..", "secret.txt");
    // secret outside workRoot
    const outside = mkdtempSync(join(tmpdir(), "el-secret-"));
    writeFileSync(join(outside, "secret.txt"), "TOPSECRET");
    const rt = new WorkerRuntime({
      worker_node_id: "wn_sandbox",
      workRoot: root,
      slots: 1,
      requireOsSandbox: true,
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "trav1",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: ["bubblewrap"],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "agent-workspace",
      network_policy: "default-deny",
      worker_node_id: "wn_sandbox",
      lease_id: "lease3",
      fencing_epoch: 1,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 1000, force_after_ms: 2000 },
    });
    const result = await rt.execute(contract, {
      command: [
        process.execPath,
        "-e",
        `try{console.log(require('fs').readFileSync(${JSON.stringify(join(outside, "secret.txt"))},'utf8'))}catch(e){console.log('denied:'+e.code)}`,
      ],
    });
    expect(result.status).toBe("completed");
    expect(result.stdout).toMatch(/denied:/);
    expect(result.stdout).not.toMatch(/TOPSECRET/);
    void secret;
    mkdirSync(root, { recursive: true });
  });
});
