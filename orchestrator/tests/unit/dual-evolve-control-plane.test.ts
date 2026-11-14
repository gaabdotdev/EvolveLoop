import { describe, expect, it } from "vitest";
import {
  CONTROL_PLANES,
  requireControlPlane,
  resolveControlPlane,
} from "../../src/v3/entrypoints/control-plane.js";

describe("ISSUE-ARCH-DUAL-EVOLVE-001 control plane honesty", () => {
  it("lists three distinct surfaces", () => {
    expect(CONTROL_PLANES.map((p) => p.id).sort()).toEqual([
      "cursor_pda",
      "execution_engine",
      "v3_product_cli",
    ]);
  });

  it("warns when plane unset", () => {
    const r = resolveControlPlane({});
    expect(r.explicit).toBe(false);
    expect(r.plane).toBeNull();
    expect(r.warning).toMatch(/dual evolve/i);
  });

  it("requireControlPlane fails closed", () => {
    expect(() => requireControlPlane({})).toThrow(/control_plane|dual evolve/i);
    expect(requireControlPlane({ EVOLVELOOP_CONTROL_PLANE: "v3_product_cli" })).toBe(
      "v3_product_cli",
    );
  });
});
