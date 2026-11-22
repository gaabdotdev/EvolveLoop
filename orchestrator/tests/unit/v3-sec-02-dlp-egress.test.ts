/**
 * V3-SEC-02 — DLP de saída no Credential Proxy (inspectEgress + authorize wiring).
 * Synthetic exfiltration payloads only — no live network.
 */
import { describe, it, expect } from "vitest";
import {
  inspectEgress,
  isEgressAllowed,
  DLP_EGRESS_SCHEMA_VERSION,
  DLP_SECRET_PATTERNS,
  DLP_PROPRIETARY_MARKERS,
  CredentialProxy,
  type DomainPolicy,
  type AdapterSandboxProfile,
} from "../../src/v3/security/index.js";

const implementPolicy: DomainPolicy = {
  kind: "DomainPolicy",
  task_type: "implement",
  allow: ["api.openai.com", "*.anthropic.com"],
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
    fs_roots: ["/tmp/ws"],
    env_allowlist: ["PATH"],
  },
};

function makeProxy(): CredentialProxy {
  return new CredentialProxy({
    credentials: {
      authorized_domains: ["api.openai.com", "*.anthropic.com"],
      credentials: {
        "api.openai.com": { value: "Bearer sk-proxy-injected-not-in-body" },
      },
    },
    domain_policies: [implementPolicy],
    adapter_profiles: [cursorProfile],
  });
}

/** Synthetic exfil fixtures — intentionally fake material for unit gates. */
const SYNTHETIC = {
  openai_sk: "sk-live-abcdefghijklmnopqrstuvwxyz012345",
  github_pat: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  aws_akia: "AKIAIOSFODNN7EXAMPLEXX",
  google_ai: "AIzaSyA-abcdefghijklmnopqrstuvwxyz0123",
  slack: "xoxb-1234567890-abcdefghij",
  bearer: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb",
  pem: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKFAKESECRET_SYNTHETIC_ONLY_FOR_UNIT_TEST_NOT_REAL
-----END RSA PRIVATE KEY-----`,
  env_assign: 'OPENAI_API_KEY=sk-test-abcdefghijklmnopqrstuvwxyz',
  proprietary_src: `// @proprietary
/* COMPANY CONFIDENTIAL — DO NOT DISTRIBUTE */
export function tradeSecretAlgo() { return 42; }
`,
  spdx: "// SPDX-License-Identifier: Proprietary\nexport const x = 1;\n",
  copyright: "Copyright (c) 2026 Acme Corp. All Rights Reserved.\n",
  clean_json: JSON.stringify({ prompt: "summarize this public README", model: "gpt-4o-mini" }),
};

describe("V3-SEC-02 inspectEgress — allow clean payloads", () => {
  it("allows empty / missing body and headers", () => {
    const d = inspectEgress({});
    expect(d.verdict).toBe("ALLOW");
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.reasons).toEqual([]);
    expect(d.schema_version).toBe(DLP_EGRESS_SCHEMA_VERSION);
    expect(isEgressAllowed(d)).toBe(true);
  });

  it("allows benign JSON body without secrets or proprietary markers", () => {
    const d = inspectEgress({
      body: SYNTHETIC.clean_json,
      headers: { "content-type": "application/json", "user-agent": "evolve-agent/3" },
    });
    expect(d.verdict).toBe("ALLOW");
    expect(d.findings).toEqual([]);
  });

  it("documents built-in pattern catalogs", () => {
    expect(DLP_SECRET_PATTERNS.length).toBeGreaterThanOrEqual(8);
    expect(DLP_PROPRIETARY_MARKERS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("V3-SEC-02 inspectEgress — block secret exfil (body)", () => {
  const secretCases: Array<{ name: string; body: string; reasonPart: string }> = [
    { name: "openai sk-live", body: `leak:${SYNTHETIC.openai_sk}`, reasonPart: "secret:" },
    { name: "github pat", body: SYNTHETIC.github_pat, reasonPart: "secret:github_pat" },
    { name: "aws AKIA", body: `creds=${SYNTHETIC.aws_akia}`, reasonPart: "secret:aws_access_key" },
    { name: "google AIza", body: SYNTHETIC.google_ai, reasonPart: "secret:google_api_key" },
    { name: "slack xoxb", body: SYNTHETIC.slack, reasonPart: "secret:slack_token" },
    { name: "Bearer JWT", body: SYNTHETIC.bearer, reasonPart: "secret:bearer_token" },
    { name: "PEM private key", body: SYNTHETIC.pem, reasonPart: "secret:pem_private_key" },
    { name: "ENV assignment", body: SYNTHETIC.env_assign, reasonPart: "secret:" },
  ];

  for (const c of secretCases) {
    it(`BLOCKs body exfil: ${c.name}`, () => {
      const d = inspectEgress({ body: c.body });
      expect(d.verdict, c.name).toBe("BLOCK");
      expect(d.blocked, c.name).toBe(true);
      expect(d.reasons.some((r) => r.includes(c.reasonPart) || r.startsWith("secret:")), c.name).toBe(
        true,
      );
      expect(d.findings.some((f) => f.kind === "secret"), c.name).toBe(true);
      // Preview must be truncated / present but decision must not require logging full secret.
      expect(d.findings[0]!.matched_preview.length).toBeGreaterThan(0);
      expect(d.findings[0]!.matched_preview.length).toBeLessThanOrEqual(48);
    });
  }
});

describe("V3-SEC-02 inspectEgress — block proprietary markers", () => {
  it("BLOCKs @proprietary + CONFIDENTIAL source dump", () => {
    const d = inspectEgress({ body: SYNTHETIC.proprietary_src });
    expect(d.verdict).toBe("BLOCK");
    expect(d.findings.some((f) => f.kind === "proprietary_marker")).toBe(true);
    expect(d.reasons.some((r) => r.startsWith("proprietary_marker:"))).toBe(true);
  });

  it("BLOCKs SPDX Proprietary", () => {
    const d = inspectEgress({ body: SYNTHETIC.spdx });
    expect(d.verdict).toBe("BLOCK");
    expect(d.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("spdx_proprietary")]),
    );
  });

  it("BLOCKs Copyright All Rights Reserved banner", () => {
    const d = inspectEgress({ body: SYNTHETIC.copyright });
    expect(d.verdict).toBe("BLOCK");
    expect(d.reasons.some((r) => r.includes("copyright_all_rights"))).toBe(true);
  });

  it("supports extra proprietary markers via options", () => {
    const d = inspectEgress(
      { body: "export const SECRET_SAUCE_V42 = true;" },
      { extra_proprietary_markers: [/SECRET_SAUCE_V42/] },
    );
    expect(d.verdict).toBe("BLOCK");
    expect(d.reasons.some((r) => r.includes("extra_proprietary"))).toBe(true);
  });
});

describe("V3-SEC-02 inspectEgress — header exfil", () => {
  it("BLOCKs secret in custom header", () => {
    const d = inspectEgress({
      body: SYNTHETIC.clean_json,
      headers: { "x-debug-dump": SYNTHETIC.openai_sk },
    });
    expect(d.verdict).toBe("BLOCK");
    expect(d.findings.some((f) => f.location === "header" && f.header_name === "x-debug-dump")).toBe(
      true,
    );
  });

  it("BLOCKs proprietary marker in header", () => {
    const d = inspectEgress({
      headers: { "x-code-snippet": "INTERNAL ONLY snippet" },
    });
    expect(d.verdict).toBe("BLOCK");
    expect(d.findings[0]!.kind).toBe("proprietary_marker");
    expect(d.findings[0]!.location).toBe("header");
  });
});

describe("V3-SEC-02 CredentialProxy.authorize + DLP wiring", () => {
  it("allows authorized host with clean body and injects credentials", () => {
    const proxy = makeProxy();
    const r = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      target_url: "https://api.openai.com/v1/chat/completions",
      body: SYNTHETIC.clean_json,
      headers: { "content-type": "application/json" },
    });
    expect(r.blocked).toBe(false);
    expect(r.allowed).toBe(true);
    expect(r.injected_headers.Authorization).toBeDefined();
    expect(r.dlp?.verdict).toBe("ALLOW");
  });

  it("BLOCKs authorize when body exfiltrates secrets (no inject)", () => {
    const proxy = makeProxy();
    const r = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      target_url: "https://api.openai.com/v1/chat/completions",
      body: JSON.stringify({
        messages: [{ role: "user", content: `here is my key ${SYNTHETIC.openai_sk}` }],
      }),
    });
    expect(r.blocked).toBe(true);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/^dlp_egress_blocked:/);
    expect(r.injected_headers).toEqual({});
    expect(r.dlp?.verdict).toBe("BLOCK");
    expect(r.dlp?.reasons.some((x) => x.startsWith("secret:"))).toBe(true);
  });

  it("BLOCKs authorize when proprietary code is in body", () => {
    const proxy = makeProxy();
    const r = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      host: "api.openai.com",
      body: SYNTHETIC.proprietary_src,
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/dlp_egress_blocked:.*proprietary_marker/);
    expect(r.injected_headers).toEqual({});
  });

  it("proxy.inspectEgress mirrors standalone inspectEgress", () => {
    const proxy = makeProxy();
    const a = proxy.inspectEgress({ body: SYNTHETIC.github_pat });
    const b = inspectEgress({ body: SYNTHETIC.github_pat });
    expect(a.verdict).toBe(b.verdict);
    expect(a.blocked).toBe(true);
  });

  it("without body/headers, authorize skips DLP (V2 behavior preserved)", () => {
    const proxy = makeProxy();
    const r = proxy.authorize({
      task_type: "implement",
      adapter_id: "cursor",
      target_url: "https://api.openai.com/v1/models",
    });
    expect(r.allowed).toBe(true);
    expect(r.dlp).toBeUndefined();
  });

  it("assertAuthorized throws on DLP block", () => {
    const proxy = makeProxy();
    expect(() =>
      proxy.assertAuthorized({
        task_type: "implement",
        adapter_id: "cursor",
        host: "api.openai.com",
        body: SYNTHETIC.pem,
      }),
    ).toThrow(/dlp_egress_blocked/);
  });
});
