# V3.7 Risk Register

**Audit:** 2026-11-13 · HEAD audit workspace `92a8f3e` · V3.5 `0992cd2` · V3.6 `5c1df88`  
**Severity / Probability:** H/M/L · **Priority:** P0–P3

| ID | Risk | Sev | Prob | Impact | Evidence | Mitigation | Dependency | Priority |
|----|------|-----|------|--------|----------|------------|------------|----------|
| R01 | Lineage divergence: V3.5/V3.6 not in HEAD | H | H | V3.7 designs against incomplete or wrong base | `git merge-base --is-ancestor 0992cd2 HEAD` → false; same for `5c1df88` | Explicit integration branch before V3.7 goals | Git process | **P0** |
| R02 | Treating single-host GlobalOps as distributed Control Plane | H | H | False readiness; unsafe multi-node claims | `docs/v3.6/LIMITATIONS.md` “single-host only”; `GlobalOpsService` comments | Charter V3.7 nodes as new layer atop Ops | Architecture | **P0** |
| R03 | Split-brain without distributed fencing | H | M | Dual ownership of work/artifacts | Local `LeaderLock` + `WorkLockStore` only; no cluster quorum | Leases + fencing tokens + node generation | Control Plane | **P0** |
| R04 | Compromised/stale Worker keeps writing after revoke | H | M | Integrity / cross-project leak | No Node Registry/revocation; V3.5 IPC is local token | Node identity, short-lived creds, fence on revoke | Security | **P0** |
| R05 | Harness provider outside bubblewrap | H | H | Auth/session secrets on host; weaker isolation | `docs/v3.5/LIMITATIONS.md` #11; `cli-process.ts` host HOME | Keep as explicit semi-trusted boundary; optional isolated provider path later | Security/Harness | **P1** |
| R06 | Exactly-once illusion under redistribution | H | M | Duplicate side effects | ADR-V3-0006; ops recovery best-effort | At-least-once + idempotency keys + external effect ledger | Consistency | **P1** |
| R07 | Dual capacity semantics (policy vs host pool) | M | H | Admission surprises | V3.6 `max_global_workflows=4` vs host `workflows=8` | Unify placement model before multi-node | Scheduler | **P1** |
| R08 | Three event planes (EventBus / CoordLog / MP) | M | H | Blind spots / double-count | Reconciliation doc; `event-bus-adapter` not auto-wired | Single correlation contract; wire adapters | Observability | **P1** |
| R09 | Measurement Plane not merged with V3.6 | M | H | Ops without cost/ROI visibility | Divergent branches from `6b69c3f` | Merge/cherry-pick bench-obs onto V3.6 spine | Lineage | **P1** |
| R10 | FS-centric persistence as distributed bottleneck | M | H | Latency, partial writes, backup pain | Atomic JSON under `--data-dir` / `--ops-dir` | Keep SSOT; add transport/CAS for artifacts only as needed | Persistence | **P2** |
| R11 | Work stealing of non-portable tasks | M | M | Broken workspaces / budget desync | Worktrees + ownership local; no handoff protocol cross-node | Portability classifier; steal only checkpointed tasks | Scheduler | **P2** |
| R12 | Speculative execution write conflicts | M | M | Corrupt trees / wasted spend | No speculative controller | Opt-in; isolate workspaces; cancel losers | Topology | **P2** |
| R13 | `max_pids` / cgroup not enforced | M | M | Resource exhaustion on host | V3.5 LIMITATIONS #9; bubblewrap refuses RLIMIT_NPROC | Wire cgroup v2 before dense multi-agent nodes | Runtime | **P2** |
| R14 | Wiki/RAG unset in audit env | L | H | Grounding gaps for agents | `WIKI_ROOT` unset | Require vault for implementation phases | Knowledge | **P2** |
| R15 | TUI/Dashboard incomplete | L | H | Ops visibility debt | MP TUI NOT_IMPLEMENTED; V3.5 TUI disk snapshot | Fleet Ops Center later (V3.7.8) | UX | **P3** |
| R16 | Integration merge conflicts on `evolve.ts` | M | H | Broken CLI wiring | Both V3.5 and bench-obs extend CLI | Integration checklist + golden CLI tests | Merge | **P1** |
| R17 | Cross-project artifact leak if isolation relaxed | H | L | Data exfiltration | V3.6 `isolation.ts` deny-by-default | Keep fail-closed; audit shared_artifact grants | Security | **P1** |
| R18 | Operator-driven ticks (no auto-schedule) | M | H | Stalled workflows under load | V3.6 LIMITATIONS | Auto-tick policy with backpressure for V3.7 | Ops | **P2** |
| R19 | Live cost/tokens UNAVAILABLE | M | H | Bad placement by cost | MP acceptance; V3.6 live | Require measured provenance for cost-aware schedule | Accounting | **P2** |
| R20 | Premature Windows/macOS workers | M | L | False multi-OS claim | V3.5 Linux-first; bwrap Linux-only | Linux workers first; other OS = later charter | Platforms | **P3** |
| R21 | Same-UID abuse of Coordinator IPC (SEC-H02) | M | M | Local privileged IPC misuse | AUD-H02-01; Unix socket + token files `0600` | **Accepted boundary:** single-user trusted host ([ADR-V37-0003](adr/ADR-V37-0003-ipc-trust-boundary.md)); cross-user FS isolation only; do not claim same-UID multi-tenant isolation | Security | **P1** (closed as documented boundary) |
| R22 | Cancel mid-flight orphans / late success | H | M | Resource leak; false success after revoke | Sandbox AbortSignal + lease fencing | TERM→KILL + `cancelTask` revoke; see [CANCEL-SEMANTICS.md](CANCEL-SEMANTICS.md) | Runtime | **P0** (mitigated in recovery tip) |

## Risk themes for V3.7 goals doc

1. **Do not claim distributed readiness from V3.6.**  
2. **Consolidate lineage before new distributed modules.**  
3. **Security of node identity is on the critical path — not a late hardening item.**
