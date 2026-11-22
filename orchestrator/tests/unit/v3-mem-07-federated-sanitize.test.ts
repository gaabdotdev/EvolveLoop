/**
 * V3-MEM-07 — Federated Global Memory with Automatic Sanitization (META-WS-006).
 * Adversarial payloads: paths, keys/secrets, private vars, domain names → 0% leak.
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeForFederation,
  detectFederationResiduals,
  promoteToGlobal,
  assertLeakFree,
  FederatedSanitizeError,
  GLOBAL_FEDERATION_SCOPE,
  REDACTION_TOKENS,
  FEDERATED_SANITIZE_SCHEMA_VERSION,
  type FederationSanitizePolicy,
} from "../../src/v3/memory/index.js";

const ALLOW: FederationSanitizePolicy = {
  allow_federation: true,
  source_project_id: "proj-alpha",
  target_scope: "global",
};

/** Assert none of the sensitive fragments survive in sanitized text. */
function expectZeroLeak(sanitized: string, fragments: string[]) {
  for (const frag of fragments) {
    expect(sanitized.includes(frag), `leak fragment still present: ${frag}`).toBe(false);
  }
}

describe("V3-MEM-07 Federated Sanitize", () => {
  it("sanitizeForFederation strips secrets, paths, private vars, and domains", () => {
    const secret = "sk-live-abcdefghijklmnopqrstuvwx";
    const token = "ghp_abcdefghijklmnopqrstuvwx123456";
    const pathUnix = "/home/gaab/orca/workspaces/EvolveLoop/seagrass/secrets.env";
    const pathWin = "C:\\Users\\gaab\\AppData\\Roaming\\creds\\token.json";
    const priv = "PRIVATE_API_KEY=super-secret-value-xyz";
    const domain = "https://internal.acme-corp.example.com/v1/hooks";
    const email = "ops@acme-corp.example.com";

    const raw = [
      `auth Bearer ${secret}`,
      `github ${token}`,
      `workdir ${pathUnix}`,
      `win ${pathWin}`,
      priv,
      `callback ${domain}`,
      `contact ${email}`,
      "lesson: prefer deterministic sanitizers before federation",
    ].join("\n");

    const result = sanitizeForFederation(raw, ALLOW);
    expect(result.schema_version).toBe(FEDERATED_SANITIZE_SCHEMA_VERSION);
    expect(result.removals.length).toBeGreaterThan(0);
    expect(result.leak_free).toBe(true);
    expect(result.residuals).toEqual([]);

    expectZeroLeak(result.text, [
      secret,
      token,
      pathUnix,
      pathWin,
      "super-secret-value-xyz",
      "PRIVATE_API_KEY=super-secret-value-xyz",
      "internal.acme-corp.example.com",
      "acme-corp.example.com",
      email,
    ]);

    expect(result.text).toContain(REDACTION_TOKENS.secret);
    expect(result.text).toContain(REDACTION_TOKENS.path);
    expect(result.text).toContain(REDACTION_TOKENS.private_var);
    expect(result.text).toContain(REDACTION_TOKENS.domain);
    expect(result.text).toContain("prefer deterministic sanitizers before federation");
  });

  it("adversarial PEM + env export + relative path + canary → 0% leak", () => {
    const canary = "FEDERATION_CANARY_DO_NOT_LEAK_9f3a";
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEAfakekeymaterial0000000000000000000000000001",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const exportLine = "export OPENAI_API_KEY=sk-proj-adversarialfixture0001";
    const rel = "./../../.env.production";
    const home = "~/Documents/gitHub/private-vault/id_rsa";

    const raw = `${pem}\n${exportLine}\npath=${rel}\nhome=${home}\ncanary=${canary}`;
    const result = sanitizeForFederation(raw, {
      ...ALLOW,
      extra_canaries: [canary],
    });

    expect(result.leak_free).toBe(true);
    expectZeroLeak(result.text, [
      canary,
      "BEGIN RSA PRIVATE KEY",
      "fakekeymaterial",
      "sk-proj-adversarialfixture0001",
      "OPENAI_API_KEY=sk-proj-adversarialfixture0001",
      rel,
      home,
      "id_rsa",
    ]);
    assertLeakFree(result);
  });

  it("detectFederationResiduals flags unsanitized adversarial remnants", () => {
    const dirty = "see /var/lib/evolveloop/state.db and hook.corp.internal:8443";
    const residuals = detectFederationResiduals(dirty, ALLOW);
    expect(residuals.length).toBeGreaterThan(0);
    expect(residuals.some((r) => r.kind === "path" || r.kind === "domain")).toBe(true);
  });

  it("promoteToGlobal refuses without explicit allow_federation", () => {
    const refused = promoteToGlobal(
      {
        memory_id: "m-1",
        project_id: "proj-alpha",
        title: "safe title",
        body: "safe body about testing patterns",
      },
      { allow_federation: false },
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe("FEDERATION_POLICY_DENIED");
    }
  });

  it("promoteToGlobal sanitizes then accepts leak-free memory into global scope", () => {
    const clock = () => new Date("2026-11-21T23:20:20.000Z");
    const secret = "AKIAIOSFODNN7EXAMPLEXX";
    const domain = "db.prod.corp.internal";
    const path = "/opt/evolveloop/projects/alpha/credentials.json";

    const promoted = promoteToGlobal(
      {
        memory_id: "mem-fed-01",
        project_id: "proj-alpha",
        memory_type: "procedural",
        title: `Runbook for ${domain}`,
        body: [
          "Prefer bubblewrap isolation.",
          `aws_key=${secret}`,
          `config=${path}`,
          "process.env.CURSOR_API_KEY must never leave the project.",
        ].join(" "),
        source: "unit-test",
        payload: {
          note: `mirror https://${domain}/docs`,
          nested: { path },
        },
        created_at: "2026-11-21T20:00:00.000Z",
      },
      ALLOW,
      { clock },
    );

    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;

    expect(promoted.memory.project_id).toBe(GLOBAL_FEDERATION_SCOPE);
    expect(promoted.memory.source_project_id).toBe("proj-alpha");
    expect(promoted.memory.federated_at).toBe("2026-11-21T23:20:20.000Z");
    expect(promoted.memory.sanitize.leak_free).toBe(true);
    expect(promoted.sanitize.leak_free).toBe(true);

    const surface = JSON.stringify(promoted.memory);
    expectZeroLeak(surface, [secret, domain, path, "CURSOR_API_KEY"]);
    expect(promoted.memory.title).not.toContain(domain);
    expect(promoted.memory.body).toContain("Prefer bubblewrap isolation.");
    expect(promoted.memory.payload.federation).toMatchObject({
      schema_version: FEDERATED_SANITIZE_SCHEMA_VERSION,
      source_project_id: "proj-alpha",
    });
  });

  it("promoteToGlobal refuses when residual leak remains after sanitize", () => {
    // Craft a canary that we intentionally do NOT list in extra_canaries,
    // and that does not match secret/path/domain/private patterns — then
    // force residual via extra field that still matches a detector post-pass
    // by disabling one strip flag while leaving detectable material.
    const path = "/home/leak/project/.env";
    const refused = promoteToGlobal(
      {
        memory_id: "mem-fed-refuse",
        project_id: "proj-beta",
        title: "should refuse",
        body: `keep path visible: ${path}`,
      },
      {
        allow_federation: true,
        source_project_id: "proj-beta",
        strip_paths: false, // adversarial misconfig — residual path must block promote
        strip_secrets: true,
        strip_private_vars: true,
        strip_domain_names: true,
      },
    );

    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe("RESIDUAL_LEAK_DETECTED");
      expect(refused.residuals.some((r) => r.kind === "path")).toBe(true);
      expect(refused.sanitize?.leak_free).toBe(false);
    }
  });

  it("promoteToGlobal throwOnRefuse raises FederatedSanitizeError", () => {
    expect(() =>
      promoteToGlobal(
        {
          memory_id: "m-x",
          project_id: "p",
          title: "t",
          body: "b",
        },
        { allow_federation: false },
        { throwOnRefuse: true },
      ),
    ).toThrow(FederatedSanitizeError);
  });

  it("policy defaults are fail-closed strip-all when allow_federation", () => {
    const result = sanitizeForFederation(
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123 /var/tmp/a/b/c host.foo.bar.baz.com",
      { allow_federation: true },
    );
    expect(result.policy.strip_secrets).toBe(true);
    expect(result.policy.strip_paths).toBe(true);
    expect(result.policy.strip_private_vars).toBe(true);
    expect(result.policy.strip_domain_names).toBe(true);
    expect(result.leak_free).toBe(true);
    expectZeroLeak(result.text, [
      "sk-abcdefghijklmnopqrstuvwxyz0123",
      "/var/tmp/a/b/c",
      "host.foo.bar.baz.com",
    ]);
  });

  it("rejects promote when source is already global", () => {
    const refused = promoteToGlobal(
      {
        memory_id: "m-g",
        project_id: GLOBAL_FEDERATION_SCOPE,
        title: "already global",
        body: "no sensitive",
      },
      { allow_federation: true },
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("SOURCE_PROJECT_REQUIRED");
  });
});
