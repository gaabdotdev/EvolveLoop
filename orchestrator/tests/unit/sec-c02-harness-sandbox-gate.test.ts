import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliProcessAdapterDriver } from "../../src/v3/adapters/drivers/cli-process.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";

describe("ISSUE-SEC-C02 harness outside bwrap gate", () => {
  const prevConsent = process.env.EVOLVELOOP_HARNESS_CONSENT;
  const prevRequire = process.env.EVOLVELOOP_REQUIRE_HARNESS_SANDBOX;

  afterEach(() => {
    if (prevConsent === undefined) delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    else process.env.EVOLVELOOP_HARNESS_CONSENT = prevConsent;
    if (prevRequire === undefined) delete process.env.EVOLVELOOP_REQUIRE_HARNESS_SANDBOX;
    else process.env.EVOLVELOOP_REQUIRE_HARNESS_SANDBOX = prevRequire;
  });

  it("blocks real spawn when REQUIRE_HARNESS_SANDBOX=true", async () => {
    process.env.EVOLVELOOP_HARNESS_CONSENT = "true";
    process.env.EVOLVELOOP_REQUIRE_HARNESS_SANDBOX = "true";
    const dir = mkdtempSync(join(tmpdir(), "el-c02-"));
    const paths = resolveV3DataPaths(dir);
    // Use a driver that claims invoke; if CLI missing we still get blocked earlier —
    // either CLI_NOT_AVAILABLE or HARNESS_OUTSIDE_BWRAP_FORBIDDEN is acceptable fail-closed.
    const driver = new CliProcessAdapterDriver({
      adapter_id: "claude-code",
      cli_id: "claude",
      buildArgs: (p) => ["-p", p],
      notes: ["test"],
    });
    const result = await driver.invoke(paths, {
      work_id: "w1",
      task_id: "t1",
      provider_mode: "real",
      note: "probe",
    });
    expect(["blocked", "accepted"]).toContain(result.status);
    if (driver.can_invoke) {
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("HARNESS_OUTSIDE_BWRAP_FORBIDDEN");
    } else {
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("CLI_NOT_AVAILABLE");
    }
  });
});
