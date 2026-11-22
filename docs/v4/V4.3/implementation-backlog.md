# V4.3 — Backlog de implementação (pós-auditoria Consolidation)

**Status:** P0 **DONE** · P1 **DONE** · P2 **DONE** (V43-M4) — gate: **liberar com ressalvas**  
**Data:** 2026-11-22  
**Fontes:** `V4.3-Consolidation.md` §5 (aceitação); `V4-Tests-and-Benchmarks.md` §6 (testes), §7 gate, §8–§9; `integration-audit.md`; `redundancy-candidates.md`; gates V4.0–V4.2  
**Regra:** não reescrever motor de agentes; não dashboard gráfico; não nova geração arquitetural; não declarar estabilidade sem evidência; preferir fachadas + alinhamento + testes E2E/resiliência.  
**Gate alvo:** `V4-Tests-and-Benchmarks.md` §7 — E2E, regressão, resiliência, benchmarks comparativos, documentação de release.  
**Evidência P0:** `orchestrator/tests/unit/v43-p0-*.ts`; `docs/v4/V4.3/tests/e2e-smoke.md`.  
**Evidência P1:** `orchestrator/tests/unit/v43-p1-*.ts`; `docs/v4/V4.3/{quickstart,compat-matrix,redundancy-report,identity-copy-map,…}.md`.  
**Evidência P2:** `orchestrator/tests/unit/v43-p2-*.ts`; `docs/v4/V4.3/tests/{e2e-full,resilience,regression,usability-final}.md`; `docs/v4/V4.3/baseline/*`; `gate-report.md`.

---

## 0. Legenda

| Prioridade | Significado |
|---|---|
| **P0** | Bloqueia critérios §5 de coerência estado / falso sucesso / Handles / CLI-only / regressões críticas |
| **P1** | Redundâncias + copy identidade + matriz compat/release necessários ao gate §7 |
| **P2** | Suite E2E completa, benchmarks finais, usabilidade humana, polish, wiki pack |

| Coluna | Significado |
|---|---|
| **§5 aceite** | Critério(s) `V4.3-Consolidation.md` §5 |
| **§6 testes** | Cenário(s) `V4-Tests-and-Benchmarks.md` §6 |
| **Arquivos** | Pontos de partida verificados |
| **Audit** | IDs em `integration-audit.md` / `redundancy-candidates.md` |

Dependências: V4.0–V4.2 liberados **com ressalvas**; baseline em `docs/v4/V4.0/baseline/` + `docs/v4/V4.2/baseline/`.

---

## 1. P0 — Coerência operacional (sem falso sucesso)

### P0-1 — Pause/cancel/retomada: exibido = operacional — **DONE**

| | |
|---|---|
| **Problema** | Pause Ink é `useState` local — reinício CLI / outro processo não vê pausa (S1/S5). |
| **Alvo** | Ou **persistir** pause de Task (StateDb / flag de jornada) com resume idempotente; ou copy inequívoca “pausa só desta janela” **e** comando CLI que afeta o mesmo eixo. Sem terceiro significado silencioso. |
| **Feito** | `journey-pause.ts` → `schema_meta.journey_task_pause`; TUI Ctrl+P/`/pause`/`continuar` + `evolve pause` (trivial) + `evolve resume` no mesmo eixo; resume idempotente; ≠ workflow. |
| **§5 aceite** | Estado exibido = persistido/operacional; interrupções sem falso sucesso. |
| **§6 testes** | `v43-p0-pause-delivery.test.ts`; smoke e2e. |
| **Arquivos** | `journey-pause.ts`; `App.tsx`; `task-controls.ts`; `trivial-bypass.ts`; `evolve.ts`; `state-db/store.ts` getMeta/setMeta. |
| **Não fazer** | Fundir com `workflow pause` sem qualifier. |
| **Audit** | S1, S5, R5, R6, E6 |

### P0-2 — Delivery vs MSO: fechar caminho “testes aprovados/falhando” — **DONE**

| | |
|---|---|
| **Problema** | Kick nunca anexa `verification` → Delivery nunca PASS no caminho default; estado Delivery não reconstruível após refresh (S2/S3). |
| **Alvo** | (a) gancho mínimo para anexar resultado de verificação real **ou** comando explícito “validar entrega”; (b) persistir ou re-derivar Delivery a partir de evidências/StateDb no `/delivery` e history; (c) manter UNVERIFIED quando sem evidência. |
| **Feito** | `delivery-verify.ts` + `evolve delivery show\|validate`; `/delivery` re-deriva; history show linha Delivery; kick continua sem inventar PASS. |
| **§5 aceite** | Falhas/interrupções sem falso sucesso; entrega coerente. |
| **§6 testes** | aprovados/falhando + UNVERIFIED sem evidência em `v43-p0-pause-delivery.test.ts`. |
| **Arquivos** | `delivery-verify.ts`; `delivery-surface.ts`; `App.tsx`; `task-history.ts`; `slash-handlers.ts`. |
| **Não fazer** | Mapear adapter `ok` → PASS. |
| **Audit** | S2, S3, S4, E4 |

### P0-3 — Suite mínima E2E + resiliência (smoke gate) — **DONE**

| | |
|---|---|
| **Problema** | Gates V4.1/V4.2 aprovam com unit/CLI; §6 exige cenários ponta a ponta e falha — ainda LIMITATION. |
| **Alvo** | Roteiro reproduzível + registo: tarefa simples; aprovação; falha provider (simulada); cancelamento; Handles OFF; Handles ON soft-fail; desconectar viewer. Artefactos em `docs/v4/V4.3/tests/`. |
| **Feito** | `docs/v4/V4.3/tests/e2e-smoke.md` + `v43-p0-e2e-smoke.test.ts`; **LIMITATION** TTY live explícita. |
| **§5 aceite** | Fluxos E2E limpa/atualização; Handles opcionais; CLI-only default; evidência rastreável. |
| **§6 testes** | Subconjunto §6 E2E + resiliência (mínimo P0); resto em P2. |
| **Arquivos** | `docs/v4/V4.3/tests/e2e-smoke.md`; `tests/unit/v43-p0-e2e-smoke.test.ts`. |
| **Não fazer** | Inventar passes; confundir unit com E2E. |
| **Audit** | §3.3 integration-audit |

### P0-4 — Regressão comandos públicos + automações preservadas — **DONE**

| | |
|---|---|
| **Problema** | Consolidação pode partir aliases/`workspace`/JSON groups usados por scripts. |
| **Alvo** | Checklist + testes: `evolve --help`, agents product surface, config prefs/validate, history, use, approvals, pause/resume CLI, Handles OFF; grupos L3 ainda exit-stable. |
| **Feito** | `v43-p0-regression-handles.test.ts` checklist; L3 groups preservados no advanced help. |
| **§5 aceite** | Sem regressões críticas nos recursos V4 decidiu preservar; CLI-only. |
| **§6 testes** | Regressão: comandos públicos; automações/scripts; permissões/sandbox. |
| **Arquivos** | `help-usage.ts`; `evolve.ts`; `v43-p0-regression-handles.test.ts`. |
| **Não fazer** | Apagar L3 sem deprecation (R* Justificar). |
| **Audit** | R7–R11; gate V4.2 |

### P0-5 — Handles: isolamento sob falha (regressão + um E2E) — **DONE**

| | |
|---|---|
| **Problema** | Matrix V4.1 cobre unit; Consolidation exige perder janela Handle ≠ encerrar Agent; substituído ≠ ativo. |
| **Alvo** | Revalidar `closeViewer` / lifecycle REPLACED; um cenário documentado de desconexão; backend ausente continua soft-fail. |
| **Feito** | Revalidação unit + secção V4.3 na matrix; smoke e2e §7 viewer disconnect. |
| **§5 aceite** | Handles opcionais e isolados do ciclo de vida do Agent. |
| **§6 testes** | Desconexão Agent Handle; encerrar só viewer; Agent substituído; backend ausente. |
| **Arquivos** | `attach.ts` (revalidado); `docs/v4/V4.1/tests/agent-handles-matrix.md`; `v43-p0-regression-handles.test.ts`. |
| **Não fazer** | Forçar Handles ON. |
| **Audit** | §3.2 integration-audit |

---

## 2. P1 — Redundância, identidade, release

### P1-1 — Facade status / sessions (V4.1 P2-2 herdado) — **DONE**

| | |
|---|---|
| **Problema** | R1/R2 — múltiplos status e dois caminhos Session. |
| **Alvo** | Default produto = Task/Session; um caminho Session de processo sob Handles; resto L2 com nomes qualificados. |
| **Feito** | `evolve status` facade `product: task_session` + message Task/Session/Plan; help glossary qualifica L2; Handles = agents attach. |
| **§5 aceite** | Fluxos coerentes; menos complexidade acidental. |
| **§6 testes** | `v43-p1-consolidation.test.ts`; regressão help. |
| **Arquivos** | `trivial-bypass.ts`; `help-usage.ts`. |
| **Audit** | R1, R2, T3 |

### P1-2 — Alinhar copy classic REPL: Workers→Agents; Goal Contract→Plan (UI) — **DONE**

| | |
|---|---|
| **Problema** | I1/I3 — Ink alinhado; REPL/classic footer não. |
| **Alvo** | Mesmos rótulos produto nas superfícies utilizador; IDs runtime intactos. |
| **Feito** | Classic footer Agents; REPL/card Plan; workspace-session Plan/Session. |
| **§5 aceite** | Mensagens/documentação coerentes com comportamento. |
| **§6 testes** | `v43-p1-consolidation.test.ts`; v0 footer suite actualizada. |
| **Arquivos** | `footer.ts`; `repl.ts`; `workspace-session.ts`; `goal-display.ts`. |
| **Audit** | I1, I3, E1, E3, T1 |

### P1-3 — MSO→Orchestrator na UI (V4.1 P2-4 / Q6) — **DONE**

| | |
|---|---|
| **Problema** | I2 — utilizador vê MSO; glossário = Orchestrator. |
| **Alvo** | Copy UI “Orchestrator/Session”; literais `TRUE-FULL-PASS` etc. só verbose/L5; mapa documentado. |
| **Feito** | `product-copy.ts` + identity-copy-map; HUD/slash/banner/shell kickoff; TRUE-FULL-PASS → “concluída (verificada)”. |
| **§5 aceite** | Divergências identidade corrigidas ou justificadas. |
| **§6 testes** | smoke copy em `v43-p1-*.ts`. |
| **Arquivos** | `shell-start-execution.ts`; footers; Delivery; `identity-copy-map.md`. |
| **Audit** | I2, E2 |

### P1-4 — Dual TUI: documentar + ocultar Core da jornada — **DONE**

| | |
|---|---|
| **Problema** | T2 — `tui run` compete conceptualmente com Ink. |
| **Alvo** | Journey help: Ink = default; `tui run/status` = ops; sem promover L0. |
| **Feito** | help journey + advanced glossary; user guides V4.1. |
| **§5 aceite** | Experiência padrão CLI-only coerente. |
| **§6 testes** | help smoke P1. |
| **Arquivos** | `help-usage.ts`; user-guide-everyday/advanced. |
| **Audit** | T2, T3 |

### P1-5 — Matriz compatibilidade + migração (fechar LIMITATIONs baratas) — **DONE**

| | |
|---|---|
| **Problema** | V4.2 compat parcial (Node multi, non-ASCII, Zellij, migrator). |
| **Alvo** | Estender compat/migration onde barato; LIMITATION explícita; Node ≥20 documentado. |
| **Feito** | `docs/v4/V4.3/compat-matrix.md` + `migration-notes.md`; engines no help. |
| **§5 aceite** | Compatibilidade, requisitos e limitações documentados. |
| **§6 testes** | doc + smoke engines note. |
| **Arquivos** | `docs/v4/V4.3/compat-*.md`; `migration-notes.md`. |
| **Audit** | Consolidation §2.4 |

### P1-6 — Documentação release: quickstart, troubleshooting, checklist, rollback — **DONE**

| | |
|---|---|
| **Problema** | Entregáveis Consolidation §2.5 / §4 ainda ausentes em `docs/v4/V4.3/`. |
| **Alvo** | Quickstart; troubleshooting; limites; checklist + rollback; decisões adiadas. |
| **Feito** | quickstart, troubleshooting, known-limits, release-checklist, rollback-plan, deferred-decisions. |
| **§5 aceite** | Compat/requisitos/limitações documentados; evidência rastreável. |
| **§6 testes** | existência ficheiros (smoke P1). |
| **Arquivos** | `docs/v4/V4.3/` release set. |
| **Não fazer** | Declarar “estável” sem gate §9. |
| **Audit** | Consolidation §2.5 |

### P1-7 — Relatório de redundâncias removidas ou justificadas — **DONE**

| | |
|---|---|
| **Problema** | Entregável Consolidation §4.2. |
| **Alvo** | Fechar cada R*/T*/E* com remoção/fusão/ocultação/justificativa pathada. |
| **Feito** | `redundancy-report.md`; candidatos apontam para relatório. |
| **§5 aceite** | Complexidade reduzida sem perder capacidades valiosas. |
| **§6 testes** | regressão help/copy. |
| **Arquivos** | `redundancy-report.md`; `redundancy-candidates.md`. |
| **Audit** | `redundancy-candidates.md` |

---

## 3. P2 — E2E completo, benchmarks, humano, polish

### P2-1 — Suite §6 completa (multi-agent, falhas, persistência) — **DONE**

| | |
|---|---|
| **Problema** | P0-3 é mínimo; §6 lista multi-agent, falha persistência, etc. |
| **Alvo** | Cobrir restante tabela §6 E2E + resiliência com logs/artefactos. |
| **Feito** | `e2e-full.md` + `resilience.md` + `regression.md`; `v43-p2-e2e-resilience.test.ts`; LIMITATION TTY explícita. |
| **§5 aceite** | Fluxos + falhas sem falso sucesso. |
| **§6 testes** | Toda a secção §6 relevante (unit + doc; TTY LIMITATION). |
| **Arquivos** | `docs/v4/V4.3/tests/*` |
| **Não fazer** | Pass inventado. |

### P2-2 — Benchmarks finais vs baseline (mediana + dispersão) — **DONE**

| | |
|---|---|
| **Problema** | Comparative V4.2 existe; Consolidation exige repetir baseline completa pós-mudanças. |
| **Alvo** | Mesmo roteiro V4.0 `repro-script.md`; formato §8; mediana/MAD; investigar regressões. |
| **Feito** | N=5 help/status/pause/config/history/use/delivery show + classic; `comparative-final.md`. |
| **§5 aceite** | Usabilidade/perf comparados à baseline. |
| **§6 testes** | Benchmarks finais §6. |
| **Arquivos** | `docs/v4/V4.3/baseline/*` |
| **Não fazer** | Otimizar métrica isolada piorando clareza (Tests §10). |

### P2-3 — Usabilidade / compreensão humana N≥1 (dívida V4.0–V4.2) — **DONE** (LIMITATION)

| | |
|---|---|
| **Problema** | N=0 em todos os gates anteriores. |
| **Alvo** | Cohort mínimo (N≥1, ideal ≥3) nos roteiros V4.0 compreensão + V4.1 usabilidade; registar LIMITATION se impossível. |
| **Feito** | `usability-final.md` N=0 LIMITATION; gate **não** libera limpo. |
| **§5 aceite** | Evidência rastreável; não fingir %. |
| **§6 testes** | Indicadores compreensão/conclusão sem ajuda. |
| **Arquivos** | `docs/v4/V4.3/tests/usability-final.md` |

### P2-4 — Telemetria / ledger / continuity regressão fina — **DONE**

| | |
|---|---|
| **Problema** | §6 regressão telemetria/ledger/continuidade. |
| **Alvo** | Smokes: HonestMetric; sem duplicar consumo; continuity limitation UI sob REPLACED. |
| **Feito** | `v43-p2-telemetry-regression.test.ts` — UNAVAILABLE vazio; rollup; REPLACED 3 linhas. |
| **Arquivos** | `honest-telemetry.ts`; `limitation-ui.ts`; testes M19/v41/v43-p2. |

### P2-5 — Credenciais: unificar ficheiro ou aceitar LIMITATION no release — **DONE**

| | |
|---|---|
| **Problema** | V4.2 P2-4 documentou duas casas sem merge. |
| **Alvo** | Ou unificar path canónico com migração; ou checklist release com LIMITATION explícita. |
| **Feito** | LIMITATION L-CREDS no release/known-limits/checklist; help lista paths; sem unificar (não barato). |
| **Arquivos** | `credentials-paths.ts`; `known-limits.md`; `release-checklist.md`. |
| **Audit** | V4.2 C7 |

### P2-6 — Wiki pack EvolveLoop (opcional infra) — **DONE** (LIMITATION)

| | |
|---|---|
| **Problema** | `PACK_NOT_FOUND` — grounding fraco. |
| **Alvo** | Pack mínimo no vault **ou** LIMITATION permanente no release. |
| **Feito** | LIMITATION L-WIKI em `known-limits.md` + gate-report; contratos do repo. |
| **Não fazer** | Inventar contratos na wiki. |

---

## 4. Matriz §5 aceite ↔ itens

| Critério Consolidation §5 | Itens |
|---|---|
| Fluxos E2E install limpa + update | P0-3, P1-5, P2-1 |
| Estado exibido = persistido/operacional | P0-1, P0-2 |
| Falhas sem falso sucesso | P0-2, P0-3, P2-1 |
| Handles opcionais e isolados | P0-5 |
| Experiência padrão CLI-only | P0-4, P1-4 |
| Sem regressões críticas preservadas | P0-4, P1-1, P1-7 |
| Compat/requisitos/limitações documentados | P1-5, P1-6, P2-5 |
| Usabilidade/perf vs baseline | P2-2, P2-3 |
| Cada aceite com evidência rastreável | todos + gate-report §9 |

---

## 5. Matriz §6 testes ↔ itens

| Bloco Tests §6 | Itens |
|---|---|
| E2E (simples, multi-agent, approval, falhas, handles, retomada, delivery, cancel) | P0-3, P0-2, P0-5, P2-1 |
| Resiliência (kill agent/viewer, restart CLI, provider down, persist fail, idempotência, estados antigos) | P0-1, P0-3, P2-1 |
| Regressão (comandos, scripts, config, sandbox, ledger, continuity) | P0-4, P1-1, P2-4 |
| Benchmarks finais | P2-2 |
| Evidência / release checklist | P1-6, P1-7 |

---

## 6. Ordem sugerida de execução

```text
P0-2 (Delivery/verificação) → P0-1 (pause coerente)
  → P0-5 (Handles regressão) → P0-4 (regressão CLI) → P0-3 (smoke E2E)
P1-2 / P1-3 (copy identidade) → P1-1 (status/sessions)
  → P1-4 (dual TUI docs) → P1-5 (compat) → P1-6 (release docs) → P1-7 (redundancy report)
P2-1 (E2E completo) → P2-2 (benchmarks) → P2-3 (humano)
  → P2-4 / P2-5 / P2-6 conforme evidência
```

Gate V4.3 (§7): **cumprido com ressalvas** — ver `gate-report.md` (P0+P1+P2 DONE; humano N=0).

---

## 7. Fora de escopo (reafirmar)

- Nova geração arquitetural / rename de produto por estética  
- Grandes features não necessárias à conclusão V4  
- Reescrever motor de agentes / MSO core  
- Dashboard gráfico / painel de métricas na Home  
- Remover L3 só para “parecer simples”  
- Declarar estabilidade sem gate §9  

---

## 8. Evidência exigida ao fechar V4.3 (§9)

- Critérios §5: aprovado / reprovado / N/A com links  
- `docs/v4/V4.3/tests/` (E2E, resiliência, regressão)  
- Comparação com `docs/v4/V4.0/baseline/` (+ V4.2)  
- Relatório redundâncias  
- Checklist release + rollback + limitações  
- Decisão: liberar | liberar com ressalvas | bloquear  

**Gate V43-M4:** `gate-report.md` — decisão **liberar com ressalvas**.

---

*MSO TASK V43-M4 — P2 DONE + gate.*
