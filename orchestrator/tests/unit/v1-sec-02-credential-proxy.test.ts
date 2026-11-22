/**
 * V1-SEC-02 — Local Credential Proxy + SSRF block (100% on private ranges).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateCredentialProxy,
  assertCredentialProxyAllowed,
  isSsrfBlockedHost,
  CredentialProxyError,
  SSRF_BLOCKED_RANGES,
} from "../../src/v3/security/credential-proxy.js";

const config = {
  authorized_domains: ["api.openai.com", "*.anthropic.com"],
  credentials: {
    "api.openai.com": { value: "Bearer sk-test" },
    "*.anthropic.com": { header: "x-api-key", value: "ant-test" },
  },
};

describe("V1-SEC-02 credential proxy SSRF", () => {
  /** Plano mestre §3.2 — must block 100% (403/block). */
  const gateRequiredBlocked = [
    "127.0.0.1",
    "http://127.0.0.1",
    "localhost:11434",
    "http://localhost:11434",
    "10.0.0.1",
    "http://10.0.0.1",
    "192.168.1.1",
    "http://192.168.1.1",
    "100.64.0.1",
    "http://100.64.0.1",
  ];

  const blockedHosts = [
    ...gateRequiredBlocked,
    "127.1.2.3",
    "localhost",
    "::1",
    "[::1]",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.100",
    "100.127.255.255",
    "169.254.169.254",
    "169.254.1.1",
    "http://127.0.0.1:8080/x",
    "https://10.1.2.3/v1",
    "http://192.168.0.5",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
  ];

  it("documents required SSRF ranges", () => {
    expect(SSRF_BLOCKED_RANGES).toEqual(
      expect.arrayContaining([
        "127.0.0.0/8",
        "::1",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "169.254.0.0/16",
      ]),
    );
  });

  it("blocks 100% of private/link-local/loopback targets", () => {
    for (const target of blockedHosts) {
      const d = evaluateCredentialProxy(target, config);
      expect(d.blocked, target).toBe(true);
      expect(d.injected_headers, target).toEqual({});
      expect(d.reason, target).toMatch(/ssrf_blocked/);
    }
  });

  it("gate targets (127.0.0.1, localhost:11434, 10/192.168/100.64) → 403/block 100%", () => {
    let blocked = 0;
    for (const target of gateRequiredBlocked) {
      const d = evaluateCredentialProxy(target, config);
      expect(d.blocked, target).toBe(true);
      expect(d.allowed, target).toBe(false);
      // Proxy decision maps to HTTP 403 semantics for local credential proxy
      expect(d.reason, target).toMatch(/ssrf_blocked/);
      blocked += 1;
    }
    expect(blocked).toBe(gateRequiredBlocked.length);
    expect(blocked / gateRequiredBlocked.length).toBe(1);
  });

  it("isSsrfBlockedHost covers CIDR samples", () => {
    expect(isSsrfBlockedHost("127.0.0.0")).toBe(true);
    expect(isSsrfBlockedHost("8.8.8.8")).toBe(false);
    expect(isSsrfBlockedHost("172.15.0.1")).toBe(false);
    expect(isSsrfBlockedHost("172.32.0.1")).toBe(false);
    expect(isSsrfBlockedHost("100.63.0.1")).toBe(false);
  });

  it("injects credentials only for authorized domains", () => {
    const ok = evaluateCredentialProxy("https://api.openai.com/v1/chat", config);
    expect(ok.blocked).toBe(false);
    expect(ok.allowed).toBe(true);
    expect(ok.injected_headers.Authorization).toBe("Bearer sk-test");

    const sub = evaluateCredentialProxy("https://api.anthropic.com/v1", config);
    expect(sub.blocked).toBe(false);
    expect(sub.injected_headers["x-api-key"]).toBe("ant-test");

    const denied = evaluateCredentialProxy("https://evil.example/steal", config);
    expect(denied.blocked).toBe(true);
    expect(denied.injected_headers).toEqual({});
  });

  it("assert throws on SSRF", () => {
    expect(() => assertCredentialProxyAllowed("http://127.0.0.1", config)).toThrow(
      CredentialProxyError,
    );
  });
});
