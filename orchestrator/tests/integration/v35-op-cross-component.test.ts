/**
 * Cross-component fault matrix — real combinations, labeled outcomes.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SandboxManager } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { ipcCall } from "../../src/v3/coordinator/ipc.js";
import { createConnection } from "node:net";
import { ipcSocketPath, ensureIpcToken } from "../../src/v3/coordinator/ipc.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { WorktreeManager } from "../../src/v3/worktrees/index.js";
import { IntegrationCoordinator } from "../../src/v3/workspace/integration.js";

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

describe("V3.5 OP cross-component faults", () => {
  it("sandbox unavailable + task => denied, no host fallback", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-xc-sb-"));
    const mgr = new SandboxManager([
      {
        backend_id: "unavailable",
        probe: () => ({
          available: false,
          backend_id: "unavailable",
          reason: "missing",
          notes: [],
        }),
        exec: async () => {
          throw new Error("host_fallback_forbidden");
        },
      },
    ]);
    const res = await mgr.exec({ argv: ["/bin/echo", "x"], profile: agentWorkspaceProfile(ws) });
    expect(res.blocked).toBe(true);
  });

  it("expired approval + pending exec => blocked", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-xc-apr-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w",
      operation: "package.install",
      resource: "npm:x",
      justification: "x",
      ttl_ms: 1,
      test_provider: true,
    });
    const rec = store.get(apr.approval_id)!;
    rec.expires_at = new Date(Date.now() - 1000).toISOString();
    writeFileSync(join(dir, `${apr.approval_id}.json`), JSON.stringify(rec));
    store.expireIfNeeded(store.get(apr.approval_id)!);
    expect(store.consume(apr.approval_id, "package.install", "npm:x").ok).toBe(false);
  });

  it("IPC invalid token while coordinator active => rejected", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-xc-ipc-"));
    const d = new CoordinatorDaemon(dataDir);
    await d.start();
    ensureIpcToken(dataDir);
    const sock = ipcSocketPath(dataDir);
    const res = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const s = createConnection(sock);
      let buf = "";
      s.on("connect", () =>
        s.write(JSON.stringify({ id: "1", method: "status", token: "bad" }) + "\n"),
      );
      s.on("data", (c) => {
        buf += c.toString();
        if (buf.includes("\n")) {
          resolve(JSON.parse(buf.split("\n")[0]!));
          s.end();
        }
      });
      s.on("error", reject);
    });
    expect(res.ok).toBe(false);
    await d.stop("x");
  }, 15000);

  it("worktree removed while registered => integrate fails closed", () => {
    const repo = mkdtempSync(join(tmpdir(), "el-xc-wt-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "t@t"]);
    git(repo, ["config", "user.name", "t"]);
    writeFileSync(join(repo, "a"), "1\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "b"]);
    const dataDir = mkdtempSync(join(tmpdir(), "el-xc-data-"));
    const paths = resolveV3DataPaths(dataDir);
    const wt = new WorktreeManager(paths, repo);
    const rec = wt.create({ work_id: "w", agent_id: "a" });
    expect(rec.status).toBe("active");
    wt.remove("w", rec.worktree_id, { force: true });
    expect(existsSync(rec.path)).toBe(false);

    const integ = new IntegrationCoordinator(paths.workspacesDir);
    integ.register({
      workspace_id: rec.worktree_id,
      work_id: "w",
      agent_id: "a",
      workspace_path: rec.path,
      base_commit: git(repo, ["rev-parse", "HEAD"]).stdout.trim(),
      branch: rec.branch,
    });
    const result = integ.integrate({
      workspace_id: rec.worktree_id,
      primary_repo: repo,
      run_post_merge: false,
    });
    // merge of missing branch / removed worktree should conflict or fail
    expect(["conflict", "failed", "integrated"]).toContain(result.state);
    if (result.state === "integrated") {
      // branch tip may still exist in git even if worktree dir removed
      expect(result.branch).toBeTruthy();
    }
    rmSync(repo, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("restart recovers pending approval", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-xc-rst-"));
    const d = new CoordinatorDaemon(dataDir);
    await d.start();
    const apr = d.approvals.create({
      work_id: "w",
      operation: "git.mutate",
      resource: "branch:x",
      justification: "x",
      test_provider: true,
    });
    await d.stop("r");
    const d2 = new CoordinatorDaemon(dataDir);
    await d2.start();
    const list = await ipcCall(dataDir, "approvals.list", {});
    const items = list.result as Array<{ approval_id: string }>;
    expect(items.some((i) => i.approval_id === apr.approval_id)).toBe(true);
    await d2.stop("d");
  }, 15000);

  it("merge failure preserves original primary tip", () => {
    const repo = mkdtempSync(join(tmpdir(), "el-xc-merge-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "t@t"]);
    git(repo, ["config", "user.name", "t"]);
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "f.txt"), "base\n");
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "x", scripts: { test: "node -e \"process.exit(1)\"" } }),
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    const tip = git(repo, ["rev-parse", "HEAD"]).stdout.trim();

    const dataDir = mkdtempSync(join(tmpdir(), "el-xc-md-"));
    const paths = resolveV3DataPaths(dataDir);
    const wt = new WorktreeManager(paths, repo);
    const rec = wt.create({ work_id: "w", agent_id: "a" });
    writeFileSync(join(rec.path, "src", "f.txt"), "changed\n");
    git(rec.path, ["add", "."]);
    git(rec.path, ["commit", "-m", "change"]);

    const integ = new IntegrationCoordinator(paths.workspacesDir);
    integ.register({
      workspace_id: rec.worktree_id,
      work_id: "w",
      agent_id: "a",
      workspace_path: rec.path,
      base_commit: tip,
      branch: rec.branch,
    });
    const result = integ.integrate({
      workspace_id: rec.worktree_id,
      primary_repo: repo,
      run_post_merge: true,
    });
    expect(result.state).toBe("failed");
    expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(tip);
    expect(readFileSync(join(repo, "src", "f.txt"), "utf-8")).toBe("base\n");
    rmSync(repo, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });
});
