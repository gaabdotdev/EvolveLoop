# Wave 3 (V4.1 Continuity) — common constraints

**Gate:** Phase 2 vertical Intent→WorkProof **ACCEPTED** (`VERTICAL-SLICE-V40.md`, tip ≥ `cf37912`). Contracts remain **FROZEN** with R1–R16.

**Baseline:** branch from `feature/v4-integration` HEAD (includes Wave 2 + vertical slice).

**Rules for all Wave 3 metas:**

1. Isolated worktree + branch `feature/v4/<id>-<slug>` from integration HEAD.
2. Import contracts only from `orchestrator/src/v4/contracts/` — **no catalog edits** (FROZEN). Optional-field minors need orchestrator/RFC per ADR-V4-0001.
3. Own only paths in `OWNERSHIP-MAP.md`.
4. No V3.7 cert / `recovery/v37-full-cert` edits; adapters only.
5. Honor Effect UNKNOWN / `decideRetry`; no exactly-once; no absolute replay determinism claim (§14).
6. Capsule ≠ grant (F01); `accept` MUST verify raw → allowlist-parse → re-derive grants (R6).
7. Disk tight (**B-DISK**): no `npm install`; symlink `orchestrator/node_modules` → V3.7 cert tree.
8. Deliver commits + tests + delivery report; **no self-ACCEPTED**; **no merge** to integration (M19 only).
9. Wiki: `WIKI_ROOT` may be unset → GAP; ground on freeze + ADRs + contracts in-repo.

## Metas this wave (first cut)

| Meta | Focus | Paths |
|------|-------|-------|
| M04 | Capsule, Handoff & Recovery | `orchestrator/src/v4/continuity/**` |
| M05 | Time Travel, Replay & Fork | `orchestrator/src/v4/timetravel/**` |

Later Continuity follow-ons (orchestrator-scheduled): M03-full, M06-handoff, M12-cont, M18 RO review.

## Phase 3 exit (not this delivery)

Handoff/recovery without confirmed-state loss — separate vertical after M04+M05 ACCEPTED + M19 integrate.
