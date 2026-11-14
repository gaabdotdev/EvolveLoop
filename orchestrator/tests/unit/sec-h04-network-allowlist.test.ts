import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBubblewrapArgvForTest } from "../../src/v3/sandbox/backends/bubblewrap.js";
import { agentWorkspaceProfile } from "../../src/v3/security/profiles.js";

describe("ISSUE-SEC-H04-NET network allowlist fail-closed", () => {
  it("deny mode unshares net", () => {
    const ws = mkdtempSync(join(tmpdir(), "el-h04-"));
    writeFileSync(join(ws, "f"), "x");
    const profile = agentWorkspaceProfile(ws);
    expect(profile.network.mode).toBe("deny");
    const argv = buildBubblewrapArgvForTest(
      { argv: ["/bin/true"], profile, cwd: ws },
      "/usr/bin/bwrap",
    );
    expect(argv).toContain("--unshare-net");
  });

  it("allowlist without * fails closed", () => {
    const ws = mkdtempSync(join(tmpdir(), "el-h04b-"));
    const profile = {
      ...agentWorkspaceProfile(ws),
      network: { mode: "allowlist" as const, allowlist: ["api.example.com"] },
    };
    expect(() =>
      buildBubblewrapArgvForTest({ argv: ["/bin/true"], profile, cwd: ws }, "/usr/bin/bwrap"),
    ).toThrow(/ALLOWLIST_UNIMPLEMENTED/);
  });

  it("allowlist=['*'] does not claim filtering (no unshare; unrestricted)", () => {
    const ws = mkdtempSync(join(tmpdir(), "el-h04c-"));
    const profile = {
      ...agentWorkspaceProfile(ws),
      network: { mode: "allowlist" as const, allowlist: ["*"] },
    };
    const argv = buildBubblewrapArgvForTest(
      { argv: ["/bin/true"], profile, cwd: ws },
      "/usr/bin/bwrap",
    );
    expect(argv).not.toContain("--unshare-net");
  });
});
