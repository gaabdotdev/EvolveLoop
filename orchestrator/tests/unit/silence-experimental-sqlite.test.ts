/**
 * M7 — ExperimentalWarning: SQLite must be suppressible without hiding other warnings.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSqliteExperimentalWarning } from "../../src/cli/silence-experimental-sqlite.js";

const here = dirname(fileURLToPath(import.meta.url));
const distSilence = join(here, "../../dist/cli/silence-experimental-sqlite.js");

describe("M7 — silence ExperimentalWarning: SQLite (selective)", () => {
  it("detects string + ExperimentalWarning + sqlite message", () => {
    expect(
      isSqliteExperimentalWarning(
        "SQLite is an experimental feature and might change at any time",
        "ExperimentalWarning",
      ),
    ).toBe(true);
  });

  it("detects Error-shaped ExperimentalWarning with sqlite message", () => {
    const err = Object.assign(new Error("SQLite is an experimental feature"), {
      name: "ExperimentalWarning",
    });
    expect(isSqliteExperimentalWarning(err)).toBe(true);
  });

  it("detects options-object form { type: ExperimentalWarning }", () => {
    expect(
      isSqliteExperimentalWarning("SQLite is experimental", {
        type: "ExperimentalWarning",
      }),
    ).toBe(true);
  });

  it("does NOT match other ExperimentalWarnings", () => {
    expect(
      isSqliteExperimentalWarning(
        "The Fetch API is an experimental feature",
        "ExperimentalWarning",
      ),
    ).toBe(false);
  });

  it("does NOT match non-experimental sqlite messages", () => {
    expect(isSqliteExperimentalWarning("sqlite open failed", "Error")).toBe(false);
  });

  it("child process: silence drops sqlite warning, keeps other ExperimentalWarning", () => {
    expect(existsSync(distSilence), `missing ${distSilence} — run npm run build`).toBe(true);
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          import ${JSON.stringify(distSilence)};
          process.emitWarning(
            "SQLite is an experimental feature and might change at any time",
            "ExperimentalWarning",
          );
          process.emitWarning("Custom experimental probe", "ExperimentalWarning");
          await import("node:sqlite");
          console.log("CHILD_OK");
        `,
      ],
      { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("CHILD_OK");
    expect(r.stderr).not.toMatch(/ExperimentalWarning:\s*SQLite/i);
    expect(r.stderr).toMatch(/Custom experimental probe/);
  });
});
