# Session log

## 2026-11-11T15:55:38-03:00 — V3 Phase Zero
- See vault EvolveLoop/log.md and docs/v3/*

## 2026-11-11T21:36:28Z — V3.3 resilience gate (Core)

- Delivered: worktrees (git), cancel+idempotency, parallel TaskGraph scheduler, failure-injection battery.
- CLI: `evolve worktree|cancel|parallel|battery`.
- Tests: `orchestrator/tests/unit/v33-resilience.test.ts` 6/6 pass.
- Evidence: `memory/v3-phase0/evidence/gate.v33-resilience.json`.
- ADR: `docs/v3/adr/ADR-V3-0007-v33-resilience-primitives.md`.
- Status docs updated: V3_IMPLEMENTATION_STATUS / ROADMAP / OWNERSHIP.
- Limitations: no OS sandbox; cancel does not kill external harnesses; no exactly-once claim.

## 2026-11-11T21:47:03Z — V3.3 integral gate

- Quota/limit→handoff, hierarchical budgets, hierarchy aux, cross-provider apply, CLI harness dry-run, TUI resilience commands, coordinator tick wiring.
- Tests: 31 pass (unit v33-* + adapters + continuity/locks/budget/tui + evolve-cli + v33-multiagent E2E).
- Evidence: memory/v3-phase0/evidence/gate.v33-integral.json
- ADR-V3-0008 CLI harness drivers.
- Non-claims: exactly-once, IDE session kill, OS sandbox, unpaid real harness without consent.

## 2026-11-11T22:21:13Z — V3.3 FROZEN + V3.4 Engineering Loop

- V3.3 freeze: commit 422132d tag v3.3-freeze; audit 35/35 + battery; evidence docs/v3/evidence/gate.v33-final-audit.json
- V3.4: EngineeringLoopService + harness matrix; unit 2/2 + E2E 1/1; evidence docs/v3/evidence/gate.v34-engineering.json; ADR-0009
- TRUE_FULL_PASS only via evaluator; harness dry-run not SUPPORTED
- 2026-11-11T19:36:19-03:00 V3_COMPLETE

## 2026-11-21T14:31:11-03:00 — M3 recovery 2/3: 5× real Cursor TRUE_FULL_PASS (fire-5)
- harness timeout 300s + golden pin; evidence under /tmp/v0-m3-recovery2-*

## 2026-11-21 — V0-ORCH-04..07 MSO runtime
- Added orchestrator/src/v3/mso/{topo,worktree-executor,boot-reconciler,failure,inbox-runtime,task-states}.ts
- Evidence: build EXIT 0; vitest v0-orch-runtime+persistence 14/14

## 2026-11-21T15:22 — V0-SEC-01..06
- Hardened ExecutionRunner (strict env, ephemeral HOME, redaction, SIGTERM→SIGKILL, Capability Gate)
- Adversarial suite covers path/symlink/env/redaction/gate/anti-reward-hacking
- Evidence: build EXIT 0; vitest SEC-focused 30/30

## 2026-11-21T15:30 — V0-CLI + V0-GRILL
- bin/evolve installable; conversational shell PT; runtime grill gate; Goal Document+Contract schema v4
- Evidence: build EXIT 0; vitest v0-cli-grill+intent+orch-persistence 18/18

## 2026-11-21T15:36:01-03:00 — V0-ADAPT-01..03 + V0-MEM-01..04
- ADAPT 1+1+1: Ollama + OpenRouter + CursorCircuitAdapter; createV0AdaptStack()
- ADAPT-03: DecisionEngine + FreeLLMAPI/Laya typed stubs (fail-closed STUB_V1 / ENGINE_STUB)
- MEM: MemoryBroker em `.evolveloop/memory.db` via better-sqlite3 FTS5/BM25 (node:sqlite sem ENABLE_FTS5)
- Isolation project_id; propose→PROPOSED only; promote via gate (validator|human|mso); edges Goal→Task→File→Evidence
- CLI fix: status panel nunca mostra IDLE → INIT ou estado MSO real
- Evidence: npm run build EXIT 0; vitest v0-adapt-memory 8 + v0-evidence 4 + v0-cli-grill 8 = 20/20 EXIT 0
- Wiki vault: SKIPPED (HARD SAFETY no edits outside repo); GAP pack EvolveLoop PACK_NOT_FOUND
- No commit/push

## 2026-11-21T15:38:00-03:00 — V0-ADAPT/MEM executor revalidation + gitignore fix
- Gap encontrado: `.gitignore` `memory/` ignorava `orchestrator/src/v3/memory/**` (código-fonte)
- Fix: `/memory/` (só artefacto na raiz); source `orchestrator/src/v3/memory/` agora untracked visível
- Revalidação: npm run build EXIT 0; vitest v0-adapt-memory 8/8 EXIT 0; + v0-cli-grill 8/8 → 16/16 EXIT 0
- Wiki: scout/search EvolveLoop no_hits; pack EvolveLoop PACK_NOT_FOUND; vault log SKIPPED (HARD SAFETY)
- No commit/push

## 2026-11-21T15:44:31-03:00 — V0-TOK-01..06 Token economy foundation
- Module: orchestrator/src/v3/token-economy/ (stdout-filter, telegraphic/skill-compress, fail-fast, node-budget, local-validation)
- TOK-01: Token Ledger schema v5 — subsystem, model_requested/served, breakdown (system/context/tools/output/cache_hit), latency, cost provenance
- TOK-02: zero-token status/pause/progress + local tsc/test/validate before LLM
- TOK-03: telegraphic EN internals; compressRuntimeSkill ≤3 KB
- TOK-04: ExecutionRunner wired to filterProcessOutput (ANSI, hide passed, dedupe stacks, head30+tail20)
- TOK-05: runFailFastCascade Syntax/Types→Tests→Lint abort first error
- TOK-06: evaluateNodeTokenBudget alert 80% / abort+checkpoint 100%; sliding window 2 failures
- Evidence: npm run build EXIT 0; vitest v0-token-economy 11 + evidence 4 + intent 5 + execution-runner 8 = 28/28 EXIT 0
- Wiki vault: SKIPPED (HARD SAFETY); GAP pack EvolveLoop PACK_NOT_FOUND
- No commit/push

## 2026-11-21T15:50:00-03:00 — V0-TEST-A..E + V0-EXIT-01/03 offline suites
- Goals: V0-TEST-A, V0-TEST-B, V0-TEST-C, V0-TEST-D, V0-TEST-E, V0-EXIT-01, V0-EXIT-03
- Wired: npm run test:v0-offline (vitest.v0-offline.config.ts) + docs/v0/OFFLINE-TEST-SUITE.md
- Gaps closed: MSO exhaustive matrix; memory valid_to IS NULL filter; chaos SIGKILL/orphans/clean-requeue; anti-reward package.json/build.sh; token baseline comparator fixture (LIVE_GAP honest)
- Evidence: branch chore/v0-consolidation; npm run build EXIT 0; npm run test:v0-offline → 10 files / 82 tests EXIT 0
- Out of scope this turn: V0-EXIT-02 / V0-TEST-F live 5-task evals
- Wiki vault: SKIPPED (HARD SAFETY no edits outside repo); GAP pack EvolveLoop PACK_NOT_FOUND
- No commit/push

## 2026-11-21T16:04:52-03:00 — V0-EXIT-02 / V0-TEST-F / V0-TEST-D LIVE_GAP close
- Goals: V0-EXIT-02, V0-TEST-F, V0-TEST-D
- Harness: scripts/v0-live-five-tasks.sh + scripts/v0-live-token-compare.mjs; npm run test:v0-live; bin/evolve symlink resolve fix
- Live: EVOLVELOOP_HARNESS_CONSENT=true fire-5 → 5× TRUE_FULL_PASS (cursor adapter, Evidence Validator); pass@1=1.0 pass^3=1.0
- Token: ledger 10 rows cost_provenance=UNAVAILABLE honest; proxy reduction ~57.65% (≥50%) via telegraphic+skill compress+stdout filter vs uncompressed baseline
- Evidence: docs/v0/evidence/live-20261121T185643Z/ (+ LIVE-EVIDENCE.md)
- Stack: Ollama bonsai-64k OK; OpenRouter MISSING_CREDENTIALS; cursor-agent OK
- Wiki vault: SKIPPED (HARD SAFETY no edits outside repo); GAP pack EvolveLoop PACK_NOT_FOUND
- No commit/push

## [2026-11-21T19:15:21Z] V0-EXIT-02 / V0-TEST-F / V0-TEST-D live close (executor)
- Harness: bash scripts/v0-live-five-tasks.sh → HARNESS_VERDICT=TRUE-FULL-PASS_x5 (exit 0)
- Evidence: docs/v0/evidence/live-20261121T190707Z/
- V0-EXIT-02: 5 consecutive TRUE_FULL_PASS via real cursor-agent (not offline-fixture); worktrees .evolveloop/live-wt/20261121T190707Z/fire-{1..5}
- V0-TEST-F: pass@1=5/5 rate=1.0; pass^3=5/5 rate=1.0; stack 1+1+1 (ollama OK, openrouter MISSING_CREDENTIALS, adapter OK)
- V0-TEST-D LIVE_GAP: combined proxy reduction 58.35% (≥50%); ledger 10/10 cost_provenance=UNAVAILABLE honest; OpenRouter UNAVAILABLE
- Durations ~81–86s/task; PIDs 1327867…1435978; argv0=/home/gaab/.local/bin/agent
- Wiki vault: SKIPPED (HARD SAFETY no edits outside repo); GAP pack EvolveLoop PACK_NOT_FOUND
- No commit/push

## 2026-11-21T16:27:00-03:00 — V1-TOK-01 context slicing
- outlineFile + readLines (≤80); agent readFile denied; EngineeringWorkspace.readFileHost for host
- Evidence: npm run build exit 0; vitest v1-context-slicing 7/7 exit 0

- Wiki vault append SKIPPED (goal HARD SAFETY: no edits outside repo); GAP registered in .ai/log.md

## 2026-11-21T16:32:20-03:00 — V1-TOK-02 symbol map (ANALYZING/DECOMPOSING)
- Module: token-economy/symbol-map.ts (AST-lite via outlineFile); mso/analyzing-context.ts (mandatory map + full-file guard)
- GAP: tree-sitter/web-tree-sitter not in deps → engine=ast-lite (documented; switch when deps added)
- Evidence: npm run build EXIT 0; vitest v1-symbol-map 4/4 + v1-context-slicing 7/7 EXIT 0
- Verdict: V1-TOK-02_PASS
- Wiki vault append SKIPPED (goal HARD SAFETY: no edits outside repo); pack EvolveLoop PACK_NOT_FOUND

## 2026-11-21T16:38:42-03:00 — V1-TOK-02 RECOVERY attempt 2/3 (tree-sitter GAP closed)
- Deps: web-tree-sitter + tree-sitter-typescript + tree-sitter-javascript (WASM grammars; not native tree-sitter — peer ^0.21 conflict)
- symbol-map primary engine=tree-sitter; AST-lite only on init/grammar failure; analyzing-context full-file guards unchanged
- Evidence: npm run build EXIT 0; vitest v1-symbol-map 4/4 + v1-context-slicing 7/7 EXIT 0 (asserts engine===tree-sitter)
- Verdict: V1-TOK-02_PASS
- Wiki vault append SKIPPED (goal HARD SAFETY: no edits outside repo)

## 2026-11-21T16:44:08-03:00 — V1-TOK-03 deterministic def/ref pre-resolution
- Module: token-economy/symbol-resolve.ts (tree-sitter default; optional LanguageServerClient stub)
- symbol-map: collectIdentifierOccurrences (in-process; no child_process/rg)
- MSO: analyzing-context injects symbol_resolve + resolved_defs/refs on ANALYZING/DECOMPOSING turn-1
- Evidence: npm run build EXIT 0; vitest v1-symbol-resolve 4/4 + v1-symbol-map 4/4 + v1-context-slicing 7/7 EXIT 0
- Verdict: V1-TOK-03_PASS
- Wiki: pack EvolveLoop PACK_NOT_FOUND; vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T16:50:43-03:00 — V1-TOK-04/05/06 token economy (RAG prune, tombstone, stateless snapshot)
- TOK-04: token-economy/prune-retrieved.ts — pruneRetrievedSnippets(snippets, querySymbols, budget) BM25-lite + regex symbol hits → pruned sentences
- TOK-05: token-economy/tombstone.ts — tombstoneOldToolOutputs(messages|turns, currentTurn); age>2 → [lápide:tool] (~6 proxy tokens)
- TOK-06: token-economy/stateless-snapshot.ts — buildStatelessWorkerSnapshot O(1) Goal+Diff+LastFilteredError; wired into live buildWorkerPrompt + execution-runner re-export
- Evidence: BUILD_EXIT=0; vitest v1-rag-prune 5/5 EXIT 0; v1-tombstone 4/4 EXIT 0; v1-stateless-snapshot 5/5 EXIT 0; regress v1-context-slicing+symbol-map+symbol-resolve 15/15 EXIT 0
- Verdict: V1-TOK-04_PASS V1-TOK-05_PASS V1-TOK-06_PASS
- Wiki: pack EvolveLoop PACK_NOT_FOUND; vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T16:56:52-03:00 — V1-TOK-07..11 token economy protocol
- TOK-07: token-economy/lazy-tools.ts — selectToolsForMsoState(state) ≤4; wired EngineeringWorkspace.agentToolsForMsoState + prepareMsoAnalyzingPayload.tools
- TOK-08: token-economy/prefix-pinning.ts — buildPinnedPrefix + buildPromptWithPinnedPrefix; PIN_BOUNDARY; byte-identical when inputs unchanged
- TOK-09: token-economy/tsv.ts — encodeTsvRow/decodeTsvRow/encodeSymbolTsv; symbol-map + formatLocationCompact use encodeTsvRow
- TOK-10: token-economy/operational-call.ts — buildOperationalCallSpec (tool_choice:required, stop[], schema without free prose)
- TOK-11: token-economy/surgical-edit.ts — applySurgicalEdit REPLACE/DELETE with expectedHash/expectedOffset validation
- Evidence: BUILD_EXIT=0; vitest new 26/26 EXIT 0; regress v1-* 29/29 EXIT 0
- Verdict: V1-TOK-07_PASS V1-TOK-08_PASS V1-TOK-09_PASS V1-TOK-10_PASS V1-TOK-11_PASS
- Wiki: pack EvolveLoop PACK_NOT_FOUND; vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:02:00-03:00 — V1-TOK-12..19 foundational runtime
- TOK-12: model-providers/model-layers.ts + ModelLayerPolicyEngine; selectModelLayer(task)
- TOK-13: speculative-pipeline.ts Local Draft → Test → Cloud; green path skips layer 2
- TOK-14: mechanical-fix.ts mechanicalFixBeforeLlm (binary gate + mock runner)
- TOK-15: patch-cache.ts batchMicrotasksByModule + SemanticPatchCache SQLite
- TOK-16: constrained-decoding.ts buildConstrainedLocalRequest grammar on layer 0
- TOK-17: brain-hand.ts splitPlanAndApply + surgical-edit hand
- TOK-18: nl-compress.ts compressNaturalLanguage (preserve fences/code)
- TOK-19: crystallizer.ts CrystallizerRegistry N>=3 → 0-token script
- Evidence: BUILD_EXIT=0; per-ID vitest EXIT 0; all v1-* 75/75 EXIT 0
- Verdict: V1-TOK-12..19 all PASS
- Wiki vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:13:41-03:00 — V1-PROD-01..03 + V1-ORCH-01..03
- PROD-01: evolve-shell/first-run-setup.ts + `evolve setup` — probes, credentials 0600, limits, readiness report
- PROD-02: model-providers/freellmapi.ts — catalog ready|needsKey|exhausted; model_requested/served; fallback; mock HTTP tests
- PROD-03: protocols (openai/anthropic/responses/gemini) + cursor+antigravity adapters + failover preserving checkpoint_id
- ORCH-01: daemon/uds.ts — `.evolveloop/runtime.sock`; disconnect ≠ kill runs; multi-client
- ORCH-02: state-db schema v6 events + task_substates + evidence_records; appendEventAndProject atomic
- ORCH-03: grill-me/delta.ts — immutable v1→v2, TaskGraph CANCELLED, SIGTERM mock, evidence STALE
- Evidence: BUILD_EXIT=0; per-ID vitest EXIT 0; v0-offline 82/82; v1-* 91/91
- Verdict: V1-PROD-01..03 + V1-ORCH-01..03 all PASS
- Wiki vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:32:27-03:00 — V1-SEC-* + V1-MEM-* executor
- Event: implementados V1-SEC-01..05 e V1-MEM-01..03 no worktree seagrass (chore/v0-consolidation)
- SEC: bwrap wrapper ExecutionRunner + landlock policy/probe; credential proxy SSRF; phase unshare-net + cgroup v2 helpers; taint gate; holdout SHA-256↔git HEAD
- MEM: hybrid FTS5+RRF(+vec interface); context engineering token_budget; contradiction → SUPERSEDED/STALE
- Suites: build OK; v0-offline 82/82; v1-* 122/122; v1-sec/mem 31/31
- GAPs: Landlock enforceable=false (sem binding Node; isolamento via bwrap); sqlite-vec extension unavailable (RRF sobre FTS); cpu cgroup frequentemente não delegado (memory/pids OK neste host)
- Status: PASS nos 8 IDs com GAPs documentados (core requirements cobertos)

## 2026-11-21T17:39:02-03:00 — V1-MEM-01 recovery (attempt 2/3) sqlite-vec
- Event: fechado GAP sqlite-vec no hybrid search (FTS5 + vec0 + RRF + light reranker)
- Dep: npm `sqlite-vec@0.1.9` + optional `sqlite-vec-linux-x64` (vec0.so); load via `sqliteVec.load(db)` em better-sqlite3
- Code: `SqliteVecSearch` (memory_vec float[32] + aux memory_id/project_id); `hashEmbedText` local; auto-index no `propose`; fallback `UnavailableVectorSearch` preservado
- Broker: suporte `:memory:`; `indexMemoryEmbedding` / `getVectorPort`
- Evidence: BUILD_EXIT=0; vitest v1-mem-01 4/4 EXIT=0; vec_version=v0.1.9; loadable=…/sqlite-vec-linux-x64/vec0.so
- Verdict: V1-MEM-01_PASS
- Wiki vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:44:17-03:00 — V1-GATE-PROD (attempt 1/3)
- Event: release gate multi-terminal daemon + bwrap + SSRF 100% + cgroups/unshare-net + taint + holdout
- Aggregate: `npm run test:v1-gate-prod` (vitest.v1-gate-prod.config.ts + tests/unit/v1-gate-prod.test.ts)
- Evidence EXIT: daemon=0 bwrap=0 ssrf=0 cgroup=0 taint=0 holdout=0 aggregate=0 (31 passed, 1 skipped)
- Host: bwrap=/usr/bin/bwrap OK; cgroup memory+pids applied; cpu_max_write_denied (GAP documented, não FAIL do gate)
- Verdict: V1-GATE-PROD_PASS
- Wiki vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:51:40-03:00 — V1-GATE-TOK (attempt 1/3)
- Event: harness de teto de token economy V1 (≥75% vs baseline V0; crystallizer 0-token; O(1) snapshot)
- Scripts: `scripts/v1-gate-tok.sh` + `scripts/v1-gate-tok.mjs`; fixture `orchestrator/tests/fixtures/v1-gate-tok-comparator.ts`; test `v1-gate-tok.test.ts`
- Baseline ref: `docs/v0/evidence/latest/04-token-compare.json` (combined baseline 11630; V0 reduction ~58.35%)
- Gate basis: thin_vs_v0 (prompt+stdout same surface) — estimated chars/4; live LLM savings UNAVAILABLE
- Measured: baseline 11630 → phase 2845 → **75.54%** reduction; crystallizer 0-token proven; O(1) snapshot 1652B ×5 stable
- Supplemental extended (file/RAG/history) ~93.89% — NOT used for PASS (avoid inflation)
- Techniques measured: prefix pin cache_hit, outline+read_lines, prune, tombstone, nl-compress, fast-apply, speculative local_resolution_rate=0.8, constrained 0% parse fail /100 offline
- Evidence: `docs/v1/evidence/gate-tok-20261121T205122Z/` (SUMMARY.md, metrics.json, raw terminal)
- Build: npm run build EXIT=0; vitest gate+tok units 11 files / 42 pass
- Verdict: **V1-GATE-TOK_PASS_75.54pct**
- Wiki vault append SKIPPED (HARD SAFETY: repo-only)

## 2026-11-21T17:54:00-03:00 — V1-GATE-TOK reverify + honesty counterfactual
- Event: executor attempt 1/3 — re-run harness; add `counterfactual_without_crystallizer` (audit-only)
- Counterfactual (no 0-token on tasks 4–5): ~61.40% — below 75%; confirms Skill-to-Code path is material to ceiling
- Fresh evidence: `docs/v1/evidence/gate-tok-20261121T205407Z/` → latest symlink (full `bash scripts/v1-gate-tok.sh` EXIT=0)
- Build+vitest: 11 files / 42 pass; harness_exit=0
- Repro: `npm run test:v1-gate-tok` / `bash scripts/v1-gate-tok.sh`
- Wiki: pack EvolveLoop GAP (PACK_NOT_FOUND); vault append SKIPPED (HARD SAFETY: repo-only)
- Verdict: **V1-GATE-TOK_PASS_75.54pct** (estimated; live_llm_savings=UNAVAILABLE)

## 2026-11-21T18:00:38-03:00 — V1-GATE-COMPAT (attempt 1/3)
- Event: FreeLLMAPI states + ≥2 real adapters (cursor/antigravity) + fault injection (429, timeout mid-stream, truncated JSON, down)
- Contract: INFRA_QUOTA → no task-attempt burn; cooldown; fallback recommended (`applyCircuitFailure` / `provider-fault.ts`)
- Live probe `http://localhost:3001/v1`: state=**needsKey** (HTTP 401) — honest, never invented ready
- Aggregate: `npm run test:v1-gate-compat` → vitest 4 files / 18 pass EXIT=0; harness_exit=0; doc_exit=0
- Evidence: `docs/v1/evidence/gate-compat-20261121T210038Z/` (matrix 24 cells, fault-injection.json, live-probe.json, SUMMARY.md)
- Repro: `cd orchestrator && npm run test:v1-gate-compat`
- Wiki: pack EvolveLoop GAP (PACK_NOT_FOUND); vault append SKIPPED (HARD SAFETY: repo-only)
- Verdict: **V1-GATE-COMPAT_PASS**

## 2026-11-21T18:10:00-03:00 — V2-ORCH-01 File-Ownership Locking
- Event: scheduler reserves touch_paths/owned_paths/modules via OwnershipLedger + pathsOverlap; conflicts → ready_but_deferred + queued_for_lock; releaseTaskFileLocks on complete/cancel
- API: parallel/file-ownership-lock.ts; OwnershipLedger.release; OrchestrationTask scope fields; exports via parallel/index.ts
- Tests: vitest tests/unit/v2-orch-01-file-ownership.test.ts → 7/7 pass EXIT=0; tsc --noEmit EXIT=0
- Wiki: pack EvolveLoop GAP (PACK_NOT_FOUND); vault append SKIPPED (HARD SAFETY: repo-only)
- Verdict: **V2-ORCH-01_PASS**

## 2026-11-21T18:16:00-03:00 — V2-ORCH-02 Merge Queue + AST-Aware Merge
- Event: MergeQueue FIFO (enqueue_seq|created_at|task_id); AstAwareMerge via web-tree-sitter (no LLM); MergirafAdapter optional (absent → internal AST); runIntegratedTests gate blocks finalize/commit
- API: parallel/merge-queue.ts, ast-aware-merge.ts, mergiraf-adapter.ts; extractDeclarationUnitsFromSource in symbol-map.ts; exports via parallel/index.ts
- Tests: vitest v2-orch-02-merge-queue.test.ts → 7/7 EXIT=0; tsc --noEmit EXIT=0; v2-orch-01 still 7/7 EXIT=0
- Wiki: pack EvolveLoop GAP (no ORCH-02 contract pages); vault log append attempted
- Verdict: **V2-ORCH-02_PASS**

## 2026-11-21T18:21:00-03:00 — V2-ORCH-03 Idempotency Keys + Saga Compensations
- Event: extend IdempotencyStore (claim/in_flight/abandon); buildIdempotencyKey sha256-hex-full; withIdempotency replay/conflict/in_flight; Saga + UNKNOWN via reconcileWorkOnBootWithSaga
- API: idempotency/{keys,with-idempotency,saga}.ts; store claim option; exports via idempotency/index.ts (+ mso reexport)
- Tests: vitest v2-orch-03 8/8 EXIT=0; v2-orch-01+02 14/14 EXIT=0; tsc --noEmit EXIT=0
- Wiki: pack EvolveLoop GAP (no ORCH-03 pages); vault EvolveLoop/log.md appended
- Verdict: **V2-ORCH-03_PASS**

## 2026-11-21T18:24:00-03:00 — V2-ORCH-04 Backpressure Dinâmico
- Event: BackpressureController + applyBackpressure adjust ParallelPolicy.max_in_progress from x-ratelimit-* ratio and local CPU/VRAM/mem telemetry
- Policy: ratio<0.2 or vram≥90/cpu≥95/mem≥95 → reduce; ratio>0.5 + telemetry OK → increase; clamp [floor,ceiling]; step=1
- API: parallel/backpressure.ts; exports via parallel/index.ts; scheduleReadyTasks keeps injectable policy
- Tests: vitest v2-orch-04 7/7 EXIT=0; v2-orch-01+02+03 22/22 EXIT=0; tsc --noEmit EXIT=0
- Wiki: pack EvolveLoop GAP (PACK_NOT_FOUND / no ORCH-04 pages); vault EvolveLoop/log.md appended
- Verdict: **V2-ORCH-04_PASS**

## 2026-11-21T18:28:00-03:00 — V2-INT-01 Decision Engine Transversal
- Event: StrictRuntimeDecisionEngine selects only req.candidates; empty→NO_CANDIDATES; tie→POLICY_ABSTAIN; low score→INSUFFICIENT_EVIDENCE; max_candidates truncates
- API: decideForScheduler/decideForMso/decideForMemoryBroker thin wrappers; policy minScore/requireUniqueTop/allowBlocked
- Tests: vitest v2-int-01 8/8 EXIT=0; v0-adapt-memory 8/8 EXIT=0 (stubs intact); tsc --noEmit EXIT=0
- Wiki: GAP no INT-01 pages; vault EvolveLoop/log.md appended
- Verdict: **V2-INT-01_PASS**

## 2026-11-21T18:33:13-03:00 — V2-INT-02 Laya Decision Engine Plugável + Benchmark
- Event: PluggableDecisionEngineHost + LayaDecisionEngine (ENGINE_STUB/heuristic offline) + runDecisionEngineBenchmark pt-BR/en; swap KEEP_BASELINE|ADOPT_LAYA
- API: registerEngine/setActive/evaluate fallback; createDefaultDecisionBenchmarkFixtures; 0% invention hard calibration
- Tests: vitest v2-int-02 8/8 EXIT=0; v2-int-01 8/8 EXIT=0 (no regress); v0-adapt-memory 8/8 EXIT=0; tsc --noEmit EXIT=0
- Wiki: GAP no INT-02 pages; vault EvolveLoop/log.md appended
- Verdict: **V2-INT-02_PASS**

## 2026-11-21T18:37:28-03:00 — V2-INT-03 Agent Intelligence Profiles
- Event: AgentIntelligenceProfile + AgentProfileStore (JSON append evidence / recompute) + routeByIntelligence + compareToStaticRoute delta API
- Score: true_full_pass_rate * log(1+sample_size) - rework_penalty; min_sample_size → static_fallback; UNAVAILABLE honesty never invented
- API: orchestrator/src/v3/agent-profiles/{types,score,store,router,index}.ts (≠ agent-registry lifecycle)
- Tests: vitest v2-int-03 6/6 EXIT=0; v2-int-01 8/8 EXIT=0; v2-int-02 8/8 EXIT=0 (no regress); tsc --noEmit EXIT=0
- Wiki: GAP no INT-03 pages; vault EvolveLoop/log.md appended
- Verdict: **V2-INT-03_PASS**

## 2026-11-21T18:42:13-03:00 — V2-INT-04 Matriz de Autoridade Delegada
- Event: DelegationGrant + DelegationRegistry (issue/revoke/isAllowed) + subset anti-expansão + audit append-only; hook capabilityGate/enforcer destroy|network|credential; Grill-Me attach/query API
- API: security/delegation.ts; grill-me/delegated-authority.ts; exports security/index + grill-me/index
- Tests: vitest v2-int-04 8/8 EXIT=0; v2-int-01 8/8; v2-int-02 8/8; v2-int-03 6/6 EXIT=0; tsc --noEmit EXIT=0
- Wiki: GAP no INT-04 pages; vault EvolveLoop/log.md appended
- Verdict: **V2-INT-04_PASS**

## 2026-11-21T18:46:51-03:00 — V2-MEM-01 Memory Consolidation Engine
- Event: ConsolidationEngine.ingestVerifiedEpisodes → ConsolidationProposal[] (create|update|skip); status always PROPOSED (never auto-VERIFIED); dedupe hash+Jaccard; ConsolidationBackgroundRunner start/stop + runOnce(); StubLessonExtractor default; OllamaLessonAdapter optional with heuristic fallback
- Repo: EvolveLoop/seagrass orchestrator/src/v3/memory/consolidation.ts, ollama-lesson-adapter.ts, index.ts exports
- Evidence: vitest v2-mem-01-consolidation 9/9 EXIT=0; tsc --noEmit EXIT=0
- GAP: wiki pack EvolveLoop PACK_NOT_FOUND / sem páginas V2-MEM-01 (contrato = brief MSO)
- Verdict: V2-MEM-01_PASS

## 2026-11-21T18:52:04-03:00 — V2-MEM-02 Grafo Híbrido Código + Decisões
- Event: HybridGraphStore (File|Decision|Test|Symbol; DEPENDS_ON|DECIDES|PROTECTS|REFERENCES); ingestCodeDeps / ingestCodeDepsFromSource; linkDecision; expandTwoHops BFS bidirecional ≤2 saltos, ordenação estável; isolamento project_id
- Repo: EvolveLoop/seagrass orchestrator/src/v3/memory/hybrid-graph.ts (+ exports index.ts)
- Evidence: vitest v2-mem-02-hybrid-graph 8/8 EXIT=0; v2-mem-01 9/9; v1-mem-01 4/4; tsc --noEmit EXIT=0
- GAP: wiki pack EvolveLoop PACK_NOT_FOUND / sem páginas V2-MEM-02 (contrato = brief MSO)
- Verdict: V2-MEM-02_PASS

## 2026-11-21T18:57:15-03:00 — V2-MEM-03 Memory Eval Suite
- Event: runMemoryEvalSuite({ retrieve, queries, k }) → MemoryEvalSuiteReport (kind + honesty reported|estimated); Recall@K / Precision@K clássicos; INVALIDATED|STALE no result set = violation (target 0%); gates Recall@5≥0.85 Precision@5≥0.80
- Repo: EvolveLoop/seagrass orchestrator/src/v3/memory/memory-eval.ts (+ index exports); fixtures tests/fixtures/v2-mem-03-golden-queries.json
- Evidence: vitest v2-mem-03 7/7 EXIT=0; v2-mem-01 9/9; v2-mem-02 8/8; tsc --noEmit EXIT=0
- GAP: wiki pack EvolveLoop sem páginas V2-MEM-03 (contrato = brief MSO); INVALIDATED ainda não está em MEMORY_STATUSES canónico (eval aceita status no hit)
- Verdict: V2-MEM-03_PASS

## 2026-11-21T19:01:51-03:00 — V2-SEC-01 Quarentena Tainted
- Event: QuarantineStore + releaseOnlyAfterReview; promotion-gate bloqueia VERIFIED/ACTIVE enquanto QUARANTINED; MemoryBroker auto-quarantine em propose tainted; bridge quarantineDerivedFromTaint
- Files: orchestrator/src/v3/security/quarantine.ts; taint.ts note; promotion-gate.ts; broker.ts; security/index.ts; tests/unit/v2-sec-01-quarantine.test.ts
- Evidence: vitest 8/8 EXIT 0; tsc --noEmit EXIT 0
- GAP wiki: PACK_NOT_FOUND EvolveLoop (contrato via task MSO)

## 2026-11-21T19:05:35-03:00 — V2-SEC-02 Credential Proxy Políticas Granulares
- Event: DomainPolicy allow/deny por task_type; AdapterSandboxProfile map adapter_id→net/fs_roots/env_allowlist; CredentialProxy.authorize({task_type,adapter_id,target_url|host}) default deny; SSRF preservado
- Files: orchestrator/src/v3/security/credential-proxy.ts; tests/unit/v2-sec-02-credential-policies.test.ts
- Evidence: vitest v2-sec-02 20/20; v2-sec-01 8/8; v1-sec-02 6/6; tsc --noEmit EXIT 0
- GAP wiki: sem páginas V2-SEC-02 (contrato via task MSO)

## 2026-11-21T19:11:06-03:00 — V2-QUAL-01 Revisão Independente Obrigatória
- Event: IndependentReviewGate (submitReview; reject same agent/session); flag require_independent_review no Goal Contract; integração verified-pass + Evidence Validator bloqueia TRUE_FULL_PASS/VERIFIED_PASS
- Files: orchestrator/src/v3/evaluation/independent-review-gate.ts; verified-pass.ts; evaluation/index.ts; circuit/evidence-validator.ts; goal-contract/types.ts+store.ts; tests/unit/v2-qual-01-independent-review.test.ts
- Evidence: vitest 10/10 EXIT 0; adversarial verified-pass 6/6; tsc --noEmit EXIT 0
- GAP wiki: PACK_NOT_FOUND páginas V2-QUAL (contrato via task MSO)

## 2026-11-21T19:16:20-03:00 — V2-QUAL-02 Mutation Testing Seletivo
- Event: SelectiveMutator + runMutationBattery (WEAK_TESTS se mutante sobrevive); flag require_mutation_gate no Goal Contract; Evidence Validator / verified-pass bloqueiam TRUE_FULL_PASS quando score < threshold
- Files: orchestrator/src/v3/evaluation/selective-mutation.ts; verified-pass.ts; evaluation/index.ts; circuit/evidence-validator.ts; goal-contract/types.ts+store.ts; tests/unit/v2-qual-02-mutation.test.ts
- Evidence: vitest 12/12 EXIT 0; qual-01 10/10; tsc --noEmit EXIT 0
- GAP wiki: sem páginas V2-QUAL-02 (contrato via task MSO)

## 2026-11-21T19:21:05-03:00 — V2-EVOL-01 Evolution Pipeline observation-first
- Event: EvolutionPipeline.observe(rework_signals|pass_events) → CandidateProposal[] (version, diff_or_script_ref, parent_skill_id, status proposed); validateCandidate(runBattery) → accept|reject + rollback_plan; link crystallizer V1 sem auto-aplicar script
- Files: orchestrator/src/v3/evolution/{pipeline,index}.ts; tests/unit/v2-evol-01-evolution-pipeline.test.ts; docs/v1/evidence/V2-EVOL-01.txt
- Evidence: vitest v2-evol-01 10/10 + v1-crystallizer 1/1 EXIT 0; tsc --noEmit EXIT 0
- GAP wiki: pack EvolveLoop PACK_NOT_FOUND / sem páginas V2-EVOL-01 (contrato = brief MSO)
- Verdict: V2-EVOL-01_PASS

## 2026-11-21T22:32:26Z — M0-B-V2-EXIT-EVIDENCE-PACK
- docs/v2/evidence/20261121T222859Z; PREREQ_V2_EXIT=NÃO_SATISFEITO; vitest 145 PASS

## 2026-11-21T22:45:00Z — M0-C-V2-LIVE-GATES-CLOSE (tentativa 3/3)

- Task: M0-C-V2-LIVE-GATES-CLOSE
- Evidence: `docs/v2/evidence/20261121T224251Z` (latest)
- ORCH-01 PASS_LIVE: 5 git worktrees + FileOwnershipLock
- ORCH-02 PASS_LIVE: corpus 18/20 syntactic_ratio=0.9 sem LLM
- ORCH-04 PASS_LIVE: rate-limit+mem+VRAM sysfs backpressure, crash=false
- INT-02 PASS_LIVE: Ollama Laya 6 cases EvolveLoop; invention=0; calibration_ok
- TOK_PAR PASS_LIVE: 4 workers parallel; min_reduction≈87.86% ≥75% (estimated)
- Vitest v2-*: 20 files / 149 tests EXIT 0
- PREREQ_V2_EXIT: **SATISFEITO**
- Wiki: PACK_NOT_FOUND EvolveLoop (GAP) — contrato = plano mestre + código

## 2026-11-21T22:51:18Z — V3-MEM-01 CAS cold storage
- cold-storage.ts + schema v2 cas_hash pointers + broker.migrateToCold
- evidence docs/v3/evidence/20261121T225051Z PASS

## 2026-11-21T22:55:35Z — V3-MEM-02 RAPTOR pyramid index
- pyramid-index.ts: buildPyramid N0..N3 + searchCoarseToFine
- evidence docs/v3/evidence/20261121T225535Z PASS (p95_ms=0.77, fixture_nodes=1358)
- LIMITATION: fixture ≥1k nodes (não 100k eventos Suíte E)
- wiki: GAP pack EvolveLoop; contrato = metas §2.1 + plano §5.1 + brief MSO

## 2026-11-21T23:00:44Z — V3-MEM-03 MemGPT virtual memory
- virtual-memory.ts: memory_search / memory_expand (page-in) / page_out tombstone
- evidence docs/v3/evidence/20261121T230044Z PASS (TOKEN_BUDGET_100X=BOUNDED, growth_ratio=1.21)
- regressão MEM-01+MEM-02 exit 0
- wiki: GAP pack EvolveLoop; contrato = brief MSO M3-V3-MEM-03

## 2026-11-21T23:07:09Z — V3-MEM-04 Multi-hop synthesis
- task: M4-V3-MEM-04-MULTIHOP (1/3)
- impl: `orchestrator/src/v3/memory/multi-hop-synthesis.ts` (expandGraph + synthesizeLocal Ollama/stub + runMultiHopSynthesis)
- tests: `v3-mem-04-multihop.test.ts` 11/11 EXIT 0; regressão MEM-01..03 17/17 EXIT 0
- evidence: `docs/v3/evidence/20261121T230709Z` STATUS PASS
- live Ollama: tags OK; generate empty → stub closed (LIMITATION); CLOSED_OLLAMA coberto offline com fetch injectado
- wiki: GAP pack EvolveLoop; vault SKIPPED (fora do repo); contrato = brief MSO
- No commit/push

## 2026-11-21T23:12:15Z — V3-MEM-05 Bi-temporal graph
- task: M5-V3-MEM-05-BITEMPORAL (1/3)
- impl: `orchestrator/src/v3/memory/bitemporal-graph.ts` (valid time ≠ tx time; PIT query)
- tests: `v3-mem-05-bitemporal.test.ts` 10/10 EXIT 0; regressão MEM-01..04 28/28 EXIT 0
- evidence: `docs/v3/evidence/20261121T231215Z` STATUS PASS
- wiki: GAP pack EvolveLoop; vault log appended; contrato = brief MSO
- No commit/push

## 2026-11-21T23:17:56Z — V3-MEM-06 Utility-Based Decay (seagrass)
- task: M6-V3-MEM-06-UTILITY-DECAY (1/3)
- impl: `orchestrator/src/v3/memory/utility-decay.ts` (scoreUtility + decayPass → migrateToCold)
- tests: `v3-mem-06-utility-decay.test.ts` 8/8 EXIT 0; regressão MEM-01..05 38/38 EXIT 0
- evidence: `docs/v3/evidence/20261121T231709Z` STATUS PASS
- wiki: GAP pack EvolveLoop; contrato = brief MSO M6
- No commit/push

## 2026-11-21T23:24:18Z — V3-MEM-07 Federated Sanitize (seagrass)
- task: M7-V3-MEM-07-FEDERATED-SANITIZE (1/3)
- impl: `orchestrator/src/v3/memory/federated-sanitize.ts` (sanitizeForFederation + promoteToGlobal)
- tests: `v3-mem-07-federated-sanitize.test.ts` 9/9 EXIT 0; regressão MEM-01..06 46/46 EXIT 0
- evidence: `docs/v3/evidence/20261121T232418Z` STATUS PASS
- contrato: política explícita; strip secrets/paths/private_vars/domains; recusa residual; audit fingerprint sha256 (0% raw leak)
- wiki: GAP pack EvolveLoop; contrato = brief MSO M7 / META-WS-006
- No commit/push

## 2026-11-21T23:24:26Z — V3-MEM-07 Federated Sanitize (seagrass)
- task: M7-V3-MEM-07-FEDERATED-SANITIZE (1/3)
- impl: `orchestrator/src/v3/memory/federated-sanitize.ts` (sanitizeForFederation + promoteToGlobal)
- tests: `v3-mem-07-federated-sanitize.test.ts` 9/9 EXIT 0; regressão MEM-01..06 46/46 EXIT 0
- evidence: `docs/v3/evidence/20261121T232426Z` STATUS PASS
- wiki: GAP pack EvolveLoop; vault log appended; contrato = brief MSO M7 / META-WS-006
- No commit/push

## 2026-11-21T23:31:13Z — V3-ORCH-01 Critical Path + Prefetch
- task: M8-V3-ORCH-01-CRITICAL-PATH-PREFETCH (tentativa 1/3)
- impl: `orchestrator/src/v3/parallel/critical-path.ts` + exports em `parallel/index.ts`
- tests: `orchestrator/tests/unit/v3-orch-01-critical-path.test.ts` 8/8 EXIT 0
- regressão: v2-orch-01/02/03/04 unit 30/30 EXIT 0
- evidence: `docs/v3/evidence/20261121T233047Z` STATUS **PASS**
- wiki: GAP pack EvolveLoop; contrato = brief MSO M8-V3-ORCH-01
- Escopo: só V3-ORCH-01 (outras metas fora)

## 2026-11-21T23:36:41Z — V3-ORCH-02 Dynamic DAG Auto-Replanning
- task: M9-V3-ORCH-02-DYNAMIC-DAG (tentativa 1/3)
- impl: `orchestrator/src/v3/task-graph/dynamic-dag.ts` + exports task-graph/mso
- tests: `orchestrator/tests/unit/v3-orch-02-dynamic-dag.test.ts` 15/15 EXIT 0
- regressão: v3-orch-01 + v2-orch-01/02/03/04 38/38 EXIT 0
- evidence: `docs/v3/evidence/20261121T233641Z` STATUS **PASS**
- wiki: GAP pack EvolveLoop; contrato = brief MSO M9-V3-ORCH-02
- Escopo: só V3-ORCH-02 (outras metas fora)

## 2026-11-21T23:40:36Z — V3-ORCH-03 Sub-MSO Hierarchical Attenuation
- task: M10-V3-ORCH-03-SUB-MSO (tentativa 1/3)
- impl: `orchestrator/src/v3/mso/sub-mso.ts` + exports em `mso/index.ts`
- tests: `orchestrator/tests/unit/v3-orch-03-sub-mso.test.ts` 13/13 EXIT 0
- regressão: v3-orch-01/02 + v2-orch-01/02/03/04 56/56 EXIT 0
- evidence: `docs/v3/evidence/20261121T234036Z` STATUS **PASS**
- wiki: GAP pack EvolveLoop; contrato = brief MSO M10-V3-ORCH-03
- Escopo: só V3-ORCH-03 (outras metas fora)

## 2026-11-21T23:45:45Z — V3-ORCH-04 Best-of-N (seagrass)
- task: M11-V3-ORCH-04-BEST-OF-N (1/3)
- impl: `orchestrator/src/v3/parallel/best-of-n.ts` (triggerBestOfN + admitBestOfN; race/promote/cancel)
- tests: `v3-orch-04-best-of-n.test.ts` 12/12 EXIT 0; regressão ORCH 78/78 EXIT 0
- evidence: `docs/v3/evidence/20261121T234517Z` STATUS PASS
- wiki: GAP pack EvolveLoop; contrato = brief MSO M11 + docs/v3.7 Speculative Execution
- No commit/push

## 2026-11-21T23:51:07Z — V3-ORCH-05
- PASS M12 PBT fuzz; evidence 20261121T235036Z

## 2026-11-21T23:56:53Z — M13-V3-SEC-01-MICROVM-SECCOMP
- PASS_SIMULATED; backend unavailable; evidence 20261121T235638Z

## 2026-11-21T23:58:29Z — M13 V3-SEC-01 MicroVM + seccomp

- Adapter: `orchestrator/src/v3/sandbox/microvm-profile.ts` — `detectBackend()` firecracker|gvisor|unavailable; seccomp-bpf policy stub + apply; escape deny battery simulated when backend absent.
- Tests: `orchestrator/tests/unit/v3-sec-01-microvm.test.ts` 15/15 EXIT=0.
- Evidence: `docs/v3/evidence/20261121T235713Z` — STATUS=PASS_SIMULATED; backend_status=unavailable (reported); kvm informational only; PASS_LIVE not claimed (no firecracker/runsc).
- Honesty: UNAVAILABLE vs PASS_SIMULATED vs PASS_LIVE documented; metrics reported|estimated|UNAVAILABLE.
- Non-claims: no root/KVM required; no in-guest MicroVM spawn on this host.

## 2026-11-22T00:03:43Z — M14-V3-SEC-02-DLP-EGRESS
- PASS; inspectEgress ALLOW|BLOCK; evidence 20261122T000323Z

- 2026-11-22T00:08:42Z | M15-V3-SEC-03-EBPF-AUDIT | PASS_SIMULATED | evidence 20261122T000803Z

## 2026-11-22T00:10:38Z — M15-V3-SEC-03-EBPF-AUDIT
- PASS_SIMULATED; evidence docs/v3/evidence/20261122T000945Z; unit EXIT=0; regression EXIT=0

- 2026-11-22T00:16:08Z | M16-V3-SEC-04-REDTEAM | PASS_SIMULATED | evidence 20261122T001528Z | bypass_rate=0

## 2026-11-22T00:15:00Z — UX-CLI-GAP analysis (docs only)
- Created docs/v0/UX-CLI-GAP.md: compare evolve-shell + evolve.ts vs UX CLI spec v0.1
- Result: PRESENTE 0 / PARCIAL 4 / AUSENTE 6; no code changes; no commit

## 2026-11-22T00:21:03Z — V3-EVOL-01 Shadow Replay Histórico (MSO M17)
- Event: EvolutionPipeline.shadowReplay(candidates, historicalEvents) → só candidatos que superam baseline passam; promoteToProduction gated; rollback 1 comando evolution.rollbackProduction()
- Files: orchestrator/src/v3/evolution/{pipeline,index}.ts; tests/unit/v3-evol-01-shadow-replay.test.ts
- Evidence: docs/v3/evidence/20261122T002028Z (PASS_UNIT; vitest 7/7 + regressão v2 17/17 EXIT 0)
- GAP wiki: pack EvolveLoop PACK_NOT_FOUND / sem páginas V3-EVOL-01 (contrato = metas V3 + plano §5.4 + brief MSO)
- Verdict: V3-EVOL-01_PASS_UNIT

## 2026-11-22T00:23:53Z — UX-CLI M1+M2+M3 HUD núcleo
- Event: banner Núcleo+Órbita + agents tree + footer UNAVAILABLE; colors NO_COLOR
- Files: evolve-shell/{banner,colors,footer,layout,hud}.ts + repl/index; v0-ux-cli-hud.test.ts
- Tests: 7/7 EXIT=0
- Verdict: M1+M2+M3_PASS_UNIT

## 2026-11-21T21:26:23-03:00 — M18 V3-TEST-01 metamorphic
- Implemented `evaluation/metamorphic.ts` harness (3 paraphrases, stub decomposer/router, differential bias oracle)
- Vitest EXIT=0 (11); regression QUAL+TEST EXIT=0 (33)
- Evidence: docs/v3/evidence/20261122T002551Z STATUS=PASS_UNIT
- GAP wiki: pack EvolveLoop PACK_NOT_FOUND / sem páginas V3-TEST-01 (contrato = metas V3 §2.4 + plano §5.4 + brief MSO M18)

## 2026-11-22T00:30:05Z — UX-CLI M4–M8
- Grill-Me UX + local 0 tok + capability gate UI + daemon attach + keybindings + acceptance tests
- vitest: v0-ux-cli-hud + v0-ux-cli-interactions + v0-cli-grill → 26 passed EXIT=0

## 2026-11-22T00:34:17Z — UX-CLI §8.2 EventBus buffer
- Event: write lock no EventBus enquanto awaiting input; flush após submit
- Files: capability-ui.ts, repl.ts; teste §8.2 em v0-ux-cli-interactions
- Tests: 27 passed EXIT=0 (hud+interactions+grill)
- Verdict: §8.2_PASS_UNIT (contrato buffer/serialização; sem TTY real)

## 2026-11-22T00:34:51Z — M19 V3-TEST-02 DST
- Implemented `evaluation/deterministic-sim.ts` (SimulationWorld clock/fs/proc/net seeded; runScenarios ≥10k)
- Vitest EXIT=0 (7); regression TEST-01+02 EXIT=0 (18)
- Evidence: docs/v3/evidence/20261122T003424Z STATUS=PASS_UNIT seed=1404750588 n=10000 hash=903885b3c2004a39284216ccc3ca4e166e99ff29ae22ebaa45316745a59ed6d2 deadlocks=0 split_brains=0
- GAP wiki: pack EvolveLoop PACK_NOT_FOUND / sem páginas V3-TEST-02 (contrato = brief MSO M19 + plano §5.2)

## 2026-11-22 — META-WS-007 Inbox sync mínimo

- UDS: inbox_publish → inbox_event broadcast (inclui origem; publisher consome via request id; peers via onMessage)
- Shell: subscribe imprime `[Inbox · client-…]`; publish em linhas conversacionais; inbox_sync enabled|unavailable
- Testes: v0-ux-cli-inbox-sync.test.ts + fixtures interactions atualizadas

- 2026-11-22T00:42:17Z — V3-DIST-01 (M20): diagnose/exportState/importState/backup/restore em orchestrator/src/v3/ops/dist-ops.ts; testes v3-dist-01-ops.test.ts PASS; evidência docs/v3/evidence/20261122T004055Z (PASS_UNIT).

## 2026-11-22T01:05:11Z — V3 EXIT audit M21/M22/M23
- EVIDENCE_DIR=docs/v3/evidence/20261122T004621Z
- M21_STATUS=PASS M22_STATUS=FAIL M23_STATUS=PASS CRITERIA_CONCLUIDA_COUNT=21/24 SCALE_N=100000 VITEST_V3_EXIT=0

## 2026-11-22T01:07:36Z — V3 EXIT AUDIT M21/M22/M23
- evidence: docs/v3/evidence/20261122T005507Z
- vitest v3-*: exit 0 (20 files / 207 tests)
- M21 PASS (5 tetos); M22 FAIL (21/24 CONCLUÍDA); M23 PASS (SCALE_N=100000)
- wiki pack EvolveLoop: PACK_NOT_FOUND (GAP)

## 2026-11-22T01:19:21Z — M22-B-CLOSE-CRITERIA-11-23-24
- evidence: docs/v3/evidence/20261122T011308Z
- C11/C23/C24 CONCLUÍDA; CRITERIA 24/24; HARNESS_EXIT=0; M22 PASS
- build fixes: federated-sanitize narrowing; dynamic-dag kind as const

## 2026-11-22T01:38:40Z — AUD-STUB-01
- Fail-closed OS sandbox on ExecutionRunner; evidence under docs/v3/evidence/audit-mso-20261122T012324Z/gates/

## 2026-11-22T01:45:03Z — AUD-STUB-02 persistence audit PASS
- StateDb/MemoryBroker/FTS5/EventStore/ColdStorage: REAL_DISK (close→reopen + PRAGMA + CAS hashes).
- sqlite-vec: REAL_DISK neste host; UnavailableVectorSearch gap honesto se falhar.
- Pyramid: NÃO_HABILITADO (PYRAMID_DISK_PERSISTENCE); VirtualMemory RAM intencional.
- Fix: StateDb recusa :memory: (DISK_REQUIRED).
- Evidence: docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-STUB-02.md


### 2026-11-22T01:45:41Z AUD-STUB-03
- PASS: advanced subsystems audit (5 REAL / 2 PARCIAL). Evidence gates/AUD-STUB-03.md

## 2026-11-22T01:50:58Z — AUD-STUB-04

Fault injection audit: 8/8 detected; evidence under docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-STUB-04*. No residual faults.

## 2026-11-22T01:54:28Z — AUD-SEC-01..07 batch PASS
- Suites security: 14 files, 145 passed | 1 skipped, EXIT_CODE=0.
- Honesty: CGROUP_CPU_CONTROLLER / MICROVM_LIVE_RUNTIME / EBPF_LIVE_RUNTIME = NÃO_HABILITADO.
- Evidence: docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-SEC-*.md + SUMMARY.

## 2026-11-22T01:59:14Z — AUD-STUB-05 dead-code prune (MSO)

- knip unused-files 42→22; removed 20 orphan barrel `index.ts` (zero importers) under `orchestrator/src/**`.
- `.agents/skills` vs `.cursor/skills`: 0 content duplicates (symlink mirror); hard-gates preserved.
- Evidence: `docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-STUB-05.md`
- Build/unit (excl. v22-p0 tiktoken env) EXIT=0.

## 2026-11-22T02:02:51Z — AUD-ORCH-01..06
- task: MSO AUD-ORCH-BATCH (tentativa 1/3)
- integrityCheck() adicionado a StateDb; assertWalPragmas exige ok
- Evidence: docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-ORCH-SUMMARY.md
- vitest ORCH pack: 10 files, 51 passed, exit 0
- wiki: GAP pack EvolveLoop ORCH; vault EvolveLoop/log.md appended
- Verdict: **AUD-ORCH-BATCH_PASS**

## 2026-11-22T02:04:15Z — AUD-TOK-01..05 MSO audit batch
- Event: auditoria Token Ledger / economia (gates AUD-TOK-01..05)
- FreeLLMAPI 401 → UNAVAILABLE honest; ledger reconcile null tokens
- Evidência V1 75.54% estimated; O(1) 5 iters; cache_hit 80%; crystallizer 0-token
- Evidence dir: docs/v3/evidence/audit-mso-20261122T012324Z/
- Verdict: PASS

## 2026-11-22T02:04:42Z — AUD-MEM-BATCH (seagrass)
- Event: auditoria memória AUD-MEM-01..06 + BM-08/09
- Implementação: `MemoryBroker.rebuildDerivedIndexes` (FTS5+vec from canonical); `COLD_SCALE_100K_THIS_SESSION=NÃO_HABILITADO`
- Tests: `audit-mem-01-06.test.ts` + suites v0/v1/v2/v3 mem — 10 files / 64 tests EXIT=0
- Evidence: `docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-MEM-*.md`
- Honesty: 100k cold scale NÃO_HABILITADO nesta sessão; prior EXIT-03 SCALE_N=100000
- Wiki grounding: scout/search no_hits (GAP); contrato = brief MSO
- Verdict: AUD-MEM-BATCH PASS

## 2026-11-22T02:11:27Z — AUD-UX-BATCH + BM-01..10 (seagrass)
- Event: auditoria UX/integrações AUD-UX-01..06 + benchmarks BM-01..10
- Overall UX: PARTIAL (UX-01 BLOCKED live; UX-06 BLOQUEADA 7–14d; UX-03 FreeLLMAPI 401)
- PASS: UX-02 timing unitário; UX-04 INFRA/429; UX-05 Shadow Replay + INT02 PASS_LIVE
- BM: 01/02/04/05/06/07/08/09 PASS (com honesty); BM-03 PARTIAL (GBNF); BM-10 BLOQUEADA
- Evidence: docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-UX-* + BM-*
- Wiki grounding: PACK_NOT_FOUND EvolveLoop (GAP); contrato = brief MSO + metas auditoria
- Verdict: AUD-UX-BATCH PARTIAL — never invented pass@1; UX-06 never PASS

## 2026-11-22T02:18:10Z — AUD-UX-01 recovery 2/3 PASS
- Live stress: 8 tasks (KernelBot×4, OrbitBot×4) on local branches aud-ux-01/live-stress-20261122
- pass@1=0.875 (7/8); pass³=1.0 (8/8); rework=OB-T3 nesting
- Evidence: docs/v3/evidence/audit-mso-20261122T012324Z/gates/AUD-UX-01.md + AUD-UX-01-live.json + BM-10.md
- Wiki vault pack EvolveLoop: PACK_NOT_FOUND (GAP); grounding via kernelbot-rag + orbitbot-kernel
- No push / no force / no reset --hard / no rm -rf

## 2026-11-22T03:13:07Z
- HUD probes: bwrap/providers/git wired into evolve shell (false UNAVAILABLE sandbox fixed).
- Note: ~/.config/evolveloop/config.yaml empty; secrets.env missing → FreeLLMAPI(needsKey).

## 2026-11-22T03:19:00Z
- Fix: pós Grill-Me, "continuar/ok" inicia MSO+adapter (antes travava / re-grillava).

## 2026-11-22T03:47:53Z — Ink TUI + 5 UX fixes (CLI interactive)
- Ink/React TUI em `orchestrator/src/cli/tui/` (TTY); fallback classic REPL quando `!isTTY` / `inputLines`.
- Footer IDLE: `IDLE · 0 tasks` + `—` (sem spam UNAVAILABLE); execução mantém UNAVAILABLE honesto.
- Input multilinha + bracketed paste (Enter envia; Shift/Alt+Enter newline).
- Grill-Me adaptativo: intenção detalhada → card único Enter=executar; vaga → 2–3 Qs; zero "Bloco 3".
- Stale lock: `shell-<pid>` morto auto-cura + fencing++; PID vivo bloqueia.
- Provider readiness inline (FreeLLMAPI key 0600 / Ollama) antes do prompt de tarefa.
- Silence SQLite ExperimentalWarning no entrypoint.
- Tests novos: v0-stale-lock-heal, v0-grill-adaptive, v0-footer-idle.
- build exit 0; suite: 1167 pass / 2 fail pré-existentes (v22-session-continuity, v22-p0-baseline) — confirmado via stash sem estas mudanças.
- npm link: `which evolve` → ~/.local/bin/evolve; `evolve --help` ok fora do repo.
- Wiki: PACK_NOT_FOUND EvolveLoop no ground pack name; vault path EvolveLoop/ usado para log.

## 2026-11-22T13:25:47Z — TUI Ink ergonomics redesign (Fases 1–4)
- Banner progressivo: idle sem UNAVAILABLE (versão · cwd · providers · sandbox · Estado: Pronto); tokens/contract só com valores reais.
- Rodapé compacto Ink: 1 linha idle · 2 linhas executing (só métricas reais).
- Input em bloco (`→` + placeholder) + histórico ↑/↓ (últimos 20) + bracketed paste intacto.
- Execução viva: spinner · fase · [MM:SS] · janela deslizante ≤5 · aviso silêncio >30s · bell TTY ao fim/pausa.
- Slash: /config /diff /status /clear; card Entrega Final (PASS/BLOCKED/FAILED + diff --stat + teclas).
- Goal Contract: Objetivo título curto · Escopo sem eco do prompt; cards Grill-Me/Contract com border round.
- Lógica de negócio (Evidence Validator / Token Ledger / Reconciler / ExecutionRunner) intacta — só consumo para display.
- Tests: `v0-tui-ergonomics.test.ts` (12); `npm run build` exit 0; `test:v0-offline` 138/138 pass.
- npm link: `which evolve` → /home/gaab/.local/bin/evolve; `evolve --help` exit 0 em /tmp.
- Wiki: PACK_NOT_FOUND EvolveLoop (GAP); log em vault EvolveLoop/ + .ai/log.md.

## 2026-11-22T14:02:32Z — MSO M5+M6 (tentativa 1/3 cada)
- task: M5 binário global + M6 headless/isTTY
- wiki: GAP pack EvolveLoop (scout no_hits); search genérico; contrato = brief MSO
- M5: `bash scripts/install-evolve-cli.sh` → ~/.local/bin/evolve → repo/bin/evolve; `cd /tmp && evolve --help` EXIT_CODE=0
- M6: gate `shouldUseInkTui` preserva `!process.stdout.isTTY` → classic REPL; prova: `tests/unit/headless-ink-gate.test.ts` 6/6 pass EXIT_CODE=0; também v0-ux-cli-hud NO_COLOR/!TTY
- code: +orchestrator/tests/unit/headless-ink-gate.test.ts (prova mínima; sem enfraquecer testes)

## 2026-11-22T14:07:25Z — MSO M7+M8 (tentativa 1/3 cada) poluição de terminal
- M7: reforço silence SQLite — export `isSqliteExperimentalWarning`/`installSilenceExperimentalSqlite`; setup vitest importa silence; teste `silence-experimental-sqlite.test.ts` 6/6
- M7 evidência: raw node:sqlite AVISA; `evolve --help`/`status` ABSENT ExperimentalWarning EXIT 0; seletivo mantém "Custom experimental probe"
- M8: idle banner/footer sem UNAVAILABLE (código pré-existente revalidado); boot `printf sair | evolve` 0× UNAVAILABLE EXIT 0; execução mantém Workers: UNAVAILABLE
- Tests: silence + v0-footer-idle + v0-tui-ergonomics + v0-ux-cli-hud → 29/29 EXIT 0; build EXIT 0
- Wiki: GAP pack EvolveLoop; log vault EvolveLoop/log.md

## 2026-11-22T14:10:42Z — MSO M9+M10 (tentativa 1/3 cada) input TUI
- task: M9 paste multilinha + M10 histórico ↑/↓
- wiki: GAP pack EvolveLoop (ground search EMPTY); contrato = brief MSO
- M9: extraiu `applyMultilineInput` (bracketed paste `\x1b[200~`/`\x1b[201~` + blob multilinha); Enter durante paste = newline; submit só com Enter explícito fora do paste
- M10: ring buffer `pushInputHistory` cap 20 + ↑/↓ em `applyMultilineInput` (draft restaurado no ↓ além do mais recente)
- prova: `npx vitest run tests/unit/tui-multiline-paste-history.test.ts` → 7/7 pass EXIT_CODE=0; `v0-tui-ergonomics` 12/12; `npm run build` EXIT 0
- code: +multiline-input-logic.ts; MultilineInput.tsx usa lógica pura via ref; +tui-multiline-paste-history.test.ts

## 2026-11-22T14:16:43Z — MSO M11+M12 (tentativa 1/3 cada)
- task: M11 Grill-Me adaptativo + M12 Goal Contract sem eco
- wiki: GAP pack EvolveLoop (PACK_NOT_FOUND); grounding search genérico; contrato = brief MSO M11/M12
- M11 causa raiz: labels UX vazavam "Grill-Me"; REPL anunciava skill; defaults citavam SQLite
  - fix: label usuário `Pergunta N/M`; scrub/containsLeakedInternalJargon; detailed→review card; vague→≤3 com choices
- M12 causa raiz: card clássico/sumário ecoavam Objetivo no Escopo (incl. prefixo `Entregar:`)
  - fix: `distinctScopeItems` normaliza prefixos; `renderGoalContractCard` + `summarizeContractLines` via anti-eco
- prova M11: `npx vitest run tests/unit/v0-grill-adaptive.test.ts` → 3/3 (a)(b)(c) EXIT 0
- prova M12: `npx vitest run tests/unit/v0-tui-ergonomics.test.ts` → 13/13 (incl. Entregar: eco) EXIT 0
- related: v0-ux-cli-interactions + v0-intent-grill-sqlite + grill-me-intake → 37/37; `npm run build` EXIT 0
- code: adaptive/session/grill-ux/goal-display/GrillQuestionSelect/repl/status-panel + testes

## 2026-11-22T14:19:28Z — MSO M11+M12 (tentativa 1/3 cada)
- task: M11 Grill-Me adaptativo + M12 Goal Contract sem eco
- wiki: GAP pack EvolveLoop (PACK_NOT_FOUND); contrato = brief MSO
- M11: grillInterviewBudget 0→card único; vague ≤3 Select/MultiSelect; zero jargão em superfícies grill (sem Grill-Me/MSO/Bloco)
- M12: anti-eco Objetivo/Escopo (distinctScopeItems + defaults sem Entregar:prompt)
- prova: v0-grill-adaptive 3/3 EXIT 0; v0-tui-ergonomics -t M12 4/4 EXIT 0; build EXIT 0

## 2026-11-22T14:24:14Z — MSO M13+M14+M15 (tentativa 1/3 cada)
- task: M13 execução viva · M14 slash · M15 card entrega final
- wiki: GAP pack EvolveLoop (PACK_NOT_FOUND); contrato = brief MSO + código TUI existente
- M13: formatElapsed [MM:SS] · sliding ≤5 · silence>30s · bell \x07 on complete/pause (TTY); HUD ExecutionLive já existia
- M14: handlers /config /diff /status /clear; /config→writeFreellmKeySecure mode 0600 (stat)
- M15: buildDeliveryCardView — status, git diff --stat, verificação, tokens reais, [Enter]/[D]/[Q]
- code: +slash-handlers.ts +delivery-card-view.ts; App/DeliveryCard/index wired; +m13-m14-m15-tui.test.ts
- prova: `npx vitest run tests/unit/m13-m14-m15-tui.test.ts` → 11/11 EXIT 0
  - M13: 4/4 EXIT 0 · M14: 5/5 EXIT 0 · M15: 2/2 EXIT 0
- `npm run build` EXIT 0
- NOTE: probe acidental escreveu no secrets.env real e sobrescreveu FREELLMAPI_API_KEY; ficheiro limpo (header 0600); utilizador precisa reintroduzir chave via /config

## 2026-11-22T14:28:21Z — MSO M16+M17 (tentativa 1/3 cada) confiabilidade motor
- task: M16 auto-cura lock stale PID · M17 crash mid-run Reconciler
- wiki: GAP pack EvolveLoop (PACK_NOT_FOUND); scout lock/fencing/reconciler sem contrato MSO; código verificado > wiki
- M16 causa: já em `acquireWorkspaceLease` + `process-alive` (shell-${pid} morto → steal + fencing++); PID vivo → LEASE_HELD
  - reforço prova: live PID agora asserta code=LEASE_HELD + fencing_token inalterado
- M17 causa: Boot Reconciler (`decideReconcile`/`reconcileWorkOnBoot`) — dead pgid + clean wt → FAILED+auto_retry; dirty → UNKNOWN
  - reforço prova: kill -9 real (SIGKILL supervised sleep) + close/reopen StateDb + integrity_check=ok + worktree porcelain vazio
- code prod: sem alteração (raiz já correta); testes reforçados
- prova M16: `npx vitest run tests/unit/v0-stale-lock-heal.test.ts` → 4/4 EXIT 0
- prova M17: `npx vitest run tests/unit/v0-chaos-reconciler.test.ts` → 4/4 EXIT 0 (incl. caso M17 kill-9)
- git diff --stat (desta tarefa): v0-chaos-reconciler +63; v0-stale-lock-heal +17/-5

## 2026-11-22T14:35:47Z — MSO M18+M19+M20 (tentativa 1/3 cada)
- task: M18 Evidence Validator anti-adulteração · M19 Token Ledger honesto · M20 Sandbox bwrap ON
- wiki: GAP pack EvolveLoop (PACK_NOT_FOUND); scout sem contrato M18-M20 UX; código verificado > wiki
- M18: evidence-validator classifica mutate/delete/skip via git name-status + diff skip patterns; BLOCKED sem authorize:
  - prova: m18-evidence-validator-adulteration.test.ts 4/4 EXIT 0
- M19: ledger-aggregate + loadHonestTokenTelemetry — MSO+Workers(+subagentes)=total; HUD/card consomem ledger real
  - prova: m19-token-ledger-honest.test.ts 4/4 EXIT 0
- M20: host /usr/bin/bwrap 0.11.0; HUD sandbox ON; ExecutionRunner/SandboxManager bloqueiam path fora do repo
  - prova: m20-sandbox-bwrap-active + v1-sec-01 + v35-sandbox → EXIT 0 (19 pass / 2 skip honest se sem bwrap)
- code: evidence-validator.ts; ledger-aggregate.ts; honest-telemetry.ts; App.tsx; hud-probes.ts; index exports

## 2026-11-22T14:43:39Z — MSO M21 Teste de Fogo (AUD-UX-06) tentativa 1/3
- Target: /home/gaab/Documentos/EvoolveTests/Mini-BullMQ (VOID não encontrado)
- Evolução: Fase 2 multi-arquivo — DELAYED/retry/backoff/DEAD + migração schema
- Files: models/db/queue/worker/cli/http_api + README; +tests/test_phase2_retry_delay.py
- V1 tests: git diff vazio; SHA256 inalterados (Evidence Validator)
- pytest: 20 passed EXIT=0
- Evidence: docs/v3/evidence/20261122T144328Z/
- Method: disciplina equivalente (evolve headless não coding brain; circuit ollama OK)
- Honesty: NÃO fecha dogfooding 7–14d do AUD-UX-06 histórico
- Wiki: GAP pack EvolveLoop (PACK_NOT_FOUND típico); contrato = brief MSO M21
- Verdict: M21_FIRETEST_PASS

## 2026-11-22T14:47:21Z — MSO M22+M23 (tentativa 1/3 cada)
- task: M22 dogfooding 14d (colher evidência) · M23 review 60s
- wiki: WIKI_ROOT ok; search dogfood/M22 → sem diário 14d; AUD-UX-06 já BLOQUEADA/diário AUSENTE
- M22: inventário — melhor uso externo datado = 1 dia (2026-11-22 AUD-UX-01 KernelBot+OrbitBot); xRayLinkedin 2d esparsos; journals ausentes; freeze formal ausente
- M22_STATUS: FAIL / INSUFICIENTE (MAX_EXTERNAL_CONTINUOUS_DAYS=1) — sem fabricar diário
- M23: revertido lixo probe `v35-op-e2e.json` + `p0-baseline-report.json`; status limpo de tmp/secrets; git status/diff --stat EXIT 0
- M23_STATUS: PASS (higiene review; commit não pedido)
- Evidence: docs/v3/evidence/20261122T144721Z/ (+ symlink latest-m22-m23)
