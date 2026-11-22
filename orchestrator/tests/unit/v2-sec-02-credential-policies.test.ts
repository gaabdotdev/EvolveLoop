/**
 * V2-SEC-02 — Credential Proxy políticas granulares (DomainPolicy + AdapterSandboxProfile).
 */
import { describe, it, expect } from "vitest";
import {
  CredentialProxy,
  CredentialProxyError,
  evaluateDomainPolicy,
  evaluateAdapterNetPolicy,
  defaultAdapterSandboxProfiles,
  evaluateCredentialProxy,
  type DomainPolicy,
  type AdapterSandboxProfile,
} from "../../src/v3/security/index.js";

const implementPolicy: DomainPolicy = {
  kind: "DomainPolicy",
  task_type: "implement",
  allow: ["api.openai.com", "*.anthropic.com"],
  deny: ["evil.example", "*.evil.example"],
};

const docsPolicy: DomainPolicy = {
  kind: "DomainPolicy",
  task_type: "docs",
  allow: ["docs.github.com"],
  deny: [],
};

const cursorProfile: AdapterSandboxProfile = {
  kind: "AdapterSandboxProfile",
  adapter_id: "cursor",
  capabilities: {
    net: {
      mode: "allowlist",
      allowlist: ["api.openai.com", "*.anthropic.com", "*.cursor.sh"],
    },
    fs_roots: ["/tmp/ws", "/tmp"],
    env_allowlist: ["PATH", "LANG", "CURSOR_API_KEY"],
  },
};

const offlineProfile: AdapterSandboxProfile = {
  kind: "AdapterSandboxProfile",
  adapter_id: "offline-agent",
  capabilities: {
    net: { mode: "deny", allowlist: [] },
    fs_roots: ["/tmp/ws"],
    env_allowlist: ["PATH"],
  },
};

function makeProxy(extra?: {
  policies?: DomainPolicy[];
  profiles?: AdapterSandboxProfile[];
}): CredentialProxy {
  return new CredentialProxy({
    credentials: {
      authorized_domains: ["api.openai.com", "*.anthropic.com", "docs.github.com"],
      credentials: {
        "api.openai.com": { value: "Bearer sk-test" },
        "*.anthropic.com": { header: "x-api-key", value: "ant-test" },
      },
    },
    domain_policies: extra?.policies ?? [implementPolicy, docsPolicy],
    adapter_profiles: extra?.profiles ?? [cursorProfile, offlineProfile],
  });
}

describe("V2-SEC-02 DomainPolicy", () => {
  it("allows host on task allowlist", () => {
    const r = evaluateDomainPolicy("api.openai.com", implementPolicy);
    expect(r.allowed).toBe(true);
  });

  it("denies host outside allowlist (default deny)", () => {
    const r = evaluateDomainPolicy("evil.example", implementPolicy);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/denied|not_in_task_allowlist/);
  });

  it("deny list wins over allow", () => {
    const policy: DomainPolicy = {
      kind: "DomainPolicy",
      task_type: "implement",
      allow: ["*.example"],
      deny: ["evil.example"],
    };
    expect(evaluateDomainPolicy("evil.example", policy).allowed).toBe(false);
    expect(evaluateDomainPolicy("good.example", policy).allowed).toBe(true);
  });

  it("missing policy → deny", () => {
    expect(evaluateDomainPolicy("api.openai.com", undefined).allowed).toBe(false);
  });

  it("empty allow → deny all", () => {
    const empty: DomainPolicy = {
      kind: "DomainPolicy",
      task_type: "review",
      allow: [],
      deny: [],
    };
    expect(evaluateDomainPolicy("api.openai.com", empty).allowed).toBe(false);
  });
});

describe("V2-SEC-02 AdapterSandboxProfile", () => {
  it("maps adapter_id → net / fs_roots / env_allowlist", () => {
    const proxy = makeProxy();
    const p = proxy.getAdapterProfile("cursor");
    expect(p?.adapter_id).toBe("cursor");
    expect(p?.capabilities.net.mode).toBe("allowlist");
    expect(p?.capabilities.fs_roots).toEqual(["/tmp/ws", "/tmp"]);
    expect(p?.capabilities.env_allowlist).toContain("CURSOR_API_KEY");
  });

  it("defaultAdapterSandboxProfiles covers cursor + antigravity", () => {
    const defaults = defaultAdapterSandboxProfiles("/tmp/ws");
    const ids = defaults.map((d) => d.adapter_id);
    expect(ids).toEqual(expect.arrayContaining(["cursor", "antigravity"]));
    for (const d of defaults) {
      expect(d.capabilities.fs_roots.length).toBeGreaterThan(0);
      expect(d.capabilities.env_allowlist).toContain("PATH");
      expect(d.capabilities.net.mode).toBe("allowlist");
    }
  });

  it("net deny mode blocks all hosts", () => {
    const r = evaluateAdapterNetPolicy("api.openai.com", offlineProfile);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/adapter_net_denied/);
  });

  it("missing adapter profile → deny", () => {
    expect(evaluateAdapterNetPolicy("api.openai.com", undefined).allowed).toBe(false);
  });
});

describe("V2-SEC-02 CredentialProxy.authorize", () => {
  it("allows when task_type + adapter_id policies permit and injects credentials", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      target_url: "https://api.openai.com/v1/chat",
    });
    expect(d.blocked).toBe(false);
    expect(d.allowed).toBe(true);
    expect(d.host).toBe("api.openai.com");
    expect(d.injected_headers.Authorization).toBe("Bearer sk-test");
    expect(d.domain_policy_id).toBe("implement");
    expect(d.adapter_profile_id).toBe("cursor");
  });

  it("accepts bare host instead of target_url", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      host: "api.anthropic.com",
    });
    expect(d.allowed).toBe(true);
    expect(d.injected_headers["x-api-key"]).toBe("ant-test");
  });

  it("default deny when host outside task allowlist", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      target_url: "https://steal.example/x",
    });
    expect(d.blocked).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.injected_headers).toEqual({});
    expect(d.reason).toMatch(/not_in_task_allowlist/);
  });

  it("denies when task_type has no DomainPolicy", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "unknown-task",
      adapter_id: "cursor",
      host: "api.openai.com",
    });
    expect(d.blocked).toBe(true);
    expect(d.reason).toMatch(/no_domain_policy/);
  });

  it("denies when adapter has no sandbox profile", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "implement",
      adapter_id: "missing-adapter",
      host: "api.openai.com",
    });
    expect(d.blocked).toBe(true);
    expect(d.reason).toMatch(/no_adapter_sandbox_profile/);
  });

  it("denies when adapter net mode is deny", () => {
    const proxy = makeProxy();
    const d = proxy.authorize({
      task_type: "implement",
      adapter_id: "offline-agent",
      host: "api.openai.com",
    });
    expect(d.blocked).toBe(true);
    expect(d.reason).toMatch(/adapter_net_denied/);
  });

  it("denies when host allowed by task but not by adapter allowlist", () => {
    const proxy = makeProxy({
      policies: [docsPolicy],
      profiles: [cursorProfile],
    });
    const d = proxy.authorize({
      task_type: "docs",
      adapter_id: "cursor",
      host: "docs.github.com",
    });
    expect(d.blocked).toBe(true);
    expect(d.reason).toMatch(/adapter_host_not_in_allowlist/);
  });

  it("still blocks SSRF private ranges before policy checks", () => {
    const proxy = makeProxy();
    for (const target of ["127.0.0.1", "http://10.0.0.1", "169.254.169.254", "localhost"]) {
      const d = proxy.authorize({
        task_type: "implement",
        adapter_id: "cursor",
        target_url: target.includes("://") ? target : `http://${target}`,
      });
      expect(d.blocked, target).toBe(true);
      expect(d.reason, target).toMatch(/ssrf_blocked/);
      expect(d.injected_headers, target).toEqual({});
    }
  });

  it("assertAuthorized throws on deny", () => {
    const proxy = makeProxy();
    expect(() =>
      proxy.assertAuthorized({
        task_type: "implement",
        adapter_id: "cursor",
        host: "evil.example",
      }),
    ).toThrow(CredentialProxyError);
  });

  it("task_type isolation: docs policy does not inherit implement allowlist", () => {
    const proxy = makeProxy();
    const denied = proxy.authorize({
      task_type: "docs",
      adapter_id: "cursor",
      host: "api.openai.com",
    });
    expect(denied.blocked).toBe(true);
  });
});

describe("V2-SEC-02 no regression V1-SEC-02 evaluateCredentialProxy", () => {
  it("V1 path still blocks SSRF and unauthorized domains", () => {
    const config = {
      authorized_domains: ["api.openai.com"],
      credentials: { "api.openai.com": { value: "Bearer x" } },
    };
    expect(evaluateCredentialProxy("http://127.0.0.1", config).blocked).toBe(true);
    expect(evaluateCredentialProxy("https://evil.example", config).blocked).toBe(true);
    expect(evaluateCredentialProxy("https://api.openai.com", config).allowed).toBe(true);
  });
});
