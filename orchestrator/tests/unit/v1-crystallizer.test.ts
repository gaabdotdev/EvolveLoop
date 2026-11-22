/**
 * V1-TOK-19 — Skill-to-Code crystallizer: N=3 then zero-token path.
 */

import { describe, it, expect } from "vitest";
import {
  CRYSTALLIZE_THRESHOLD,
  CrystallizerRegistry,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-19 crystallizer", () => {
  it("crystallizes at N>=3 and 4th run is zero tokens", async () => {
    expect(CRYSTALLIZE_THRESHOLD).toBe(3);
    const reg = new CrystallizerRegistry({ tokensPerLiveRun: 42 });
    const pid = "fix-import-sort";

    const r1 = await reg.run({ pattern_id: pid, success: true });
    expect(r1.status).toBe("recorded");
    expect(r1.tokens_used).toBe(42);
    expect(r1.crystallized).toBe(false);

    const r2 = await reg.run({ pattern_id: pid, success: true });
    expect(r2.status).toBe("recorded");
    expect(r2.success_count).toBe(2);

    const r3 = await reg.run({
      pattern_id: pid,
      success: true,
      script: "#!/usr/bin/env node\nconsole.log('crystallized')",
      validate: (s) => s.includes("crystallized"),
    });
    expect(r3.status).toBe("crystallized");
    expect(r3.crystallized).toBe(true);
    if (r3.status === "crystallized") {
      expect(r3.script.tokens_on_hit).toBe(0);
      expect(r3.script.validated).toBe(true);
    }

    const r4 = await reg.run({ pattern_id: pid, success: true });
    expect(r4.status).toBe("zero_token_script");
    expect(r4.tokens_used).toBe(0);
    expect(r4.crystallized).toBe(true);

    const r5 = await reg.run({ pattern_id: pid, success: false });
    expect(r5.status).toBe("zero_token_script");
    expect(r5.tokens_used).toBe(0);
  });
});
