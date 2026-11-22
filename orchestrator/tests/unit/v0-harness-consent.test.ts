import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyHarnessConsentEnv,
  harnessConsentGranted,
  persistHarnessConsent,
} from "../../src/v3/security/harness-consent.js";

describe("harness consent", () => {
  const prev = process.env.EVOLVELOOP_HARNESS_CONSENT;
  let tmpHome: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "el-consent-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmpHome;
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    else process.env.EVOLVELOOP_HARNESS_CONSENT = prev;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it("defaults false without env/config", () => {
    expect(harnessConsentGranted()).toBe(false);
  });

  it("persistHarnessConsent writes yaml and enables env", async () => {
    const { path: cfg } = persistHarnessConsent(true);
    expect(cfg).toContain(".config/evolveloop/config.yaml");
    const raw = await fs.readFile(cfg, "utf-8");
    expect(raw).toMatch(/harness_consent:\s*true/);
    expect(process.env.EVOLVELOOP_HARNESS_CONSENT).toBe("true");
    expect(harnessConsentGranted()).toBe(true);
  });

  it("env false wins over file true", async () => {
    persistHarnessConsent(true);
    applyHarnessConsentEnv(false);
    expect(harnessConsentGranted()).toBe(false);
  });
});
