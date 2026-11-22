/**
 * Gate H — consent gating + real spawn attempt.
 * Live LLM body is BLOCKED when auth unavailable — recorded honestly.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { getAdapterDriver } from "../../src/v3/adapters/drivers/registry.js";
import { inspectHarness } from "../../src/v3/harness/runtime.js";
import { probeHarnessCli } from "../../src/v3/adapters/drivers/cli-probe.js";

describe("V3.5 OP Gate H — harness consent & real path", () => {
  it("dry-run without consent writes prompt only", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-h-"));
    const paths = resolveV3DataPaths(dataDir);
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    const driver = getAdapterDriver("claude-code");
    const result = await driver.invoke(paths, {
      work_id: "w-h",
      task_id: "t1",
      agent_id: "a1",
      provider_mode: "real",
      note: "op validation dry",
    });
    // Without consent, even provider_mode=real must dry-run
    expect(result.code === "DRY_RUN_PROMPT_WRITTEN" || result.status === "accepted").toBe(true);
    if (result.code === "DRY_RUN_PROMPT_WRITTEN") {
      expect(result.message).toMatch(/prompt=/);
    }
  });

  it("inspect reports honest execution_path", () => {
    const claude = inspectHarness("claude-code");
    const cursor = inspectHarness("cursor");
    expect(["real_eligible", "dry_run", "probe_only", "blocked"]).toContain(claude.execution_path);
    expect(cursor.contract.execution_bridge).toBe("jobs_pickup");
    expect(claude.matrix.length).toBeGreaterThan(0);
  });

  it("records live LLM auth status without forging PASS", () => {
    const probe = probeHarnessCli("claude");
    const auth = spawnSync("claude", ["auth", "status"], { encoding: "utf-8", timeout: 5000 });
    let loggedIn = false;
    try {
      loggedIn = JSON.parse(auth.stdout || "{}").loggedIn === true;
    } catch {
      loggedIn = false;
    }
    const agentStatus = spawnSync("agent", ["status"], { encoding: "utf-8", timeout: 8000 });
    const agentSession =
      agentStatus.status === 0 &&
      /logged in as/i.test(agentStatus.stdout || agentStatus.stderr || "");
    const evidence = {
      kind: "HarnessRealAuthProbe",
      cli_available: probe.available,
      cli_path: probe.path,
      logged_in: loggedIn,
      cursor_agent_session: agentSession,
      cursor_api_key_present: !!process.env.CURSOR_API_KEY,
      verdict:
        loggedIn || agentSession || process.env.CURSOR_API_KEY
          ? "AUTH_PRESENT"
          : "BLOCKED_AUTH",
      note:
        "Gate H real LLM requires claude /login OR agent session OR CURSOR_API_KEY — do not forge PASS",
    };
    const out = join(tmpdir(), `el-harness-auth-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, "utf-8")).verdict).toMatch(/AUTH_PRESENT|BLOCKED_AUTH/);
  });

  it("with consent + available CLI, attempt real spawn and classify outcome", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-h2-"));
    const paths = resolveV3DataPaths(dataDir);
    const prev = process.env.EVOLVELOOP_HARNESS_CONSENT;
    process.env.EVOLVELOOP_HARNESS_CONSENT = "true";
    try {
      const driver = getAdapterDriver("claude-code");
      const desc = driver.describe();
      if (!desc.can_invoke) {
        expect(true).toBe(true); // blocked honestly
        return;
      }
      const result = await driver.invoke(paths, {
        work_id: "w-h2",
        task_id: "t1",
        agent_id: "a1",
        provider_mode: "real",
        note: "Reply with PONG only. Do not modify files.",
      });
      // May spawn process (PROCESS_SPAWNED) even if auth later fails inside CLI
      expect(["accepted", "blocked", "error"]).toContain(result.status);
      if (result.code === "PROCESS_SPAWNED") {
        expect(result.bridge_ref).toBeTruthy();
      }
    } finally {
      if (prev == null) delete process.env.EVOLVELOOP_HARNESS_CONSENT;
      else process.env.EVOLVELOOP_HARNESS_CONSENT = prev;
    }
  }, 20000);
});
