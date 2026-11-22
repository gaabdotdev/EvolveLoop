/**
 * V3-ORCH-05 — Deterministic seeded property-based / fuzz helpers for MSO
 * transition matrix + fencing_token scenarios.
 *
 * No fast-check dependency: Mulberry32 PRNG + explicit edge enumerators.
 * Same seed ⇒ same sequence (reproducible evidence).
 */

import { MSO_STATES, MSO_TRANSITIONS, canTransitionMso, type MsoState } from "./states.js";

export const PBT_FUZZ_SCHEMA_VERSION = 1 as const;

/** Default evidence seed — fixed so CI / evidence runs are bit-stable. */
export const PBT_DEFAULT_SEED = (0xc05_f00d ^ 0x5eed_cafe) >>> 0;

/** Mulberry32 — compact deterministic PRNG. Returns [0, 1). */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeededRng = ReturnType<typeof createSeededRng>;

export function pickIndex(rng: SeededRng, length: number): number {
  if (length <= 0) throw new RangeError("pickIndex: empty");
  return Math.floor(rng() * length);
}

export function pickOne<T>(rng: SeededRng, items: readonly T[]): T {
  return items[pickIndex(rng, items.length)]!;
}

export interface MsoEdge {
  from: MsoState;
  to: MsoState;
}

/** Exhaustive legal edges from the hardcoded matrix. */
export function enumerateLegalEdges(): MsoEdge[] {
  const edges: MsoEdge[] = [];
  for (const from of MSO_STATES) {
    for (const to of MSO_TRANSITIONS[from]) {
      edges.push({ from, to });
    }
  }
  return edges;
}

/** Exhaustive illegal pairs (from,to) in MSO_STATES² minus matrix edges. */
export function enumerateIllegalEdges(): MsoEdge[] {
  const edges: MsoEdge[] = [];
  for (const from of MSO_STATES) {
    for (const to of MSO_STATES) {
      if (!canTransitionMso(from, to)) {
        edges.push({ from, to });
      }
    }
  }
  return edges;
}

export interface TransitionSample extends MsoEdge {
  legal: boolean;
}

/** Sample a random (from,to) pair; `legal` mirrors the matrix. */
export function sampleTransitionPair(rng: SeededRng): TransitionSample {
  const from = pickOne(rng, MSO_STATES);
  const to = pickOne(rng, MSO_STATES);
  return { from, to, legal: canTransitionMso(from, to) };
}

/**
 * Random walk of only legal edges starting at INIT (or `start`).
 * Stops early if a terminal state (no outgoing edges) is reached.
 */
export function sampleLegalWalk(
  rng: SeededRng,
  maxSteps: number,
  start: MsoState = "INIT",
): MsoState[] {
  const path: MsoState[] = [start];
  let cur = start;
  for (let i = 0; i < maxSteps; i++) {
    const nexts = MSO_TRANSITIONS[cur];
    if (nexts.length === 0) break;
    cur = pickOne(rng, nexts);
    path.push(cur);
  }
  return path;
}

/**
 * From a reachable non-terminal state, pick an illegal successor (fuzz reject path).
 * Returns null only if every peer state is somehow legal (should not happen for MSO).
 */
export function sampleIllegalSuccessor(
  rng: SeededRng,
  from: MsoState,
): MsoState | null {
  const illegal = MSO_STATES.filter((to) => !canTransitionMso(from, to));
  if (illegal.length === 0) return null;
  return pickOne(rng, illegal);
}

export interface FencingScenario {
  /** Tokens issued in acquisition order (monotonic). */
  issued_tokens: number[];
  /** Obsolete tokens a stolen-from writer might still hold. */
  stale_tokens: number[];
  /** Current authoritative token after last steal. */
  current_token: number;
  holders: string[];
  current_holder: string;
}

/**
 * Generate a fencing steal chain: holder₀ acquires → expire/steal → … → holderₙ.
 * Property under test: every prior token is stale vs `current_token`.
 */
export function sampleFencingStealChain(
  rng: SeededRng,
  steals: number,
): FencingScenario {
  const n = Math.max(1, steals);
  const holders: string[] = [];
  const issued_tokens: number[] = [];
  for (let i = 0; i <= n; i++) {
    holders.push(`holder-${i}-${pickIndex(rng, 1_000_000)}`);
    issued_tokens.push(i + 1);
  }
  const current_token = issued_tokens[issued_tokens.length - 1]!;
  const stale_tokens = issued_tokens.slice(0, -1);
  return {
    issued_tokens,
    stale_tokens,
    current_token,
    holders,
    current_holder: holders[holders.length - 1]!,
  };
}

/** Oracle: matrix membership ≡ canTransitionMso (property invariant). */
export function transitionOracle(from: MsoState, to: MsoState): boolean {
  return MSO_TRANSITIONS[from].includes(to);
}

/** Oracle: stale iff provided ≠ current (active lease). */
export function isStaleFencingToken(provided: number, current: number): boolean {
  return provided !== current;
}
