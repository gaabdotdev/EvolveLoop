/**
 * Adversarial campaign — policy bypass / authority escalation / sandbox theater /
 * secret leak / memory poisoning (evolveloop-v3-h0).
 *
 * Mental exploitation only against in-repo surfaces. Documents OPEN findings;
 * asserts fixed CRITICAL/HIGH locals (SEC-009 quarantine stamp, SEC-010 path/id).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  authorize,
  pathEscapesWorkspace,
  CapabilityAuthority,
  createDeterministicProvider,
  createMockProvider,
  FilesystemMemoryStore,
  assertFeatureIdConfined,
  selectGovernorAction,
  decideAutonomy,
  coerceSafetyState,
  evaluateAcquisitionGate,
  validateInstructionHierarchyBinding,
  annotateMemoryEntry,
  runAgencyRuntime,
  ExecutionEngine,
  ProviderRouter,
  GoalStore,
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  hasSandboxAttestation,
  requiresSandboxAttestation,
  hasDestructiveEffectHint,
  isDestructiveDeniedWithoutOsSandbox,
  allowsDestructiveWithoutOsSandbox,
  ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV,
  DESTRUCTIVE_DENIED_REASON,
  type SuccessOracleCriterion,
  type ExecuteRequest,
  type GraphNode,
} from "../../../../src/index.js";
import { loginDashboardIR, testRegistry } from "../../../fixtures/login-dashboard.js";

function makeDetRequest(capability: string, inputs: Record<string, unknown> = {}): ExecuteRequest {
  const node: GraphNode = {
    id: "n1",
    capability,
    type: "worker",
    status: "running",
    dependencies: [],
    definition_of_done: [{ id: "d1", check: "ok", verification: "automated" }],
    constraints: inputs,
    metadata: {},
    retry_count: 0,
  };
  return {
    run_id: "run-adv",
    node_id: "n1",
    capability,
    inputs: [],
    definition_of_done: node.definition_of_done,
    policy: { retries_remaining: 0 },
    memory_scope: "test",
    knowledge_hits: [],
    briefing: "adv",
    node,
  };
}

const criteriaById = new Map<string, SuccessOracleCriterion>([
  [
    "c-presence",
    {
      apiVersion: V3_API_VERSION,
      kind: "SuccessOracleCriterion",
      metadata: { schema_version: V3_SCHEMA_VERSION },
      spec: {
        criterion_id: "c-presence",
        type: "functional",
        required: true,
        measurement: "stub",
        threshold: "ok",
        evidence_source: "test",
        verification_method: "presence_of_evidence",
        status: "pending",
      },
    },
  ],
]);

function setupEngine() {
  const router = new ProviderRouter();
  const ids = new Set<string>();
  for (const cap of Object.values(testRegistry.capabilities)) {
    for (const p of cap.providers) ids.add(p.id);
  }
  for (const id of ids) router.register(createMockProvider(id));
  return new ExecutionEngine({ registry: testRegistry, providers: router });
}

function worldStub() {
  return {
    snapshot_id: "adv-w1",
    observed_at: "2026-09-24T00:00:00.000Z",
  };
}

function policySnapshot() {
  return {
    snapshot_id: "adv-pol",
    policy_ref: "rapid-prototype",
    captured_at: "2026-09-24T00:00:00.000Z",
  };
}

describe("ADV: DeterministicProvider / MockProvider authority", () => {
  it("shell.execute without Authority flags → CONFIRMATION_REQUIRED (not allow)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adv-det-"));
    const provider = createDeterministicProvider("shell", dir);

    const result = await provider.execute(
      makeDetRequest("shell.execute", { command: "echo pwn" }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toMatch(/CONFIRMATION_REQUIRED|AUTHORITY_DENIED/);
  });

  it("DOCUMENT: MockProvider executes without CapabilityAuthority (test bypass surface)", async () => {
    const mock = createMockProvider("documentation");
    const result = await mock.execute(
      makeDetRequest("shell.execute", { command: "echo bypass" }),
    );

    // OPEN: MockProvider has no authorize() gate — success without Authority.
    expect(result.success).toBe(true);
  });

  it("CapabilityAuthority denies path escape before shell allow", () => {
    const authority = new CapabilityAuthority();
    const r = authority.authorize({
      capability: "shell.execute",
      permissions: { shell: true },
      targetPath: "../etc/passwd",
      context: { workspaceRoot: "/tmp/ws", allowShell: true },
    });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("path_escape_denied");
  });
});

describe("ADV: AcquisitionGate self-attested REGISTER", () => {
  it("malicious capability with self-attested validation_status=passed → REGISTER (OPEN theater)", () => {
    const result = evaluateAcquisitionGate({
      capability_id: "evil.remote-install",
      capability_version: "9.9.9",
      effect_classes: ["DESTRUCTIVE"],
      sandbox_depth: "S3",
      validation_status: "passed", // attacker self-attests
      reason: "totally-legit",
    });
    // Stub gate trusts caller-declared depth + validation — no download, but REGISTER path opens.
    expect(result.action).toBe("register");
    expect(result.lifecycle.spec.state).toBe("VALIDATED");
  });

  it("failed validation stays QUARANTINED", () => {
    const result = evaluateAcquisitionGate({
      capability_id: "evil.remote-install",
      capability_version: "9.9.9",
      effect_classes: ["DESTRUCTIVE"],
      sandbox_depth: "S3",
      validation_status: "failed",
    });
    expect(result.action).toBe("quarantine");
    expect(result.lifecycle.spec.state).toBe("QUARANTINED");
  });
});

describe("ADV: SEC-009 QUARANTINED safety_state stamp bypass", () => {
  it("exact QUARANTINED denies even low risk", () => {
    expect(selectGovernorAction("low", "QUARANTINED")).toBe("deny");
  });

  it("casing / whitespace / unknown stamps fail-closed to deny (regression)", () => {
    // Whitespace-/newline-padded valid enum → coerce to enum; QUARANTINED still deny
    expect(coerceSafetyState("QUARANTINED ")).toBe("QUARANTINED");
    expect(coerceSafetyState("QUARANTINED\n")).toBe("QUARANTINED");
    expect(selectGovernorAction("low", "QUARANTINED ")).toBe("deny");
    expect(selectGovernorAction("low", " QUARANTINED")).toBe("deny");
    expect(selectGovernorAction("low", "QUARANTINED\n")).toBe("deny");

    const invalid = [
      "quarantined",
      "Quarantined",
      "QUARANTINE",
      "NORMAL\0",
      "",
      "HACKED",
    ];
    for (const s of invalid) {
      expect(selectGovernorAction("low", s), `stamp=${JSON.stringify(s)}`).toBe("deny");
      expect(coerceSafetyState(s), `coerce=${JSON.stringify(s)}`).toBeNull();
    }
  });

  it("decideAutonomy coerces invalid stamp → QUARANTINED decision record + deny", () => {
    const denied = decideAutonomy({
      proposal: {
        proposal_id: "prop-q",
        goal_id: "g",
        intent: "pursue:x",
        risk: "low",
        governor_required: false,
        capability_hint: "documentation",
      },
      // @ts-expect-error adversarial malformed stamp
      safety_state: "quarantined",
    });
    expect(denied.action).toBe("deny");
    expect(denied.decision.spec.inputs.safety_state).toBe("QUARANTINED");
    expect(denied.level).toBe("BLOCK");
  });

  it("runtime entry with malformed safety_state blocks allow path", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-doc",
      desired_outcome: "Generate report",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-doc", { reason: "a" });
    store.activate("goal-doc", { reason: "a" });

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf"),
      world: worldStub(),
      policy: policySnapshot(),
      // @ts-expect-error adversarial
      safety_state: "quarantined",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
    });

    expect(report.decisions[0]!.action).toBe("deny");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.safety_state_after).toBe("QUARANTINED");
  });
});

describe("ADV: InstructionHierarchy external_data escalation", () => {
  it("external_data claiming may_override system_policy is rejected by schema", () => {
    const result = validateInstructionHierarchyBinding({
      apiVersion: V3_API_VERSION,
      kind: "InstructionHierarchyBinding",
      metadata: { schema_version: V3_SCHEMA_VERSION },
      spec: {
        level: "external_data",
        content_ref: "web/attacker",
        sealed_root: false,
        authority_issued: false,
        may_override_levels: ["system_policy", "authority_policy"],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some(
        (e) => /override|external_data|may_override/i.test(e),
      ),
    ).toBe(true);
  });

  it("DOCUMENT OPEN: hierarchy validators are schema-only — not wired into runtime IR assembly", () => {
    // Presence of validateInstructionHierarchyBinding does not prove runtime enforcement.
    expect(typeof validateInstructionHierarchyBinding).toBe("function");
  });
});

describe("ADV: Memory secret append / poisoning (SEC-006 FIXED)", () => {
  it("FilesystemMemoryStore redacts secret-like content — secret not on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "adv-mem-sec-"));
    const mem = new FilesystemMemoryStore(dir);
    const secret =
      "AKIAIOSFODNN7EXAMPLE password=hunter2 Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig api_key=supersecret sk-abc1234567890xyz";

    mem.initFeature("feat-secrets", { ir_id: "feat-secrets", policy: "rapid-prototype" });
    mem.append("feat-secrets", {
      timestamp: "2026-09-24T00:00:00Z",
      source: "user",
      type: "preference",
      content: secret,
    });

    const prefsPath = join(dir, "feat-secrets", "preferences.yaml");
    const diskRaw = readFileSync(prefsPath, "utf-8");
    expect(diskRaw).not.toContain("hunter2");
    expect(diskRaw).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(diskRaw).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(diskRaw).not.toContain("supersecret");
    expect(diskRaw).not.toContain("sk-abc1234567890xyz");
    expect(diskRaw).toMatch(/\[REDACTED\]/i);

    const prefs = parseYaml(diskRaw) as { entries: Array<{ content: string }> };
    expect(prefs.entries[0]!.content).not.toBe(secret);
    expect(prefs.entries[0]!.content).toMatch(/\[REDACTED\]/i);

    const annotated = annotateMemoryEntry(
      {
        timestamp: "2026-09-24T00:00:00Z",
        source: "user",
        type: "preference",
        content: secret,
      },
      "untrusted_external",
    );
    expect(annotated.content).not.toContain("hunter2");
    expect(annotated.content).toMatch(/\[REDACTED\]/i);
  });
});

describe("ADV: SEC-010 featureId / path unicode & encoded traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "adv-fid-"));

  it("classic ../ rejected", () => {
    expect(() => assertFeatureIdConfined(root, "../evil")).toThrow(/escape|featureId/i);
  });

  it("encoded / unicode / null variants rejected by allowlist (regression)", () => {
    const attacks = [
      "..%2fevil",
      "%2e%2e%2fevil",
      "feat\u2215x", // division slash
      "feat\uFF0Fx", // fullwidth solidus
      "．．", // fullwidth dots
      "․․",
      "a\u0000b",
      "foo/bar",
      "foo\\bar",
      "a..b",
      "",
      " ",
      "-leading-dash-ok-wait", // leading non-alnum
    ];
    for (const id of attacks) {
      expect(() => assertFeatureIdConfined(root, id), `id=${JSON.stringify(id)}`).toThrow();
    }
    expect(existsSync(join(root, "..", "evil"))).toBe(false);
  });

  it("pathEscapesWorkspace catches percent-encoded and backslash traversal", () => {
    const ws = "/tmp/adv-ws-escape";
    expect(pathEscapesWorkspace("../etc/passwd", ws)).toBe(true);
    expect(pathEscapesWorkspace("..%2fetc%2fpasswd", ws)).toBe(true);
    expect(pathEscapesWorkspace("%2e%2e/%2e%2e/etc/passwd", ws)).toBe(true);
    expect(pathEscapesWorkspace("..\\etc\\passwd", ws)).toBe(true);
    expect(pathEscapesWorkspace("ok/file.txt", ws)).toBe(false);
    expect(pathEscapesWorkspace("x\0../etc/passwd", ws)).toBe(true);
  });

  it("authorize denies encoded path escape even with allowWrite", () => {
    const r = authorize({
      capability: "filesystem.write",
      permissions: { filesystem: "write" },
      targetPath: "..%2fetc%2fpasswd",
      context: { workspaceRoot: "/tmp/ws", allowWrite: true },
    });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("path_escape_denied");
  });
});

describe("ADV: risk_by_goal override (host-controlled downgrade)", () => {
  it("risk_by_goal can force low on high-policy goal → governor allow (OPEN host trust)", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-wipe",
      desired_outcome: "Soft refactor docs",
      risk_policy: "high",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-wipe", { reason: "a" });
    store.activate("goal-wipe", { reason: "a" });

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf"),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      risk_by_goal: { "goal-wipe": "low" },
    });

    expect(report.proposals[0]!.risk).toBe("low");
    expect(report.decisions[0]!.action).toBe("allow");
    // Without destructive tokens + low risk → no attestation gate
    expect(requiresSandboxAttestation(report.proposals[0]!)).toBe(false);
  });

  it("destructive intent still requires attestation even if risk_by_goal=low", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-dest",
      desired_outcome: "DESTRUCTIVE wipe irreversible prod",
      risk_policy: "high",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-dest", { reason: "a" });
    store.activate("goal-dest", { reason: "a" });

    const prev = process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
    delete process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
    try {
      const report = await runAgencyRuntime({
        portfolio: store.portfolio("pf"),
        world: worldStub(),
        policy: policySnapshot(),
        safety_state: "NORMAL",
        engine: setupEngine(),
        registry: testRegistry,
        criteriaById,
        risk_by_goal: { "goal-dest": "low" },
        // no sandbox_attestation
      });

      expect(report.proposals[0]!.risk).toBe("low");
      expect(requiresSandboxAttestation(report.proposals[0]!)).toBe(true);
      expect(report.runs[0]!.status).toBe("BLOCKED");
      // SEC-001: DESTRUCTIVE deny fires before attestation (default DENY)
      expect(report.runs[0]!.reason).toBe(DESTRUCTIVE_DENIED_REASON);
      expect(report.runs[0]!.executed).toBe(false);
    } finally {
      if (prev === undefined) delete process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
      else process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV] = prev;
    }
  });
});

describe("ADV: sandbox_attestation theater + SEC-001 DESTRUCTIVE DENY", () => {
  it("sandbox_attestation:true allows high-risk (non-DESTRUCTIVE) execute — host label only", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-high",
      desired_outcome: "Deploy production",
      risk_policy: "high",
      constraints: ["no-prod-without-gate"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-high", { reason: "a" });
    store.activate("goal-high", { reason: "a" });

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf"),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      approvals: ["goal-high"],
      ir_fixtures: { "goal-high": loginDashboardIR },
      sandbox_attestation: true, // host boolean ≠ OS sandbox
    });

    expect(
      hasSandboxAttestation({ sandbox_attestation: true }, report.proposals[0]!),
    ).toBe(true);
    expect(hasDestructiveEffectHint(report.proposals[0]!)).toBe(false);
    expect(report.runs[0]!.executed).toBe(true);
    // Honest residual: attestation is host-declared readiness only.
  });

  it("SEC-001: DESTRUCTIVE denied by default even with sandbox_attestation (OS sandbox NOT_IMPLEMENTED)", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-dest",
      desired_outcome: "DESTRUCTIVE wipe irreversible prod",
      risk_policy: "high",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-dest", { reason: "a" });
    store.activate("goal-dest", { reason: "a" });

    const prev = process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
    delete process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
    try {
      const report = await runAgencyRuntime({
        portfolio: store.portfolio("pf"),
        world: worldStub(),
        policy: policySnapshot(),
        safety_state: "NORMAL",
        engine: setupEngine(),
        registry: testRegistry,
        criteriaById,
        approvals: ["goal-dest"],
        ir_fixtures: { "goal-dest": loginDashboardIR },
        sandbox_attestation: true,
      });

      expect(hasDestructiveEffectHint(report.proposals[0]!)).toBe(true);
      expect(isDestructiveDeniedWithoutOsSandbox(report.proposals[0]!)).toBe(true);
      expect(report.runs[0]!.executed).toBe(false);
      expect(report.runs[0]!.status).toBe("BLOCKED");
      expect(report.runs[0]!.reason).toBe(DESTRUCTIVE_DENIED_REASON);
    } finally {
      if (prev === undefined) delete process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
      else process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV] = prev;
    }
  });

  it("SEC-001: S3 SafetySandboxContext alone does NOT authorize DESTRUCTIVE", () => {
    const proposal = {
      proposal_id: "p",
      goal_id: "g",
      intent: "pursue:DESTRUCTIVE wipe",
      risk: "high" as const,
      governor_required: true,
    };
    expect(
      hasSandboxAttestation(
        {
          safety_sandbox: {
            apiVersion: V3_API_VERSION,
            kind: "SafetySandboxContext",
            metadata: { schema_version: V3_SCHEMA_VERSION },
            spec: {
              safety_state: "NORMAL",
              sandbox_depth: "S3",
              updated_at: "2026-09-24T00:00:00.000Z",
            },
          },
        },
        proposal,
      ),
    ).toBe(true);
    // Honesty: depth label is theater — DESTRUCTIVE still denied without env opt-in
    expect(isDestructiveDeniedWithoutOsSandbox(proposal, {})).toBe(true);
    expect(
      isDestructiveDeniedWithoutOsSandbox(proposal, {
        [ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV]: "true",
      }),
    ).toBe(false);
    expect(allowsDestructiveWithoutOsSandbox({})).toBe(false);
  });

  it("SEC-001 opt-in env allows DESTRUCTIVE path past deny (still not OS isolation)", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-dest2",
      desired_outcome: "DESTRUCTIVE wipe irreversible",
      risk_policy: "high",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    store.accept("goal-dest2", { reason: "a" });
    store.activate("goal-dest2", { reason: "a" });

    const prev = process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
    process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV] = "true";
    try {
      const report = await runAgencyRuntime({
        portfolio: store.portfolio("pf"),
        world: worldStub(),
        policy: policySnapshot(),
        safety_state: "NORMAL",
        engine: setupEngine(),
        registry: testRegistry,
        criteriaById,
        approvals: ["goal-dest2"],
        ir_fixtures: { "goal-dest2": loginDashboardIR },
        sandbox_attestation: true,
      });
      expect(report.runs[0]!.reason).not.toBe(DESTRUCTIVE_DENIED_REASON);
      expect(report.runs[0]!.executed).toBe(true);
    } finally {
      if (prev === undefined) delete process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV];
      else process.env[ALLOW_DESTRUCTIVE_WITHOUT_OS_SANDBOX_ENV] = prev;
    }
  });
});
