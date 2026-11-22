# V4.3 — Relatório de gate (V43-M4)

**Versão:** V4.3 Consolidation  
**Data (UTC):** 2026-11-22T18:38:19Z  
**Formato:** `V4-Tests-and-Benchmarks.md` §9  
**Gate obrigatório (§7):** E2E, regressão, resiliência, benchmarks comparativos e documentação de release concluídos  
**Regra de conclusão (Consolidation §7):** experiência coerente; regressões avaliadas; compat documentada; usabilidade/confiabilidade/performance com evidências reproduzíveis.  
**Proibido:** liberar limpo com N=0 humanos; inventar %; declarar estabilidade sem evidência.

---

## 1. Decisão explícita

### **liberar com ressalvas**

| Alternativa | Por que não |
|---|---|
| liberar (sem ressalvas) | Usabilidade humana **N=0**; E2E TTY Ink **LIMITATION**; proibido “liberar” limpo |
| bloquear | P0+P1+P2 essenciais entregues; vitest v4{1,2,3} exit 0; E2E/resiliência/regressão documentados; benchmarks finais pathados; release docs presentes |

**Justificativa curta:** critérios Consolidation §5 / gate §7 estão **cumpridos em código+CLI+docs** com limitações honestas (humano N=0, TTY live); ressalvas, não bloqueio de implementação.

---

## 2. Critérios — Consolidation §5

| Critério §5 | Resultado | Evidência (path) |
|---|---|---|
| Fluxos E2E install limpa + update | **APROVADO com ressalva** | `tests/e2e-full.md`; `compat-matrix.md`; `migration-notes.md`; LIMITATION TTY |
| Estado exibido = persistido/operacional | **APROVADO** | `journey-pause.ts`; `delivery-verify.ts`; `v43-p0-pause-delivery.test.ts` |
| Falhas sem falso sucesso | **APROVADO** | `delivery-status.ts`; `e2e-full.md` #4,#10,#12; `resilience.md` |
| Handles opcionais e isolados | **APROVADO** | `agent-handles/`; `v43-p0-regression-handles.test.ts`; `e2e-full.md` #7 |
| Experiência padrão CLI-only | **APROVADO** | `help-usage.ts`; Handles OFF default; `redundancy-report.md` |
| Sem regressões críticas preservadas | **APROVADO** | `tests/regression.md`; `v43-p0-regression-handles.test.ts`; L3 groups |
| Compat/requisitos/limitações documentados | **APROVADO** | `compat-matrix.md`; `known-limits.md`; `release-checklist.md` |
| Usabilidade/perf vs baseline | **APROVADO com ressalva** | `baseline/comparative-final.md`; humano N=0 LIMITATION |
| Cada aceite com evidência rastreável | **APROVADO** | este gate-report + paths abaixo |

---

## 3. Critérios — Gate §7 V4.3

| Critério | Resultado | Evidência |
|---|---|---|
| E2E | **APROVADO com ressalva** | `docs/v4/V4.3/tests/e2e-full.md` + `v43-p2-e2e-resilience.test.ts` (TTY LIMITATION) |
| Regressão | **APROVADO** | `docs/v4/V4.3/tests/regression.md` + suites v41/v42/v43 |
| Resiliência | **APROVADO com ressalva** | `docs/v4/V4.3/tests/resilience.md` (kill live LIMITATION) |
| Benchmarks comparativos | **APROVADO** | `docs/v4/V4.3/baseline/comparative-final.md` (N=5) |
| Documentação de release | **APROVADO** | quickstart, troubleshooting, known-limits, checklist, rollback, deferred |
| Usabilidade humana N≥1 | **REPROVADO** / LIMITATION | `docs/v4/V4.3/tests/usability-final.md` N=0 |
| Indicadores sem invenção | **APROVADO** | HonestMetric smokes; UNVERIFIED sem evidência |

---

## 4. Links para testes e artefatos

| Artefato | Path |
|---|---|
| E2E full | `docs/v4/V4.3/tests/e2e-full.md` |
| E2E smoke P0 | `docs/v4/V4.3/tests/e2e-smoke.md` |
| Resiliência | `docs/v4/V4.3/tests/resilience.md` |
| Regressão | `docs/v4/V4.3/tests/regression.md` |
| Usabilidade humana | `docs/v4/V4.3/tests/usability-final.md` |
| Automated | `docs/v4/V4.3/tests/automated-test-results.md` |
| Comparative final | `docs/v4/V4.3/baseline/comparative-final.md` |
| Benchmark §8 | `docs/v4/V4.3/baseline/benchmark-log.md` |
| Raw | `docs/v4/V4.3/baseline/raw-measurements.md` |
| Environment | `docs/v4/V4.3/baseline/environment.md` |
| Redundancy | `docs/v4/V4.3/redundancy-report.md` |
| Release checklist | `docs/v4/V4.3/release-checklist.md` |
| Rollback | `docs/v4/V4.3/rollback-plan.md` |
| Known limits | `docs/v4/V4.3/known-limits.md` |
| Backlog | `docs/v4/V4.3/implementation-backlog.md` |
| Vitest P2 | `orchestrator/tests/unit/v43-p2-*.ts` |

---

## 5. Comparação com baseline

| Tema | V4.0 | V4.2 | V4.3 (esta fatia) |
|---|---|---|---|
| `--help` median | 465.5 ms | 429.5 ms | 438.5 ms — sem claim otimização |
| `status` median | 482.8 ms | 451.1 ms | 455.0 ms |
| Classic → prompt | 520.4 ms | 478.5 ms | 497.4 ms |
| `delivery show` | — | — | 454.0 ms (novo) |
| Usabilidade humana | N=0 | N=0 | N=0 (LIMITATION) |
| E2E suite doc | smoke parcial | — | e2e-full + resilience + regression |

Detalhe: `baseline/comparative-final.md`.

---

## 6. Regressões conhecidas / limitações

1. Usabilidade humana N=0 — **bloqueia liberar limpo**.  
2. Ink TTY / kill hard mid-lease / attach tmux vivo — LIMITATION.  
3. Δ positivos vs V4.2 em `history`/`config`/classic — documentados; sem patch §10.  
4. Credenciais: duas casas — LIMITATION aceite no release (P2-5).  
5. Wiki pack EvolveLoop ausente (P2-6 LIMITATION).  
6. Migrator schema / non-ASCII / Zellij — herdados V4.2.

---

## 7. APROVADOS — índice de evidência

Cada **APROVADO** acima aponta path; amostra:

- Estado pause/delivery → `orchestrator/src/cli/tui/journey-pause.ts` + `delivery-verify.ts` + `v43-p0-pause-delivery.test.ts`  
- Falhas honestas → `delivery-status.ts` + `e2e-full.md`  
- Handles → `agent-handles/attach.ts` + `v43-p0-regression-handles.test.ts`  
- E2E/resiliência → `tests/e2e-full.md` + `tests/resilience.md` + `v43-p2-e2e-resilience.test.ts`  
- Regressão → `tests/regression.md` + `v43-p2-telemetry-regression.test.ts`  
- Benchmarks → `baseline/comparative-final.md`  
- Release docs → `quickstart.md` … `rollback-plan.md`  
- Telemetria → `honest-telemetry.ts` + P2-4 test  
- Credenciais LIMITATION → `credentials-paths.ts` + `known-limits.md` L-CREDS  

---

*Fim — gate-report.md · decisão: liberar com ressalvas*
