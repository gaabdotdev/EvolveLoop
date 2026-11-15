import { describe, expect, it } from "vitest";
import { ID_PREFIX } from "../../../src/v4/contracts/common.js";
import { BoundaryIdError, FORBIDDEN_PATH_ID_KINDS, isForbiddenPathIdKind, workPath } from "../../../src/v4/ledger/index.js";

describe("M02 store id boundary (ADR-V4-0015 / F08 / R5)", () => {
  it("refuses traversal, encoded, NUL and absolute ids as path components", () => {
    const attacks = ["../etc/passwd", "foo/bar", "foo\\bar", "foo%2fbar", "foo..bar", "foo\0bar"];
    for (const attack of attacks) {
      expect(() => workPath("/tmp/m02-root", `work_${attack}`)).toThrow(BoundaryIdError);
    }
    expect(() => workPath("/tmp/m02-root", "/tmp/x")).toThrow(BoundaryIdError);
  });

  it("accepts a grammar-valid work id", () => {
    const p = workPath("/tmp/m02-root", "work_abc123def");
    expect(p.endsWith("/works/work_abc123def")).toBe(true);
    expect(p.includes("..")).toBe(false);
  });

  it("does not treat grant/approval/lease/correlation as path-safe kinds (R5)", () => {
    for (const kind of FORBIDDEN_PATH_ID_KINDS) {
      expect(isForbiddenPathIdKind(kind)).toBe(true);
      expect(Object.values(ID_PREFIX)).not.toContain(`${kind}_`);
    }
  });
});
