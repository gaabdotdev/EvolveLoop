/**
 * V1-PROD-01 — Interactive first-run setup with mocked probes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runFirstRunSetup,
  redactSecrets,
  writeCredentialsSecure,
  buildReadinessReport,
  DEFAULT_LIMITS,
  type ProbeResult,
} from "../../src/v3/evolve-shell/first-run-setup.js";

describe("V1-PROD-01 first-run setup", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-prod01-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("redacts secrets from probe/log text", () => {
    expect(redactSecrets("Authorization: Bearer sk-live-abc123xyz")).toContain("***");
    expect(redactSecrets("api_key=supersecret")).toContain("***");
    expect(redactSecrets("hello world")).toBe("hello world");
  });

  it("writes credentials with 0600 and never returns values in report", async () => {
    const credPath = path.join(tmp, ".evolveloop", "credentials.env");
    writeCredentialsSecure(credPath, [
      { name: "OPENROUTER_API_KEY", value: "sk-secret-SHOULD-NOT-APPEAR" },
    ]);
    expect(existsSync(credPath)).toBe(true);
    const mode = statSync(credPath).mode & 0o777;
    expect(mode).toBe(0o600);
    const raw = readFileSync(credPath, "utf-8");
    expect(raw).toContain("sk-secret-SHOULD-NOT-APPEAR");

    const probes: ProbeResult[] = [
      { id: "node", status: "ok", message: "v22" },
      { id: "workspace", status: "ok", message: tmp },
      { id: "freellmapi", status: "warn", message: "unreachable" },
    ];
    const report = await runFirstRunSetup({
      workspace: tmp,
      non_interactive: true,
      credentials: [{ name: "FREELLMAPI_API_KEY", value: "another-secret-xyz" }],
      probes: () => probes,
      credentials_path: credPath,
      limits_path: path.join(tmp, ".evolveloop", "limits.json"),
      limits: { max_parallel_tasks: 2 },
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("another-secret");
    expect(report.credentials.present_names).toContain("OPENROUTER_API_KEY");
    expect(report.credentials.present_names).toContain("FREELLMAPI_API_KEY");
    expect(report.credentials.written).toContain("FREELLMAPI_API_KEY");
    expect(report.ready).toBe(true);
    expect(report.limits.max_parallel_tasks).toBe(2);
    expect(report.limits.max_agent_sessions).toBe(DEFAULT_LIMITS.max_agent_sessions);
    expect(report.probes).toHaveLength(3);
  });

  it("marks not ready when node probe fails", async () => {
    const report = buildReadinessReport({
      workspace: tmp,
      probes: [
        { id: "node", status: "missing", message: "node missing" },
        { id: "workspace", status: "ok", message: tmp },
      ],
      credentials: { path: "x", written: [], present_names: [] },
      limits: DEFAULT_LIMITS,
    });
    expect(report.ready).toBe(false);
  });
});
