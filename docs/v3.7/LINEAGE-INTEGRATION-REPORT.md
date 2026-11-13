# V3.7 Lineage Integration Report

**Date:** 2026-11-13  
**Worktree:** `/tmp/evolveloop-v37`  
**Integration branch:** `feature/v3.7-lineage-integration`  
**Canonical baseline commit:** *(filled after docs commit; tip before distributed fabric)*  
**Method:** V3.6 tip as base + controlled cherry-pick of Measurement Plane commits (no blind merge of `feature/bench-obs-v1`).

---

## 1. Git facts verified (not assumed)

| Ref | Commit | Notes |
|-----|--------|-------|
| tag `v3-complete` | `6b69c3f` | Preserved; not moved |
| tag `v3.5-runtime` | `07973fe` | Preserved; branch tip later |
| tag `v3.6-multi-workflow` | `2e76855` | Preserved; branch tip has docs commit after tag |
| `feature/v3.5-runtime` tip | `0992cd2` | Worktree `/home/gaab/Downloads/EvolveLoop-v35` |
| `feature/v3.6-multi-workflow` tip | `5c1df88` | Worktree `/home/gaab/orca/workspaces/EvolveLoop/brant` |
| `feature/bench-obs-v1` tip | `92a8f3e` | Worktree `/home/gaab/Downloads/EvolveLoop` (dirty; left untouched) |

### Ancestry

| Question | Result |
|----------|--------|
| V3.6 tip contains V3.5 tip (`0992cd2`)? | **YES** |
| V3.6 tip contains bench tip (`92a8f3e`)? | **NO** |
| Merge-base(V3.6, bench) | `6b69c3f` (`v3-complete`) |
| Commits on bench not in V3.6 | 3 (`da02ea9`, `253a76b`, `92a8f3e`) |
| Commits on V3.6 not in bench | 6 (V3.5 runtime stack + GlobalOps + live E2E + tag docs) |

### Working tree preservation

The original `feature/bench-obs-v1` worktree retained uncommitted/third-party paths (docs/v22 mods, docs/v23, docs/v3.7 audit drafts, `.agents/`, etc.). Integration was performed in a **new** worktree so those files were not disturbed.

---

## 2. Integration strategy executed

1. `git worktree add -b feature/v3.7-lineage-integration /tmp/evolveloop-v37 5c1df88`
2. Cherry-pick in order: `da02ea9` → `253a76b` → `92a8f3e`
3. Resolve conflicts by **contract ownership**, not ours/theirs:
   - `orchestrator/src/cli/evolve.ts`: keep **both** V3.5/V3.6 command handlers **and** Measurement Plane `telemetry`/`benchmark` + live eval commands; merge usage maps (harness list/inspect/sessions + eval live-* + telemetry/benchmark).
   - `.agent_history.md`: concatenate chronological entries from both lineages.
4. Validate: `tsc --noEmit` PASS; vitest `measurement-plane` + `v36-ops-core` + `v35-sandbox` + `v35-security` → **37/37 PASS**.

Cherry-pick SHAs rewrite commit IDs; content of the three bench commits is present. Bench tip `92a8f3e` is **not** an ancestor of the integration tip (expected).

---

## 3. Component presence after integration

| Component | Path | Owner line | Present |
|-----------|------|------------|---------|
| V3 Core | `orchestrator/src/v3/**` | V3 | YES |
| V3.5 Runtime / sandbox / daemon / approvals | `orchestrator/src/v3/{runtime,sandbox,approvals,security,workspace}` | V3.5 | YES (via V3.6 ancestry) |
| GlobalOps V3.6 | `orchestrator/src/v3/ops/**` | V3.6 | YES |
| Measurement Plane | `orchestrator/src/telemetry/measurement-plane/**` | bench-obs | YES |
| EventBus (in-process) | `orchestrator/src/events/event-bus.ts` | Core | YES (single) |
| Docs V3.5 / V3.6 / bench-obs | `docs/v3.5`, `docs/v3.6`, `docs/bench-obs` | respective | YES |

---

## 4. Conflict / ownership decisions

| Topic | Decision |
|-------|----------|
| Control Plane base | Evolve GlobalOps V3.6 → distributed Control Plane in V3.7; **not** a second scheduler |
| Local execution | Coordinator V3.5 remains local execution authority; Worker Runtime subordinates to Control Plane |
| Telemetry | Measurement Plane remains sole measurement product layer; **not** a second EventBus |
| Locks JSONL | Remain local best-effort; distributed leases are a **new** Control Plane authority (ADR-V37) |
| CLI | Single `evolve` binary surfaces v35 + v36 + telemetry/benchmark |

---

## 5. Gaps / non-claims

- `WIKI_ROOT` / `RAG_REPO_ROOT` unset → knowledge grounding `applied_with_gap` (repo docs + sibling worktrees + charter).
- Graphify CLI absent → `graphify_skill_status: blocked`.
- Multi-host peer `gaab-1` (Tailscale) was **offline** at integration time; Gate E2E multi-host may be BLOCKED until a second Linux host is available. Containers on one host do **not** satisfy Gate E2E.
- GlobalOps remains single-host until V3.7 fabric phases land; do not call it multi-host Control Plane yet.

---

## 6. Next branch

After baseline docs + ADR commit on `feature/v3.7-lineage-integration`, create `feature/v3.7-distributed-fabric` from that tip for distributed implementation.
