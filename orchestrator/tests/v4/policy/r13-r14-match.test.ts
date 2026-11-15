import { describe, expect, it } from "vitest";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { HandleSigningAdapter } from "../../../src/v4/adapters/v37/identity.js";
import { allowRuleHasWildcard, canonicalizeResource, resourceMatches } from "../../../src/v4/policy/match.js";
import { PolicyLoadError, PolicyStore } from "../../../src/v4/policy/store.js";
import { allowRule, basePolicy } from "./fixtures.js";

describe("M10 R13 — tighten ALLOW wildcards", () => {
  it("flags ALLOW * subjects even with a specific action (beyond INV-POL-04)", () => {
    expect(
      allowRuleHasWildcard(
        allowRule({
          subjects: ["*"],
          actions: ["filesystem.read"],
          resources: ["/workspace/src/app.ts"],
        }),
      ),
    ).toBe(true);
  });

  it("rejects loading an ACTIVE policy with ALLOW wildcards", () => {
    const store = new PolicyStore();
    expect(() =>
      store.put(
        basePolicy({
          rules: [allowRule({ subjects: ["*"], actions: ["filesystem.read"], resources: ["/workspace/a.ts"] })],
        }),
      ),
    ).toThrow(PolicyLoadError);
    try {
      store.put(
        basePolicy({
          rules: [allowRule({ actions: ["*"], resources: ["/workspace/a.ts"] })],
        }),
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyLoadError);
      expect((e as PolicyLoadError).code).toBe("INV-POL-04-TIGHT");
    }
  });

  it("allows DENY * (fail-closed) on ACTIVE policies", () => {
    const store = new PolicyStore();
    const p = store.put(
      basePolicy({
        rules: [
          {
            rule_id: "deny_star",
            effect: "DENY",
            subjects: ["*"],
            actions: ["*"],
            resources: ["*"],
          },
        ],
      }),
    );
    expect(p.rules).toHaveLength(1);
  });
});

describe("M10 F14 — conservative resource matching", () => {
  it("rejects path traversal and percent-encoding", () => {
    expect(canonicalizeResource("/workspace/../etc/passwd")).toBeUndefined();
    expect(canonicalizeResource("/workspace/%2e%2e/etc")).toBeUndefined();
    expect(canonicalizeResource("/workspace\\etc")).toBeUndefined();
    expect(resourceMatches("/workspace/*", "/workspace/../etc/passwd")).toBe(false);
  });

  it("matches a trailing prefix glob and exact paths only", () => {
    expect(resourceMatches("/workspace/src/*", "/workspace/src/app.ts")).toBe(true);
    expect(resourceMatches("/workspace/src/app.ts", "/workspace/src/app.ts")).toBe(true);
    expect(resourceMatches("/workspace/src/*", "/tmp/app.ts")).toBe(false);
  });
});

describe("M10 R14 — signature handles, not PEM", () => {
  it("signs via handle and never serializes PEM", () => {
    const km = generateNodeIdentity();
    const adapter = new HandleSigningAdapter();
    const handle = adapter.register({ private_key_pem: km.private_key_pem, public_key_spki_b64: km.public_key_spki_b64 });
    const sig = adapter.sign(handle, "payload-v4");
    expect(adapter.verify(km.public_key_spki_b64, "payload-v4", sig)).toBe(true);
    expect(handle).not.toHaveProperty("private_key_pem");
    expect(JSON.stringify(handle)).not.toMatch(/BEGIN/);
    expect(adapter.inspectForSecrets()).toEqual([]);
    expect(typeof (adapter as unknown as { sign: (a: unknown, b: string) => string }).sign).toBe("function");
  });

  it("does not implement V37SignaturePort.sign(private_key_pem)", () => {
    const adapter = new HandleSigningAdapter();
    expect("private_key_pem" in adapter).toBe(false);
    expect(adapter).not.toHaveProperty("signPem");
  });
});
