# V3 Acceptance Matrix

| Critério | Estado | Implementação | Teste | Evidência |
|---|---|---|---|---|
| Gate A — ≥3 repos distintos | PASS | `evaluation/runner.ts` + fixtures `v3-eval/*` | `v3-eval-battery.integration.test.ts` | `gate.v3-generalization.json` |
| Gate A — ≥10 tarefas | PASS | `benchmarks/v3/tasks.json` T01–T10 | idem | idem |
| Gate A — multi-arquivo / multi-módulo | PASS | solvers + fixtures | idem | idem |
| Gate A — testes preexistentes (baseline) | PASS | `runProjectTests` before mutate | idem | idem |
| Gate A — critérios com evidência | PASS | EvidenceStore + verified pass | idem | idem |
| Gate B — falhas em plan/impl/test/review | PASS | `engineering-battery.ts` | idem | `gate.v3-reliability.json` |
| Gate B — recovery em tarefa real | PASS | Continuity handoff on T04 | idem | idem |
| Gate B — anti-loop / stop conditions | PASS | `evaluation/progress.ts` | eng battery | idem |
| Gate C — reviewer independente | PASS | separate verifier agent id | adversarial + battery | `gate.v3-evaluator.json` |
| Gate C — rejeição adversarial TRUE_FULL_PASS | PASS | `verified-pass.ts` | `verified-pass-adversarial.test.ts` | idem |
| Gate C — hash / fingerprint / stale tests | PASS | EvidenceStore integrity | idem | idem |
| Gate D — matriz harness honesta | PASS | `harness-matrix.ts` | v34 eng E2E | `gate.v3-harnesses.json` |
| Gate D — ≥1 harness real (Core Cursor path) | PASS | CursorJobsAdapterDriver / ExecutionBridge | v34 eng E2E | idem |
| Gate D — consentimento | PASS | `EVOLVELOOP_HARNESS_CONSENT` | `v33-consent-ownership.test.ts` | idem |
| Gate E — held-out T09/T10 | PASS | tasks.json split | battery | `gate.v3-benchmarks.json` |
| Gate E — custo por conclusão verificada | PASS | battery aggregates | idem | idem |
| Gate E — metodologia registrada | PASS | benchmarks artifact | gate script | idem |
| Gate F — testes + evidências + docs | PASS | `V3-COMPLETE.md` + gate script | `run-v3-finalization-gate.mjs` | `gate.v3-global.json` |
| Segurança V3.3 preservada | PASS | workspace realpath + consent + fencing | v33 unit suites | v33 evidence + gate F |
