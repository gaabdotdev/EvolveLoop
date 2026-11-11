import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { getAdapterDriver, listAdapterDrivers } from "../../src/v3/adapters/drivers/registry.js";

describe("Adapter drivers", () => {
  it("exposes four drivers; cursor always can_invoke", () => {
    const drivers = listAdapterDrivers();
    expect(drivers).toHaveLength(4);
    expect(getAdapterDriver("cursor").can_invoke).toBe(true);
    // claude/codex/antigravity can_invoke mirrors CLI presence (environment-dependent)
    for (const id of ["claude-code", "codex", "antigravity"] as const) {
      expect(typeof getAdapterDriver(id).can_invoke).toBe("boolean");
    }
  });

  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "drv-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("claude-code dry-run writes prompt when can_invoke, else blocks", async () => {
    const paths = resolveV3DataPaths(tmp);
    const driver = getAdapterDriver("claude-code");
    const result = await driver.invoke(paths, {
      work_id: "w1",
      task_id: "t1",
      provider_mode: "mock",
      note: "continue",
    });
    if (driver.can_invoke) {
      expect(result.status).toBe("accepted");
      expect(result.code).toBe("DRY_RUN_PROMPT_WRITTEN");
      expect(result.bridge_ref).toBeTruthy();
    } else {
      expect(result.status).toBe("blocked");
    }
  });

  it("codex/antigravity fail-closed when cannot invoke", async () => {
    const paths = resolveV3DataPaths(tmp);
    for (const id of ["codex", "antigravity"] as const) {
      const driver = getAdapterDriver(id);
      if (driver.can_invoke) continue;
      const result = await driver.invoke(paths, { work_id: "w1", task_id: "t1" });
      expect(result.status).toBe("blocked");
    }
  });

  it("cursor without ir_path fails closed (not accepted)", async () => {
    const paths = resolveV3DataPaths(tmp);
    const result = await getAdapterDriver("cursor").invoke(paths, {
      work_id: "w1",
      task_id: "t1",
    });
    expect(result.status).toBe("failed");
    expect(result.code).toBe("IR_PATH_REQUIRED");
  });
});
