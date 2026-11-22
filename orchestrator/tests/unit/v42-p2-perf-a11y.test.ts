/**
 * V4.2 P2 — layout rows/a11y smoke, credentials canonical docs, version polish.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveLayoutMode,
  NARROW_COLUMNS,
  LOW_ROWS,
} from "../../src/cli/tui/layout-narrow.js";
import {
  formatJourneyHelp,
  formatAdvancedHelp,
  EVOLVE_CLI_PRODUCT_VERSION,
  EVOLVE_CLI_LEGACY_LABEL,
} from "../../src/cli/help-usage.js";
import {
  formatCredentialsCanonicalLines,
  resolveCredentialsCanonicalPaths,
} from "../../src/cli/credentials-paths.js";
import { colorEnabled, paint } from "../../src/v3/evolve-shell/colors.js";

describe("P2-2 layout rows + narrow a11y", () => {
  it("short height sets notice without inventing pass on live TTY", () => {
    const short = resolveLayoutMode(100, LOW_ROWS - 1);
    expect(short.short_height).toBe(true);
    expect(short.stack).toBe(true);
    expect(short.degradation_notice).toMatch(/Altura reduzida/);
    expect(short.degradation_notice).toMatch(/AVISO|footer|compactos/i);
  });

  it("narrow + short combines notices", () => {
    const both = resolveLayoutMode(NARROW_COLUMNS - 1, 8);
    expect(both.narrow).toBe(true);
    expect(both.short_height).toBe(true);
    expect(both.degradation_notice).toMatch(/estreito/);
    expect(both.degradation_notice).toMatch(/Altura reduzida/);
  });

  it("wide + tall has no degradation", () => {
    const ok = resolveLayoutMode(100, 40);
    expect(ok.narrow).toBe(false);
    expect(ok.short_height).toBe(false);
    expect(ok.degradation_notice).toBeNull();
  });

  it("NO_COLOR disables ANSI; labels remain readable as plain text", () => {
    expect(colorEnabled({ env: { NO_COLOR: "1" }, isTTY: true })).toBe(false);
    const painted = paint("yellow", "AVISO: terminal estreito", false);
    expect(painted).toBe("AVISO: terminal estreito");
    expect(painted).not.toMatch(/\u001b/);
  });
});

describe("P2-4 credentials canonical paths", () => {
  it("docs lines list both houses + precedence", () => {
    const lines = formatCredentialsCanonicalLines();
    expect(lines.join("\n")).toMatch(/credentials\.env/);
    expect(lines.join("\n")).toMatch(/secrets\.env/);
    expect(lines.join("\n")).toMatch(/Precedência|precedência|env/i);
  });

  it("resolve paths under temp workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "v42-cred-"));
    try {
      const r = resolveCredentialsCanonicalPaths(root, root);
      expect(r.setup_credentials_env).toContain(".evolveloop");
      expect(r.setup_credentials_env).toMatch(/credentials\.env$/);
      expect(r.provider_secrets_env).toMatch(/secrets\.env$/);
      expect(r.lines.length).toBeGreaterThanOrEqual(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("journey help surfaces credentials block", () => {
    const help = formatJourneyHelp();
    expect(help).toMatch(/Credenciais/);
    expect(help).toMatch(/credentials\.env/);
    expect(help).toMatch(/secrets\.env/);
  });
});

describe("P2-5 version / help polish", () => {
  it("advanced help uses product version and keeps legacy label", () => {
    const advanced = JSON.parse(formatAdvancedHelp()) as {
      version: string;
      legacy_cli_label: string;
      credentials: string[];
    };
    expect(advanced.version).toBe(EVOLVE_CLI_PRODUCT_VERSION);
    expect(advanced.legacy_cli_label).toBe(EVOLVE_CLI_LEGACY_LABEL);
    expect(advanced.credentials?.length).toBeGreaterThanOrEqual(3);
  });
});
