import { describe, it, expect } from "vitest";
import { generateDevTlsMaterials } from "../../../src/v3/fabric/protocol/tls-util.js";

describe("V3.7 TLS materials", () => {
  it("generates via openssl", () => {
    const m = generateDevTlsMaterials("test-cp");
    expect(m.cert.toString("utf8")).toContain("BEGIN CERTIFICATE");
    expect(m.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
