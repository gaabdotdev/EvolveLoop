/**
 * Permanent security suite — V0-SEC adversarial coverage + legacy longitudinal audit.
 *
 * V0-SEC: path traversal, symlink escape, env scrubbing, redaction,
 * capability gate, anti-reward-hacking (agent editing tests blocked).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  LongitudinalEvolveLoop,
  PersistentSignalStore,
  CrossRunAggregator,
  SignalMiner,
  OutcomeTracker,
  dayObs,
  longitudinalFailureArc,
  sameExecutionTriple,
  resetLongitudinalSeq,
  diagnoseWithInventory,
  ADAPTER_REGISTRY,
  type AnalysisScope,
  type LongitudinalNeed,
  type NeedSignal,
} from "../../../src/evolveloop/index.js";
import {
  DefaultExecutionRunner,
  guardPathBeforeMutation,
  ExecutionRunnerError,
} from "../../../src/v3/execution-runner/index.js";
import { capabilityGate } from "../../../src/v3/security/capability-gate.js";
import { redactSecrets, EVIDENCE_SECRET_CANARY } from "../../../src/evidence/secret-redaction.js";
import { runEvidenceValidator } from "../../../src/v3/circuit/evidence-validator.js";
import type { GoalContract } from "../../../src/v3/goal-contract/types.js";

const USER_A: AnalysisScope = { type: "USER", id: "user-a" };

function mockNeed(partial?: Partial<LongitudinalNeed>): LongitudinalNeed {
  const now = new Date().toISOString();
  return {
    id: "n1",
    fingerprint: "fp",
    scope: "USER",
    scope_class: "USER_LOCAL",
    scope_id: "user-a",
    domain: "sql",
    type: "RepeatedFailure",
    recurrence: 2,
    impact: "HIGH",
    affected_tasks: ["complex_query"],
    evidence: [],
    pattern_ids: [],
    signal_ids: [],
    confidence: "MEDIUM",
    suspected_root_causes: [],
    first_seen: now,
    last_seen: now,
    status: "CANDIDATE",
    lifecycle: "EMERGING",
    affected_executions: [],
    affected_sessions: [],
    unique_executions: 2,
    unique_sessions: 2,
    ...partial,
  };
}

function mockSignal(partial?: Partial<NeedSignal>): NeedSignal {
  const now = new Date().toISOString();
  return {
    id: "s1",
    fingerprint: "x1",
    timestamp: now,
    scope: { type: "USER", id: "user-a" },
    source: "execution",
    type: "failure",
    domain: "sql",
    task_class: "complex_query",
    severity: "HIGH",
    evidence_refs: [],
    user_id: "user-a",
    synthetic: true,
    metadata: {},
    ...partial,
  };
}

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "fixture",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    criteria: [
      {
        id: "c-accept",
        description: "commands green",
        mandatory: true,
        verification: [{ id: "v1", kind: "command", description: "validator" }],
        evidence_required: ["acceptance-evidence"],
        state: "NOT_STARTED",
        evidence_ids: [],
        updated_at: ts,
      },
    ],
  };
}

describe("V0-SEC adversarial — ExecutionRunner / gate / evidence", () => {
  let tmp: string;
  const runner = new DefaultExecutionRunner();

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "v0-sec-adv-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("V0-SEC-02 blocks path traversal before mutation", () => {
    expect(() => guardPathBeforeMutation(join(tmp, "..", "escape.txt"), tmp)).toThrow(
      ExecutionRunnerError,
    );
    const inside = guardPathBeforeMutation(join(tmp, "ok.txt"), tmp);
    expect(inside.startsWith(resolve(tmp))).toBe(true);
  });

  it("V0-SEC-02 blocks symlink escape outside workspace", async () => {
    const outside = mkdtempSync(join(tmpdir(), "v0-sec-out-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "nope", "utf-8");
      const link = join(tmp, "escape");
      symlinkSync(outside, link);
      const result = await runner.run({
        argv: ["true"],
        cwd: link,
        workspace_root: tmp,
        timeout_ms: 3000,
      });
      expect(result.status).toBe("blocked");
      expect(result.code).toMatch(/SYMLINK|ESCAPE|PATH/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("V0-SEC-03 env scrubbing: secrets + real HOME not inherited", async () => {
    const prevTok = process.env.AWS_SECRET_ACCESS_KEY;
    const prevHome = process.env.HOME;
    process.env.AWS_SECRET_ACCESS_KEY = "AKIA_SHOULD_NOT_LEAK_999";
    process.env.HOME = "/real/home/must/not/leak";
    try {
      const result = await runner.run({
        argv: [
          "bash",
          "-lc",
          "echo TOK=$AWS_SECRET_ACCESS_KEY; echo HOME=$HOME; echo PATH_SET=${PATH:+yes}",
        ],
        cwd: tmp,
        workspace_root: tmp,
        timeout_ms: 5000,
      });
      expect(result.status).toBe("ok");
      expect(result.stdout).not.toContain("AKIA_SHOULD_NOT_LEAK_999");
      expect(result.stdout).not.toContain("/real/home/must/not/leak");
      expect(result.stdout).toContain("PATH_SET=yes");
      expect(result.ephemeral_home).toBeTruthy();
    } finally {
      if (prevTok === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
      else process.env.AWS_SECRET_ACCESS_KEY = prevTok;
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("V0-SEC-03 deterministic secret redaction in logs/evidence text", () => {
    const raw = `token=${EVIDENCE_SECRET_CANARY} and API_KEY=sk-abcdefghijklmnopqrstuvwxyz12`;
    const out = redactSecrets(raw);
    expect(out).not.toContain(EVIDENCE_SECRET_CANARY);
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz12");
    expect(out).toMatch(/REDACTED/);
  });

  it("V0-SEC-03 runner redacts secrets from stdout evidence", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", `echo canary=${EVIDENCE_SECRET_CANARY}; echo done`],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 5000,
    });
    expect(result.status).toBe("ok");
    expect(result.stdout).not.toContain(EVIDENCE_SECRET_CANARY);
    expect(result.stdout).toContain("done");
  });

  it("V0-SEC-04 launches detached pgid and escalates kill on timeout", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", "sleep 60"],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 300,
      kill_grace_ms: 150,
    });
    expect(result.status).toBe("timeout");
    expect(result.pgid).toBeTypeOf("number");
    expect(result.code).toBe("TIMEOUT");
  });

  it("V0-SEC-05 Capability Gate default-denies destructive → BLOCKED", () => {
    const del = capabilityGate({ action: "filesystem.delete", workspace_root: tmp });
    expect(del.verdict).toBe("BLOCKED");
    expect(del.mso_state).toBe("BLOCKED");

    const secrets = capabilityGate({ action: "secrets.read", workspace_root: tmp });
    expect(secrets.verdict).toBe("BLOCKED");

    const net = capabilityGate({ action: "network.egress", workspace_root: tmp });
    expect(net.verdict).toBe("BLOCKED");

    const read = capabilityGate({ action: "filesystem.read", workspace_root: tmp });
    expect(read.verdict).toBe("allow");
  });

  it("V0-SEC-05 ExecutionRunner refuses spawn when capability blocked", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", "echo should-not-run"],
      cwd: tmp,
      workspace_root: tmp,
      capability: "deploy.publish",
      timeout_ms: 3000,
    });
    expect(result.status).toBe("blocked");
    expect(result.code).toBe("CAPABILITY_BLOCKED");
    expect(result.stdout).not.toContain("should-not-run");
  });

  it("V0-SEC-06 anti-reward-hacking: agent editing tests without contract → BLOCKED", async () => {
    spawnSync("git", ["init"], { cwd: tmp, encoding: "utf-8" });
    writeFileSync(join(tmp, "README.md"), "x\n", "utf-8");
    spawnSync("git", ["add", "."], { cwd: tmp });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "i"], {
      cwd: tmp,
    });

    mkdirSync(join(tmp, "tests"), { recursive: true });
    writeFileSync(join(tmp, "tests", "reward-hack.test.ts"), "export {}\n", "utf-8");
    spawnSync("git", ["add", "tests/reward-hack.test.ts"], { cwd: tmp });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add"], {
      cwd: tmp,
    });

    // Simulate agent weakening the test (reward hacking).
    writeFileSync(
      join(tmp, "tests", "reward-hack.test.ts"),
      "export const alwaysPass = true;\n",
      "utf-8",
    );

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-anti-hack"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.code).toBe("SENSITIVE_DIFF_UNAUTHORIZED");
    expect(blocked.sensitive_diff_blocked.some((p) => p.includes("reward-hack.test.ts"))).toBe(
      true,
    );

    // Same edit authorized by Goal Contract scope → not blocked by diff gate.
    const authorized = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: {
        ...minimalContract("gc-auth"),
        scope: ["authorize:tests/reward-hack.test.ts"],
      },
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });
    expect(authorized.status).toBe("TRUE_FULL_PASS");
    expect(authorized.sensitive_diff_blocked).toHaveLength(0);
  });

  it("V0-SEC-06 anti-reward-hacking: package.json / build script alter → BLOCKED TRUE-FULL-PASS", async () => {
    spawnSync("git", ["init"], { cwd: tmp, encoding: "utf-8" });
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { build: "tsc", test: "vitest" } }, null, 2) +
        "\n",
      "utf-8",
    );
    mkdirSync(join(tmp, "scripts"), { recursive: true });
    writeFileSync(join(tmp, "scripts", "build.sh"), "#!/bin/sh\necho build\n", "utf-8");
    spawnSync("git", ["add", "."], { cwd: tmp });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "i"], {
      cwd: tmp,
    });

    // Agent weakens build gate (reward hacking).
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify(
        { name: "fixture", scripts: { build: "echo hacked", test: "echo always-pass" } },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    writeFileSync(join(tmp, "scripts", "build.sh"), "#!/bin/sh\nexit 0\n", "utf-8");

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-build-hack"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.code).toBe("SENSITIVE_DIFF_UNAUTHORIZED");
    expect(blocked.sensitive_diff_blocked).toEqual(
      expect.arrayContaining(["package.json", "scripts/build.sh"]),
    );
  });
});

describe("security — independent adversarial audit (permanent suite)", () => {
  it("refuses analyze without scope (no silent global)", () => {
    resetLongitudinalSeq();
    const now = new Date();
    const dir = mkdtempSync(join(tmpdir(), "aud-scope-"));
    try {
      const loop = new LongitudinalEvolveLoop({ evolutionDir: dir, now });
      for (const day of [6, 4, 2]) {
        loop.ingest(
          [
            dayObs(
              day,
              {
                source: "execution",
                synthetic: true,
                execution_id: `a-${day}`,
                user_id: "user-a",
                domain: "sql",
                task_class: "q",
                kind: "failure",
                severity: "HIGH",
              },
              now,
            ),
          ],
          now,
        );
      }
      for (const day of [5, 3, 1]) {
        loop.ingest(
          [
            dayObs(
              day,
              {
                source: "execution",
                synthetic: true,
                execution_id: `b-${day}`,
                user_id: "user-b",
                domain: "frontend",
                task_class: "css",
                kind: "failure",
                severity: "HIGH",
              },
              now,
            ),
          ],
          now,
        );
      }
      const noscope = loop.analyze({ now });
      expect(noscope.state).toBe("REQUIRES_SCOPE");
      expect(noscope.signal_count).toBe(0);

      const onlyA = loop.analyze({ now, scope: USER_A });
      expect(onlyA.signals.every((s) => s.user_id === "user-a")).toBe(true);
      expect(onlyA.signals.some((s) => s.user_id === "user-b")).toBe(false);

      const qa = loop.getStore().query({ user_id: "user-a", now });
      expect(qa.every((s) => s.user_id === "user-a")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats empty after-window as INCONCLUSIVE (never false IMPROVED)", () => {
    const now = new Date();
    const tracker = new OutcomeTracker();
    const need = mockNeed();
    const before = [
      mockSignal({ id: "s1", fingerprint: "x1" }),
      mockSignal({ id: "s2", fingerprint: "x2" }),
    ];
    const r = tracker.evaluate({
      evolution_request_id: "e",
      candidate_id: "c",
      need,
      signals_before: before,
      signals_after: [],
      window_start: now.toISOString(),
      window_end: now.toISOString(),
    });
    expect(r.outcome.outcome).toBe("INCONCLUSIVE");

    const before3 = [...before, mockSignal({ id: "s3", fingerprint: "x3" })];
    const r3 = tracker.evaluate({
      evolution_request_id: "e2",
      candidate_id: "c",
      need,
      signals_before: before3,
      signals_after: [],
      window_start: now.toISOString(),
      window_end: now.toISOString(),
    });
    expect(r3.outcome.outcome).toBe("INCONCLUSIVE");
  });

  it("preserves REGRESSED lifecycle across a subsequent scoped analyze", () => {
    resetLongitudinalSeq();
    const now = new Date();
    const dir = mkdtempSync(join(tmpdir(), "aud-life-"));
    try {
      const loop = new LongitudinalEvolveLoop({ evolutionDir: dir, now });
      loop.ingest(longitudinalFailureArc("user-a", now), now);
      const r = loop.analyze({ now, scope: USER_A });
      const need = r.longitudinal_needs.find((n) => n.status === "CANDIDATE");
      expect(need).toBeTruthy();
      if (!need) return;

      const before = loop.getStore().query({ user_id: "user-a", now });
      const miner = new SignalMiner();
      const beforeMixed = miner.mine([
        dayObs(0, { source: "execution", synthetic: true, execution_id: "bf-1", user_id: "user-a", domain: "sql", task_class: "complex_query", kind: "failure", severity: "LOW" }, now),
        dayObs(0, { source: "execution", synthetic: true, execution_id: "bf-2", user_id: "user-a", domain: "sql", task_class: "complex_query", kind: "latency", severity: "LOW" }, now),
        dayObs(0, { source: "execution", synthetic: true, execution_id: "bf-3", user_id: "user-a", domain: "sql", task_class: "complex_query", kind: "latency", severity: "LOW" }, now),
        dayObs(0, { source: "execution", synthetic: true, execution_id: "bf-4", user_id: "user-a", domain: "sql", task_class: "complex_query", kind: "latency", severity: "LOW" }, now),
        dayObs(0, { source: "execution", synthetic: true, execution_id: "bf-5", user_id: "user-a", domain: "sql", task_class: "complex_query", kind: "latency", severity: "LOW" }, now),
      ]);
      const after = miner.mine(
        [0, 1, 2, 3, 4].map((i) =>
          dayObs(
            0,
            {
              source: "execution",
              synthetic: true,
              execution_id: `post-${i}`,
              user_id: "user-a",
              domain: "sql",
              task_class: "complex_query",
              kind: "failure",
              severity: "CRITICAL",
            },
            now,
          ),
        ),
      );
      const evaled = loop.recordOutcome({
        evolution_request_id: "e",
        candidate_id: "c",
        need,
        signals_before: beforeMixed,
        signals_after: after,
        window_start: before[0]?.timestamp ?? now.toISOString(),
        window_end: now.toISOString(),
      });
      expect(evaled.outcome.outcome).toBe("REGRESSED");

      const r2 = loop.analyze({ now, scope: USER_A });
      const afterAnalyze = r2.longitudinal_needs.find((n) => n.id === need.id);
      expect(afterAnalyze?.lifecycle).toBe("REGRESSED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes adapter registry labels without auto JSONL ingest on the controller", () => {
    expect(ADAPTER_REGISTRY.find((a) => a.id === "jsonl-events")?.status).toBe("CONNECTED");
    expect(ADAPTER_REGISTRY.find((a) => a.id === "evidence-bus")?.status).toBe("NOT_CONNECTED");
    const proto = Object.getOwnPropertyNames(LongitudinalEvolveLoop.prototype);
    expect(proto.includes("ingestFromJsonl")).toBe(false);
    expect(proto.includes("ingestFromTelemetry")).toBe(false);
  });

  it("consumes historical store across process restarts (scoped)", () => {
    resetLongitudinalSeq();
    const now = new Date();
    const dir = mkdtempSync(join(tmpdir(), "aud-hist-"));
    const userScope: AnalysisScope = { type: "USER", id: "u" };
    try {
      new LongitudinalEvolveLoop({ evolutionDir: dir, now }).ingest(
        [
          dayObs(
            6,
            {
              source: "execution",
              synthetic: true,
              execution_id: "r1",
              user_id: "u",
              domain: "sql",
              task_class: "q",
              kind: "failure",
              severity: "HIGH",
            },
            now,
          ),
        ],
        now,
      );
      new LongitudinalEvolveLoop({ evolutionDir: dir, now }).ingest(
        [
          dayObs(
            4,
            {
              source: "execution",
              synthetic: true,
              execution_id: "r2",
              user_id: "u",
              domain: "sql",
              task_class: "q",
              kind: "failure",
              severity: "HIGH",
            },
            now,
          ),
        ],
        now,
      );
      const c = new LongitudinalEvolveLoop({ evolutionDir: dir, now });
      c.ingest(
        [
          dayObs(
            2,
            {
              source: "execution",
              synthetic: true,
              execution_id: "r3",
              user_id: "u",
              domain: "sql",
              task_class: "q",
              kind: "failure",
              severity: "HIGH",
            },
            now,
          ),
        ],
        now,
      );
      const r = c.analyze({ now, scope: userScope });
      expect(r.signal_count).toBeGreaterThanOrEqual(3);
      expect(r.pattern_count).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not treat same-execution triples as cross-run patterns", () => {
    const now = new Date();
    const signals = new SignalMiner().mine(sameExecutionTriple("user-a", now));
    const patterns = new CrossRunAggregator().aggregate(signals, { now, window: "7d" });
    expect(patterns.length).toBe(0);
  });

  it("uses injected inventory for diagnosis (not a live registry default)", () => {
    const advice = diagnoseWithInventory(
      "SKILL_GAP",
      { skills: ["sql-helper"], capabilities: [], providers: [], agents: [] },
      "sql",
    );
    expect(advice.prefer).toBe("KNOWLEDGE");
    expect(advice.avoid).toContain("AGENT");
    const noInv = diagnoseWithInventory(
      "SKILL_GAP",
      { skills: [], capabilities: [], providers: [], agents: [] },
      "sql",
    );
    expect(noInv.prefer).toBe("SKILL");
  });

  it("bounds storage on duplicate ingest of the same batch", () => {
    resetLongitudinalSeq();
    const now = new Date();
    const dir = mkdtempSync(join(tmpdir(), "aud-dedupe-"));
    try {
      const loop = new LongitudinalEvolveLoop({ evolutionDir: dir, now });
      const batch = longitudinalFailureArc("user-a", now);
      loop.ingest(batch, now);
      loop.ingest(batch, now);
      const lines = readFileSync(join(dir, "signals.jsonl"), "utf8").split("\n").filter(Boolean)
        .length;
      expect(lines).toBeLessThanOrEqual(batch.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips corrupt JSONL lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "aud-corrupt-"));
    try {
      const store = new PersistentSignalStore(dir);
      writeFileSync(join(dir, "signals.jsonl"), "{not-json}\n");
      expect(store.loadAllSignals().length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
