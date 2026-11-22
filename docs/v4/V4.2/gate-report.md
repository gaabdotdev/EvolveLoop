# V4.2 — Relatório de gate (V42-M4)

**Versão:** V4.2 Operational Excellence
**Data (UTC):** 2026-11-22T18:07:50Z
**Formato:** `V4-Tests-and-Benchmarks.md` §9
**Gate obrigatório (§7):** Configuração, workspace, histórico, observabilidade e compatibilidade validados
**Regra de conclusão (Operational §7):** operação recorrente consistente, mensurável, sem depender de conhecimento interno do repo.

---

## 1. Decisão explícita

### **liberar com ressalvas**

| Alternativa | Por que não |
|---|---|
| liberar (sem ressalvas) | Usabilidade humana **N=0**; vários indicadores §5 LIMITATION; proibido “liberar” limpo |
| bloquear | P0+P1+P2 essenciais entregues; vitest **70/70**; evidências pathadas; compat parcial documentada; não-regressão CLI medida |

**Justificativa curta:** configurar / workspace / histórico / obs / compat estão **validados em código+CLI+docs** com limitações honestas; falta cohort humano e alguns smokes multi-host — ressalvas, não bloqueio de implementação.

---

## 2. Critérios — Operational Excellence §5

| Critério §5 | Resultado | Evidência (path) |
|---|---|---|
| Preferências essenciais sem editar ficheiros internos | **APROVADO** | `config-surface.ts`; `evolve config prefs\|set`; `v42-p0`; `functional-scenarios.md` #2–3 |
| Config inválida → opção + correção | **APROVADO** | `profile.ts` validate; `v42-p0` P0-2; `migration-notes.md` |
| Workspace ativo identificável | **APROVADO** | Home/footer/help; `evolve use`; `v42-p1` |
| Localizar e retomar Task anterior | **APROVADO** (com limitações explícitas) | `task-history.ts`; history list/show; LIMITATION resume parcial |
| Métricas: unidade/escopo/origem; estimativas rotuladas | **APROVADO** | footer-compact / Delivery; `v42-p0` P0-5 |
| Logs detalhados não dominam default | **APROVADO** | journey help curto; stream off (V4.1 herdado) |
| Atalhos/comandos críticos documentados sem conflito | **APROVADO** (ambiguidade documentada) | `help-usage.ts`; `integration` alias; taxonomia |
| Melhorias perf por medições comparáveis | **APROVADO com ressalva** | `baseline/comparative-report.md` — não-regressão medida; sem claim de ganho de produto; P2-3 LIMITATION |

---

## 3. Critérios — Gate §7 V4.2

| Critério | Resultado | Evidência |
|---|---|---|
| Configuração validada | **APROVADO** | prefs + validate + migration-notes |
| Workspace validado | **APROVADO** | use/switch + isolamento `v42-p1` |
| Histórico validado | **APROVADO** | history list/show + limitações |
| Observabilidade validada | **APROVADO** | proveniência tokens TUI |
| Compatibilidade validada | **APROVADO parcial** | `compat-matrix.md` — Pass onde medido; LIMITATIONs explícitas |
| Usabilidade humana N≥1 | **REPROVADO** / LIMITATION | N=0 |
| Indicadores sem invenção | **APROVADO** | `indicators.md` |

---

## 4. Links para testes e artefatos

| Artefato | Path |
|---|---|
| Functional | `docs/v4/V4.2/tests/functional-scenarios.md` |
| Automated | `docs/v4/V4.2/tests/automated-test-results.md` |
| Indicators | `docs/v4/V4.2/tests/indicators.md` |
| Migration | `docs/v4/V4.2/tests/migration-notes.md` |
| Navigation / a11y | `docs/v4/V4.2/tests/navigation-a11y.md` |
| Compat matrix | `docs/v4/V4.2/tests/compat-matrix.md` |
| Comparative baseline | `docs/v4/V4.2/baseline/comparative-report.md` |
| Benchmark §8 | `docs/v4/V4.2/baseline/benchmark-log.md` |
| Backlog | `docs/v4/V4.2/implementation-backlog.md` |
| Baseline V4.0 | `docs/v4/V4.0/baseline/*` |

---

## 5. Comparação com baseline V4.0

| Tema | Baseline V4.0 | V4.2 (esta fatia) |
|---|---|---|
| `--help` median | 465.5 ms | 429.5 ms (N=5) — sem claim otimização |
| `status` median | 482.8 ms | 451.1 ms |
| Classic → prompt | 520.4 ms | 478.5 ms |
| Prefs / history / use | GAP | CLI + medições novas |
| Usabilidade humana | N=0 | N=0 (LIMITATION) |
| a11y rows | LIMITATION | unit + App wire (`LOW_ROWS`) |

Detalhe: `baseline/comparative-report.md`.

---

## 6. Regressões conhecidas / limitações

1. Usabilidade humana N=0.
2. Ink TTY / update-durante-execução / onboarding timed — LIMITATION.
3. Migrator schema antigo — LIMITATION.
4. Non-ASCII / symlink / Node multi-versão / Zellij — LIMITATION.
5. P2-3: sem otimização adicional de render (LIMITATION explícita).
6. Credenciais: duas casas documentadas, **não** unificadas em um ficheiro.
7. Wiki pack EvolveLoop ausente.

---

## 7. APROVADOS — índice de evidência

Cada **APROVADO** acima aponta path; amostra:

- Prefs → `orchestrator/src/cli/config-surface.ts` + `tests/unit/v42-p0-operational.test.ts`
- Validate → `orchestrator/src/config/profile.ts` + migration-notes
- Workspace → `workspace-product-surface.ts` + `v42-p1`
- History → `task-history.ts` + functional #7–8
- Obs → footer-compact / delivery-card-view + P0-5
- Compat → `compat-matrix.md`
- Perf → `baseline/comparative-report.md`
- Vitest → `automated-test-results.md` (70/70)

---

*Fim — gate-report.md · decisão: liberar com ressalvas*


---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

Revalidação pós-remediação: prefs/history/workspace isolation (V4.2) cobertos em `remed-m4`/`remed-m6`; `npm test` completo exit 0.
Decisão REMED: **liberar com ressalvas** — `docs/v4/V4.3/remediation/gate-report.md`.
