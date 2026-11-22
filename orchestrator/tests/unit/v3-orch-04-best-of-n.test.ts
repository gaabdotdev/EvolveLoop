/**
 * V3-ORCH-04 — Competitive Speculative Execution (Best-of-N).
 * Prove: controlled trigger for critically blocked tasks; race N executors;
 * promote first deterministic validator pass; cancel losers.
 * Distinct from V1-TOK-13 speculative-pipeline.
 */
import { describe, it, expect } from "vitest";
import {
  triggerBestOfN,
  admitBestOfN,
  assertBestOfNAdmission,
  isBlockedTask,
  isCriticallyBlocked,
  BestOfNError,
  BEST_OF_N_SCHEMA_VERSION,
  type BlockedTask,
  type BestOfNGate,
  type BestOfNHooks,
  type BestOfNExecutorResult,
} from "../../src/v3/parallel/index.js";

const T0 = "2026-11-21T23:45:00.000Z";
const clock = () => new Date(T0);

function criticalBlocked(overrides: Partial<BlockedTask> = {}): BlockedTask {
  return {
    task_id: "task-crit-01",
    work_id: "work-1",
    state: "BLOCKED",
    critically_blocked: true,
    block_reason: "validator_stall",
    attempt_count: 3,
    ...overrides,
  };
}

function armedGate(overrides: Partial<BestOfNGate> = {}): BestOfNGate {
  return {
    armed: true,
    armed_by: "mso-test",
    reason: "critical_path_blocked",
    max_n: 8,
    ...overrides,
  };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("V3-ORCH-04 Best-of-N admission", () => {
  it("isBlockedTask / isCriticallyBlocked helpers", () => {
    expect(isBlockedTask(criticalBlocked())).toBe(true);
    expect(isCriticallyBlocked(criticalBlocked())).toBe(true);
    expect(isCriticallyBlocked(criticalBlocked({ critically_blocked: false, criticality: "normal" }))).toBe(
      false,
    );
    expect(
      isCriticallyBlocked(
        criticalBlocked({ critically_blocked: undefined, criticality: "critical" }),
      ),
    ).toBe(true);
    expect(isBlockedTask(criticalBlocked({ state: "PENDING" }))).toBe(false);
  });

  it("admitBestOfN rejects unarmed gate", () => {
    const a = admitBestOfN(criticalBlocked(), 3, { armed: false });
    expect(a.ok).toBe(false);
    expect(a.reject_code).toBe("GATE_NOT_ARMED");
  });

  it("admitBestOfN rejects non-BLOCKED and non-critical", () => {
    expect(admitBestOfN(criticalBlocked({ state: "IN_PROGRESS" }), 3, armedGate()).reject_code).toBe(
      "NOT_BLOCKED",
    );
    expect(
      admitBestOfN(
        criticalBlocked({ critically_blocked: false, criticality: "normal" }),
        3,
        armedGate(),
      ).reject_code,
    ).toBe("NOT_CRITICALLY_BLOCKED");
  });

  it("admitBestOfN rejects invalid N and N > max_n / cost cap", () => {
    expect(admitBestOfN(criticalBlocked(), 1, armedGate()).reject_code).toBe("INVALID_N");
    expect(admitBestOfN(criticalBlocked(), 9, armedGate({ max_n: 4 })).reject_code).toBe(
      "N_EXCEEDS_MAX",
    );
    expect(
      admitBestOfN(criticalBlocked(), 4, armedGate({ max_cost_units: 3, cost_units_per_executor: 1 }))
        .reject_code,
    ).toBe("COST_CAP_EXCEEDED");
  });

  it("assertBestOfNAdmission throws BestOfNError", () => {
    expect(() => assertBestOfNAdmission(criticalBlocked(), 3, { armed: false })).toThrow(
      BestOfNError,
    );
  });
});

describe("V3-ORCH-04 Best-of-N race / promote / cancel", () => {
  it("triggerBestOfN rejects without spawning when gate closed", async () => {
    let runs = 0;
    const report = await triggerBestOfN(criticalBlocked(), 3, { armed: false }, {
      clock,
      runExecutor: async () => {
        runs += 1;
        return { executor_id: "x", ok: true };
      },
      validate: () => ({ ok: true }),
    });
    expect(report.triggered).toBe(false);
    expect(report.status).toBe("rejected");
    expect(report.reject_code).toBe("GATE_NOT_ARMED");
    expect(runs).toBe(0);
    expect(report.kind).toBe("BestOfNReport");
    expect(report.schema_version).toBe(BEST_OF_N_SCHEMA_VERSION);
  });

  it("promotes first deterministic validator pass and cancels losers", async () => {
    const d0 = deferred<void>();
    const d1 = deferred<void>();
    const d2 = deferred<void>();
    const gates = [d0, d1, d2];
    const abortSeen: boolean[] = [false, false, false];

    const hooks: BestOfNHooks = {
      clock,
      runExecutor: async ({ index, executor_id, signal }) => {
        signal.addEventListener("abort", () => {
          abortSeen[index] = true;
        });
        await gates[index].promise;
        if (signal.aborted) {
          const err = new Error("aborted");
          throw err;
        }
        return {
          executor_id,
          ok: true,
          artifact: { from: index },
          fingerprint: `fp-${index}`,
        };
      },
      validate: (result) => {
        // All valid — first to finish wins.
        if (result.ok && result.fingerprint) return { ok: true };
        return { ok: false, reason: "missing fingerprint" };
      },
    };

    const pending = triggerBestOfN(criticalBlocked(), 3, armedGate(), hooks);

    // Executor 1 finishes first → promote; 0 and 2 cancelled.
    d1.resolve();
    // Allow microtasks for promote + abort.
    await Promise.resolve();
    await Promise.resolve();

    d0.resolve();
    d2.resolve();

    const report = await pending;

    expect(report.triggered).toBe(true);
    expect(report.status).toBe("promoted");
    expect(report.winner_executor_id).toBe("bon-exec-01");
    expect(report.promoted?.artifact).toEqual({ from: 1 });
    expect(report.cancelled_executor_ids.sort()).toEqual(["bon-exec-00", "bon-exec-02"]);
    expect(abortSeen[0]).toBe(true);
    expect(abortSeen[2]).toBe(true);
    expect(abortSeen[1]).toBe(false);
    expect(report.started_at).toBe(T0);
    expect(report.finished_at).toBe(T0);
  });

  it("skips invalid executor and promotes next validated one", async () => {
    const order: number[] = [];
    const hooks: BestOfNHooks = {
      clock,
      runExecutor: async ({ index, executor_id }) => {
        order.push(index);
        // Finish in index order; 0 is fast-invalid, 1 valid.
        await new Promise((r) => setTimeout(r, index === 0 ? 5 : 20));
        return {
          executor_id,
          ok: true,
          artifact: { index },
          fingerprint: index === 0 ? "bad" : "good",
        };
      },
      validate: (result) =>
        result.fingerprint === "good"
          ? { ok: true }
          : { ok: false, reason: "fingerprint rejected" },
    };

    const report = await triggerBestOfN(criticalBlocked(), 2, armedGate(), hooks);
    expect(report.status).toBe("promoted");
    expect(report.winner_executor_id).toBe("bon-exec-01");
    expect(report.failed_executor_ids).toContain("bon-exec-00");
    const invalid = report.traces.find((t) => t.executor_id === "bon-exec-00");
    expect(invalid?.outcome).toBe("invalid");
    expect(invalid?.validate_ok).toBe(false);
  });

  it("all_failed when every executor fails or is invalid", async () => {
    const report = await triggerBestOfN(criticalBlocked(), 3, armedGate(), {
      clock,
      runExecutor: async ({ executor_id, index }): Promise<BestOfNExecutorResult> => ({
        executor_id,
        ok: index !== 2,
        error: index !== 2 ? undefined : "boom",
        artifact: { index },
        fingerprint: "nope",
      }),
      validate: () => ({ ok: false, reason: "never" }),
    });

    expect(report.status).toBe("all_failed");
    expect(report.winner_executor_id).toBeNull();
    expect(report.promoted).toBeNull();
    expect(report.triggered).toBe(true);
    expect(report.failed_executor_ids.length).toBe(3);
  });

  it("external AbortSignal cancels the race without promotion", async () => {
    const release = deferred<void>();
    const external = new AbortController();

    const pending = triggerBestOfN(criticalBlocked(), 2, armedGate(), {
      clock,
      signal: external.signal,
      runExecutor: async ({ executor_id, signal }) => {
        await Promise.race([
          release.promise,
          new Promise<never>((_, rej) => {
            signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
          }),
        ]);
        return { executor_id, ok: true, fingerprint: "x" };
      },
      validate: () => ({ ok: true }),
    });

    external.abort();
    release.resolve();
    const report = await pending;
    expect(report.status).toBe("cancelled_external");
    expect(report.winner_executor_id).toBeNull();
    expect(report.traces.every((t) => t.outcome === "cancelled")).toBe(true);
  });

  it("allow non-critical when gate.require_critical=false", async () => {
    const task = criticalBlocked({ critically_blocked: false, criticality: "normal" });
    const report = await triggerBestOfN(task, 2, armedGate({ require_critical: false }), {
      clock,
      runExecutor: async ({ executor_id }) => ({
        executor_id,
        ok: true,
        fingerprint: "ok",
      }),
      validate: () => ({ ok: true }),
    });
    expect(report.status).toBe("promoted");
    expect(report.triggered).toBe(true);
  });

  it("prove cancel-of-losers: slower valid peer never promotes after winner", async () => {
    const slow = deferred<void>();
    const fast = deferred<void>();
    const promotedIds: string[] = [];

    const pending = triggerBestOfN(criticalBlocked(), 2, armedGate(), {
      clock,
      runExecutor: async ({ index, executor_id, signal }) => {
        if (index === 0) await slow.promise;
        else await fast.promise;
        if (signal.aborted) throw new Error("aborted");
        return { executor_id, ok: true, artifact: index, fingerprint: "ok" };
      },
      validate: (result) => {
        promotedIds.push(result.executor_id);
        return { ok: true };
      },
    });

    fast.resolve();
    await Promise.resolve();
    await Promise.resolve();
    slow.resolve();
    const report = await pending;

    expect(report.winner_executor_id).toBe("bon-exec-01");
    // Validator may only promote-path for winner; loser aborted before validate.
    expect(report.cancelled_executor_ids).toContain("bon-exec-00");
    expect(report.traces.find((t) => t.executor_id === "bon-exec-00")?.outcome).toBe(
      "cancelled",
    );
  });
});
