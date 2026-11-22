import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDeferredProviderStubs,
  createV0AdaptStack,
  createV0ModelProviders,
  FreeLLMAPIModelProviderStub,
  LayaDecisionEngineStub,
  OllamaModelProvider,
  OpenRouterModelProvider,
} from "../../src/v3/model-providers/index.js";
import {
  CursorCircuitAdapter,
  type CircuitAgentAdapter,
} from "../../src/v3/circuit/index.js";
import type { ExecutionRunner, ExecutionRunnerResult } from "../../src/v3/execution-runner/types.js";
import {
  MemoryBroker,
  MemoryBrokerError,
  MemoryPromotionError,
  defaultMemoryDbPath,
  promotionGateAllowed,
} from "../../src/v3/memory/index.js";
import {
  buildStatusPanel,
  resolvePanelMsoState,
} from "../../src/v3/evolve-shell/status-panel.js";
import type { WorkspaceSessionSnapshot } from "../../src/v3/evolve-shell/workspace-session.js";
import { MSO_STATES } from "../../src/v3/mso/states.js";

function fakeRunnerResult(partial?: Partial<ExecutionRunnerResult>): ExecutionRunnerResult {
  return {
    kind: "ExecutionRunnerResult",
    status: "ok",
    code: "OK",
    exit_code: 0,
    signal: null,
    stdout: "done",
    stderr: "",
    duration_ms: 12,
    pid: 4242,
    pgid: 4242,
    argv: ["cursor-agent"],
    cwd: os.tmpdir(),
    limitations: [],
    ...partial,
  };
}

class FakeRunner implements ExecutionRunner {
  lastCancelPid: number | null = null;
  async run(): Promise<ExecutionRunnerResult> {
    return fakeRunnerResult();
  }
  runSync(): ExecutionRunnerResult {
    return fakeRunnerResult();
  }
  cancel(pid: number): { signalled: boolean; reason: string } {
    this.lastCancelPid = pid;
    return { signalled: true, reason: "SIGTERM" };
  }
}

describe("V0-ADAPT 1+1+1 + adapter contract + stubs", () => {
  it("V0-ADAPT-01: exposes Ollama + OpenRouter + Cursor adapter", async () => {
    const stack = await createV0AdaptStack();
    expect(stack.local).toBeInstanceOf(OllamaModelProvider);
    expect(stack.remote).toBeInstanceOf(OpenRouterModelProvider);
    expect(stack.agent.adapter_id).toBe("cursor");
    expect(typeof stack.agent.healthCheck).toBe("function");
    expect(typeof stack.agent.invoke).toBe("function");
    expect(typeof stack.agent.cancel).toBe("function");
    expect(typeof stack.agent.normalizeResult).toBe("function");

    const { local, remote } = createV0ModelProviders();
    expect(local.locality).toBe("local");
    expect(remote.locality).toBe("remote");
  });

  it("V0-ADAPT-02: adapter contract healthCheck/normalizeResult/cancel via runner", async () => {
    const runner = new FakeRunner();
    const adapter: CircuitAgentAdapter = new CursorCircuitAdapter(runner);
    const health = await adapter.healthCheck();
    expect(health.kind).toBe("AdapterHealth");
    expect(health.adapter_id).toBe("cursor");
    expect(typeof health.ok).toBe("boolean");

    const normalized = adapter.normalizeResult(fakeRunnerResult({ status: "timeout", code: "TIMEOUT" }));
    expect(normalized.status).toBe("timeout");
    expect(normalized.adapter_id).toBe("cursor");
    expect(normalized.cost_provenance).toBe("UNAVAILABLE");

    const cancelled = adapter.cancel(999);
    expect(runner.lastCancelPid).toBe(999);
    expect(cancelled.signalled).toBe(true);

    // invoke without consent stays blocked (still goes through contract path).
    // Force env=false so ~/.config/evolveloop/config.yaml cannot grant consent in CI/dev hosts.
    const prev = process.env.EVOLVELOOP_HARNESS_CONSENT;
    process.env.EVOLVELOOP_HARNESS_CONSENT = "false";
    try {
      if (health.ok) {
        const blocked = await adapter.invoke({
          work_id: "w",
          task_id: "t",
          prompt: "x",
          workspace_path: os.tmpdir(),
        });
        expect(blocked.status).toBe("blocked");
        expect(blocked.code).toBe("CONSENT_REQUIRED");
      }
    } finally {
      if (prev === undefined) delete process.env.EVOLVELOOP_HARNESS_CONSENT;
      else process.env.EVOLVELOOP_HARNESS_CONSENT = prev;
    }
  });

  it("V0-ADAPT-03: FreeLLMAPI + Laya stubs are typed and fail-closed", async () => {
    const stubs = createDeferredProviderStubs();
    expect(stubs.freellmapi).toBeInstanceOf(FreeLLMAPIModelProviderStub);
    expect(stubs.laya).toBeInstanceOf(LayaDecisionEngineStub);

    const health = await stubs.freellmapi.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.code).toBe("STUB_V1");

    const inv = await stubs.freellmapi.invoke({ prompt: "hi" });
    expect(inv.status).toBe("blocked");

    const decision = await stubs.laya.evaluate({
      decision_id: "d1",
      context: "pick",
      candidates: [{ candidate_id: "a", label: "A" }],
    });
    expect(decision.status).toBe("abstain");
    expect(decision.abstain_reason).toBe("ENGINE_STUB");
    expect(stubs.laya.maturity).toBe("stub");
  });
});

describe("V0-MEM FTS5 + MemoryBroker + promotion + edges", () => {
  let tmp: string;
  let broker: MemoryBroker;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-mem-"));
    broker = new MemoryBroker(defaultMemoryDbPath(tmp), "proj-alpha");
  });

  afterEach(async () => {
    broker.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("V0-MEM-01: FTS5 BM25 search with metadata filters", () => {
    expect(broker.journalMode()).toBe("wal");

    broker.propose({
      memory_type: "semantic",
      title: "Ollama local model",
      body: "Use Ollama for local inference with BM25 retrieval",
      source: "agent:test",
      contract_version: 2,
    });
    broker.propose({
      memory_type: "operational",
      title: "Unrelated note",
      body: "Database vacuum schedule",
      source: "agent:test",
      contract_version: 2,
    });
    const otherType = broker.propose({
      memory_type: "episodic",
      title: "Ollama session log",
      body: "Ran Ollama healthCheck successfully",
      source: "agent:test",
      contract_version: 1,
    });

    const hits = broker.search("Ollama BM25", {
      memory_type: "semantic",
      contract_version: 2,
      status: "PROPOSED",
    });
    expect(hits.length).toBe(1);
    expect(hits[0]!.record.title).toMatch(/Ollama/);
    expect(typeof hits[0]!.bm25).toBe("number");

    const byVersion = broker.search("Ollama", { contract_version: 1 });
    expect(byVersion.every((h) => h.record.contract_version === 1)).toBe(true);
    expect(byVersion.some((h) => h.record.memory_id === otherType.memory_id)).toBe(true);
  });

  it("V0-MEM-02: rigid project_id isolation + provenance fields", () => {
    const rec = broker.propose({
      memory_type: "decision",
      title: "Choose Cursor adapter",
      body: "1+1+1 agent slot",
      source: "agent:executor",
      tainted: false,
    });
    expect(rec.project_id).toBe("proj-alpha");
    expect(rec.source).toBe("agent:executor");
    expect(rec.created_at.length).toBeGreaterThan(0);
    expect(rec.status).toBe("PROPOSED");
    expect(rec.tainted).toBe(false);

    expect(() =>
      broker.search("Cursor", { project_id: "proj-other" }),
    ).toThrow(MemoryBrokerError);

    const beta = new MemoryBroker(defaultMemoryDbPath(tmp), "proj-beta");
    try {
      beta.propose({
        memory_type: "semantic",
        title: "Secret beta memory",
        body: "must not leak to alpha",
        source: "agent:beta",
      });
      const alphaHits = broker.search("Secret beta");
      expect(alphaHits.length).toBe(0);
      expect(broker.list().every((r) => r.project_id === "proj-alpha")).toBe(true);
    } finally {
      beta.close();
    }
  });

  it("V0-MEM-03: temporal columns; PROPOSED not auto-promoted; valid_to IS NULL filter", () => {
    const proposed = broker.propose({
      memory_type: "semantic",
      title: "Canonical fact",
      body: "FTS5 is required for V0 memory",
      source: "agent:writer",
    });
    expect(proposed.status).toBe("PROPOSED");
    // Agents never auto-promote to VERIFIED/ACTIVE — no VERIFIED status in V0 schema.
    expect(proposed.status).not.toBe("ACTIVE");
    expect((proposed as { status: string }).status).not.toBe("VERIFIED");
    expect(proposed.valid_from).toBeTruthy();
    expect(proposed.valid_to).toBeNull();
    expect(proposed.superseded_by).toBeNull();

    expect(() =>
      broker.promote(proposed.memory_id, {
        allow: false,
        actor: "validator",
        reason: "nope",
      }),
    ).toThrow(MemoryPromotionError);

    expect(() =>
      broker.promote(proposed.memory_id, {
        allow: true,
        actor: "agent" as "human",
        reason: "self promote",
      }),
    ).toThrow(MemoryPromotionError);

    // Still PROPOSED until an explicit gate actor promotes.
    expect(broker.get(proposed.memory_id)?.status).toBe("PROPOSED");

    const active = broker.promote(
      proposed.memory_id,
      promotionGateAllowed("validator", "evidence accepted"),
    );
    expect(active.status).toBe("ACTIVE");

    const next = broker.propose({
      memory_type: "semantic",
      title: "Canonical fact v2",
      body: "FTS5 BM25 with project filters",
      source: "agent:writer",
    });
    const promotedNext = broker.promote(
      next.memory_id,
      promotionGateAllowed("mso", "supersede prior", {
        supersede_memory_id: active.memory_id,
      }),
    );
    expect(promotedNext.status).toBe("ACTIVE");
    const prior = broker.get(active.memory_id)!;
    expect(prior.status).toBe("SUPERSEDED");
    expect(prior.valid_to).toBeTruthy();
    expect(prior.superseded_by).toBe(next.memory_id);

    // Default search/list apply valid_to IS NULL — superseded rows excluded.
    const liveHits = broker.search("FTS5");
    expect(liveHits.every((h) => h.record.valid_to === null)).toBe(true);
    expect(liveHits.some((h) => h.record.memory_id === prior.memory_id)).toBe(false);
    expect(liveHits.some((h) => h.record.memory_id === next.memory_id)).toBe(true);

    const expiredHits = broker.search("FTS5", { include_expired: true });
    expect(expiredHits.some((h) => h.record.memory_id === prior.memory_id)).toBe(true);

    const liveList = broker.list({ memory_type: "semantic" });
    expect(liveList.every((r) => r.valid_to === null)).toBe(true);
    expect(liveList.some((r) => r.memory_id === prior.memory_id)).toBe(false);
  });

  it("V0-MEM-04: edges Goal → Task → File → Evidence", () => {
    const edges = broker.linkGoalTaskFileEvidence({
      goal_id: "goal-1",
      task_id: "task-1",
      file_id: "file:src/x.ts",
      evidence_id: "ev-1",
    });
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => `${e.from_kind}->${e.to_kind}`)).toEqual([
      "Goal->Task",
      "Task->File",
      "File->Evidence",
    ]);
    expect(() =>
      broker.linkEdge({ from_kind: "Goal", from_id: "g", to_kind: "Evidence", to_id: "e" }),
    ).toThrow(/Goal→Task→File→Evidence/);

    const listed = broker.listEdges();
    expect(listed.every((e) => e.project_id === "proj-alpha")).toBe(true);
    expect(listed).toHaveLength(3);
  });
});

describe("V0-CLI-02 status panel MSO state", () => {
  it("never shows unofficial IDLE; defaults to INIT or real StateDb state", () => {
    const empty: WorkspaceSessionSnapshot = {
      workspace: "/tmp/x",
      initialized: true,
      state_db_path: "/tmp/x/.evolveloop/state.db",
      state_db_exists: true,
      contracts_count: 1,
      message_pt: "ok",
    };
    const panel = buildStatusPanel(empty);
    expect(panel.mso_state).toBe("INIT");
    expect(panel.mso_state).not.toBe("IDLE");

    const withSession: WorkspaceSessionSnapshot = {
      ...empty,
      latest_mso_session: {
        session_id: "s1",
        workspace_id: "/tmp/x",
        state: "ANALYZING",
        fencing_token: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    expect(buildStatusPanel(withSession).mso_state).toBe("ANALYZING");
    expect(resolvePanelMsoState(empty, "IDLE")).toBe("INIT");
    expect(MSO_STATES.includes("INIT")).toBe(true);
    expect((MSO_STATES as readonly string[]).includes("IDLE")).toBe(false);
  });
});
