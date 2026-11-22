/**
 * V3-ORCH-05 — Formal verification via property-based / seeded fuzzing.
 * Prove: MSO transitions accept only matrix edges; stale fencing_token writers rejected.
 * Generator: deterministic Mulberry32 (no fast-check in project).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  StateDb,
  StateDbError,
} from "../../src/v3/state-db/index.js";
import {
  MSO_STATES,
  MSO_TRANSITIONS,
  MsoError,
  canTransitionMso,
  PBT_DEFAULT_SEED,
  PBT_FUZZ_SCHEMA_VERSION,
  createSeededRng,
  enumerateLegalEdges,
  enumerateIllegalEdges,
  sampleTransitionPair,
  sampleLegalWalk,
  sampleIllegalSuccessor,
  sampleFencingStealChain,
  transitionOracle,
  isStaleFencingToken,
  type MsoState,
} from "../../src/v3/mso/index.js";
import { WorkLockStore } from "../../src/v3/locks/store.js";

const PAIR_SAMPLES = 2_000;
const WALK_SAMPLES = 200;
const FENCE_SAMPLES = 150;

describe("V3-ORCH-05 PBT fuzz — MSO transitions + fencing", () => {
  it("schema version + seed are fixed for reproducible evidence", () => {
    expect(PBT_FUZZ_SCHEMA_VERSION).toBe(1);
    expect(PBT_DEFAULT_SEED).toBe((0xc05_f00d ^ 0x5eed_cafe) >>> 0);
    const a = createSeededRng(PBT_DEFAULT_SEED);
    const b = createSeededRng(PBT_DEFAULT_SEED);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  describe("property: transition matrix oracle", () => {
    it("exhaustive: canTransitionMso ≡ MSO_TRANSITIONS membership for all pairs", () => {
      for (const from of MSO_STATES) {
        for (const to of MSO_STATES) {
          expect(canTransitionMso(from, to)).toBe(transitionOracle(from, to));
          expect(canTransitionMso(from, to)).toBe(MSO_TRANSITIONS[from].includes(to));
        }
      }
    });

    it("enumerators partition the state² space (legal ∪ illegal = all; disjoint)", () => {
      const legal = enumerateLegalEdges();
      const illegal = enumerateIllegalEdges();
      const n = MSO_STATES.length;
      expect(legal.length + illegal.length).toBe(n * n);

      const legalKeys = new Set(legal.map((e) => `${e.from}->${e.to}`));
      const illegalKeys = new Set(illegal.map((e) => `${e.from}->${e.to}`));
      for (const k of legalKeys) expect(illegalKeys.has(k)).toBe(false);

      for (const e of legal) expect(canTransitionMso(e.from, e.to)).toBe(true);
      for (const e of illegal) expect(canTransitionMso(e.from, e.to)).toBe(false);
    });

    it(`seeded fuzz (${PAIR_SAMPLES} pairs): sample matches oracle`, () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED);
      let legalHits = 0;
      let illegalHits = 0;
      for (let i = 0; i < PAIR_SAMPLES; i++) {
        const s = sampleTransitionPair(rng);
        expect(s.legal).toBe(transitionOracle(s.from, s.to));
        expect(canTransitionMso(s.from, s.to)).toBe(s.legal);
        if (s.legal) legalHits++;
        else illegalHits++;
      }
      // Sanity: both classes appear under this seed (not a degenerate sampler).
      expect(legalHits).toBeGreaterThan(0);
      expect(illegalHits).toBeGreaterThan(0);
    });

    it(`seeded legal walks (${WALK_SAMPLES}): every consecutive edge is matrix-legal`, () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x1111);
      for (let i = 0; i < WALK_SAMPLES; i++) {
        const maxSteps = 3 + (i % 12);
        const walk = sampleLegalWalk(rng, maxSteps);
        expect(walk[0]).toBe("INIT");
        for (let j = 1; j < walk.length; j++) {
          expect(canTransitionMso(walk[j - 1]!, walk[j]!)).toBe(true);
        }
      }
    });

    it("illegal successors from every non-sink state are rejected by oracle", () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x2222);
      for (const from of MSO_STATES) {
        if (MSO_TRANSITIONS[from].length === 0) continue;
        for (let i = 0; i < 20; i++) {
          const bad = sampleIllegalSuccessor(rng, from);
          expect(bad).not.toBeNull();
          expect(canTransitionMso(from, bad!)).toBe(false);
        }
      }
    });
  });

  describe("property: StateDb enforces matrix + fencing", () => {
    let tmp: string;
    let db: StateDb;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v3-orch-05-"));
      db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
    });

    afterEach(async () => {
      db.close();
      await fs.rm(tmp, { recursive: true, force: true });
    });

    function openSession(ws: string, holder: string): {
      fencing_token: number;
      session_id: string;
      holder_id: string;
    } {
      const lease = db.acquireWorkspaceLease({
        workspace_id: ws,
        holder_id: holder,
        lease_ms: 120_000,
      });
      const session = db.createMsoSession({
        workspace_id: ws,
        fencing_token: lease.fencing_token,
        holder_id: holder,
      });
      return {
        fencing_token: lease.fencing_token,
        session_id: session.session_id,
        holder_id: holder,
      };
    }

    it(`seeded legal walks applied via transitionMso succeed (${WALK_SAMPLES / 4})`, () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x3333);
      const rounds = WALK_SAMPLES / 4;
      for (let i = 0; i < rounds; i++) {
        const ctx = openSession(`ws-walk-${i}`, `h-walk-${i}`);
        const walk = sampleLegalWalk(rng, 4 + (i % 8));
        // walk[0] is INIT — session already there; apply the rest.
        for (let j = 1; j < walk.length; j++) {
          const next = db.transitionMso({
            session_id: ctx.session_id,
            to: walk[j]!,
            fencing_token: ctx.fencing_token,
            holder_id: ctx.holder_id,
            reason: `pbt-walk-${i}-${j}`,
          });
          expect(next.state).toBe(walk[j]);
        }
      }
    });

    it("seeded illegal edges from reachable states throw INVALID_TRANSITION", () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x4444);
      for (let i = 0; i < 80; i++) {
        const ctx = openSession(`ws-ill-${i}`, `h-ill-${i}`);
        // Advance 0..3 legal steps to diversify `from`.
        const walk = sampleLegalWalk(rng, i % 4);
        let state: MsoState = "INIT";
        for (let j = 1; j < walk.length; j++) {
          db.transitionMso({
            session_id: ctx.session_id,
            to: walk[j]!,
            fencing_token: ctx.fencing_token,
            holder_id: ctx.holder_id,
          });
          state = walk[j]!;
        }
        if (MSO_TRANSITIONS[state].length === 0) continue;
        const bad = sampleIllegalSuccessor(rng, state);
        expect(bad).not.toBeNull();
        expect(() =>
          db.transitionMso({
            session_id: ctx.session_id,
            to: bad!,
            fencing_token: ctx.fencing_token,
            holder_id: ctx.holder_id,
          }),
        ).toThrow(MsoError);
        try {
          db.transitionMso({
            session_id: ctx.session_id,
            to: bad!,
            fencing_token: ctx.fencing_token,
            holder_id: ctx.holder_id,
          });
        } catch (e) {
          expect(e).toBeInstanceOf(MsoError);
          expect((e as MsoError).code).toBe("INVALID_TRANSITION");
        }
        // Session state unchanged after reject.
        expect(db.getMsoSession(ctx.session_id)?.state).toBe(state);
      }
    });

    it(`seeded fencing steals (${FENCE_SAMPLES}): obsolete writer tokens rejected`, () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x5555);
      for (let i = 0; i < FENCE_SAMPLES; i++) {
        const steals = 1 + (i % 4);
        const scenario = sampleFencingStealChain(rng, steals);
        const ws = `ws-fence-${i}`;

        // First holder acquires + opens session.
        let lease = db.acquireWorkspaceLease({
          workspace_id: ws,
          holder_id: scenario.holders[0]!,
          lease_ms: 60_000,
        });
        expect(lease.fencing_token).toBe(1);
        const session = db.createMsoSession({
          workspace_id: ws,
          fencing_token: lease.fencing_token,
          holder_id: scenario.holders[0]!,
        });

        // Chain of expire → steal (monotonic fencing).
        for (let s = 1; s < scenario.holders.length; s++) {
          db.acquireWorkspaceLease({
            workspace_id: ws,
            holder_id: scenario.holders[s - 1]!,
            lease_ms: 1,
            now: new Date(Date.now() - 120_000),
          });
          lease = db.acquireWorkspaceLease({
            workspace_id: ws,
            holder_id: scenario.holders[s]!,
            lease_ms: 120_000,
          });
          expect(lease.fencing_token).toBe(s + 1);
          expect(lease.holder_id).toBe(scenario.holders[s]);
        }
        expect(lease.fencing_token).toBe(scenario.current_token);

        for (const stale of scenario.stale_tokens) {
          expect(isStaleFencingToken(stale, scenario.current_token)).toBe(true);
          const check = db.checkWorkspaceFencing(ws, stale, scenario.holders[0]);
          expect(check.ok).toBe(false);
          if (!check.ok) {
            expect(check.reason).toBe("stale_fencing_token");
            expect(check.expected_token).toBe(scenario.current_token);
          }
          expect(() =>
            db.transitionMso({
              session_id: session.session_id,
              to: "LOADING_GOALS",
              fencing_token: stale,
              holder_id: scenario.holders[0]!,
            }),
          ).toThrow(StateDbError);
          expect(() =>
            db.releaseWorkspaceLease(ws, stale, scenario.holders[0]!),
          ).toThrow(StateDbError);
        }

        // Current holder may write.
        const ok = db.checkWorkspaceFencing(
          ws,
          scenario.current_token,
          scenario.current_holder,
        );
        expect(ok.ok).toBe(true);
        // Only transition if still INIT (session never advanced under stale rejects).
        if (db.getMsoSession(session.session_id)?.state === "INIT") {
          const advanced = db.transitionMso({
            session_id: session.session_id,
            to: "LOADING_GOALS",
            fencing_token: scenario.current_token,
            holder_id: scenario.current_holder,
          });
          expect(advanced.state).toBe("LOADING_GOALS");
        }
      }
    });
  });

  describe("property: WorkLockStore fencing rejects stale tokens", () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v3-orch-05-lk-"));
    });

    afterEach(async () => {
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it("seeded acquire→expire→steal→stale checkFencing always denied", async () => {
      const rng = createSeededRng(PBT_DEFAULT_SEED ^ 0x6666);
      const store = new WorkLockStore(tmp);
      for (let i = 0; i < 40; i++) {
        const workId = `work-${i}-${Math.floor(rng() * 1e6)}`;
        const a = store.acquire({
          work_id: workId,
          holder_agent_id: "agent-a",
          lease_ms: 1,
        });
        expect(a.status).toBe("acquired");
        const staleToken = a.lock!.fencing_token;

        await new Promise((r) => setTimeout(r, 3));

        const b = store.acquire({
          work_id: workId,
          holder_agent_id: "agent-b",
          lease_ms: 60_000,
        });
        expect(b.status).toBe("acquired");
        expect(b.lock!.fencing_token).toBeGreaterThan(staleToken);

        // Obsolete writer (old holder + old token)
        const oldWriter = store.checkFencing(
          workId,
          "work",
          undefined,
          staleToken,
          "agent-a",
        );
        expect(oldWriter.allowed).toBe(false);

        // Current holder presenting obsolete token
        const staleOnCurrent = store.checkFencing(
          workId,
          "work",
          undefined,
          staleToken,
          "agent-b",
        );
        expect(staleOnCurrent.allowed).toBe(false);
        expect(staleOnCurrent.reason).toBe("stale_fencing_token");

        const ok = store.checkFencing(
          workId,
          "work",
          undefined,
          b.lock!.fencing_token,
          "agent-b",
        );
        expect(ok.allowed).toBe(true);
      }
    });
  });
});
