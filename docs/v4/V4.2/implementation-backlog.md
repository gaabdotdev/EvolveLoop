# V4.2 — Backlog de implementação (pós-auditoria)

**Status:** P0 **DONE** (V42-M2); P1 **DONE** (V42-M3); P2 **DONE** (V42-M4 — com LIMITATIONs)  
**Data:** 2026-11-22  
**Fontes:** `V4.2-Operational-Excellence.md` §5 (aceitação); `V4-Tests-and-Benchmarks.md` §5 (testes), §7 gate, §8–§9; `operational-audit.md`; `command-taxonomy-current.md`; V4.0 baseline; V4.1 handles/help  
**Regra:** não reescrever motor de agentes; não dashboard gráfico; preferir fachadas UX + validação + taxonomia; medições comparáveis à baseline V4.0.  
**ADR P0:** [`adr/P0-prefs-validate-history.md`](./adr/P0-prefs-validate-history.md)  
**Gate:** [`gate-report.md`](./gate-report.md) — **liberar com ressalvas**

---

## 0. Legenda

| Prioridade | Significado |
|---|---|
| **P0** | Bloqueia critérios §5 de operação quotidiana (preferências, config inválida, workspace identificável, histórico mínimo, métricas honestas na TUI default) |
| **P1** | Fluxos workspace/projeto, compatibilidade, continuidade explícita, help contextual — necessários ao gate §7 |
| **P2** | Perf comparativa, a11y/contraste, polish de taxonomia, matriz shells/paths |

| Coluna | Significado |
|---|---|
| **§5 aceate** | Critério(s) `V4.2-Operational-Excellence.md` §5 |
| **§5 testes** | Cenário(s) `V4-Tests-and-Benchmarks.md` §5 |
| **Arquivos** | Pontos de partida verificados (não lista exaustiva de diff) |
| **Audit** | IDs em `operational-audit.md` |

Dependências: V4.1 liberada com ressalvas; baseline em `docs/v4/V4.0/baseline/`.

---

## 1. P0 — Operação utilizável sem editar o repo

### P0-1 — Fachada de preferências (Handles + essenciais) — **DONE**

| | |
|---|---|
| **Problema** | `writeWorkspaceAgentHandles` existe mas não há CLI/TUI produto; `/config` só provider (C1/C2). |
| **Alvo** | Utilizador liga/desliga Handles (e vê consequence short) sem editar YAML; persistência workspace/profile conforme ADR Q3. |
| **§5 aceate** | Preferências essenciais sem editar ficheiros internos. |
| **§5 testes** | Alterar preferências após setup; Habilitar/desabilitar Handles + persistência. |
| **Arquivos** | `config-surface.ts`; `preference.ts`; `/config` slash; `help-usage.ts`; `tests/unit/v42-p0-operational.test.ts`. |
| **Não fazer** | Reescrever profile schema inteiro; forçar Handles ON. |
| **Audit** | C1, C2, C6 |
| **Entrega** | `evolve config prefs|set agent-handles on\|off`; `/config handles on\|off` |

### P0-2 — Validação de config com erro acionável — **DONE**

| | |
|---|---|
| **Problema** | Parse fail de profile/workspace YAML → fallback silencioso (C3/C4). |
| **Alvo** | Modo strict ou report: ficheiro, chave, correção sugerida; não fingir default sem aviso em fluxos interativos. |
| **§5 aceate** | Config inválida aponta opção e como corrigir. |
| **§5 testes** | Configuração inválida: mensagem identifica campo e correção; migração/config antiga (parcial). |
| **Arquivos** | `profile.ts` (`loadEvolveLoopProfileDetailed`, `validateWorkspaceConfigFile`); `evolve config validate`; warn no shell. |
| **Não fazer** | Quebrar hosts que dependem de default silencioso sem flag — preferir warn + exit code em CLI. |
| **Audit** | C3, C4 |
| **Entrega** | `evolve config validate` exit 1 + issues; stderr warn na TUI/REPL |

### P0-3 — Onboarding: preferências + consequências no setup — **DONE**

| | |
|---|---|
| **Problema** | `evolve setup` não menciona Handles/memory/wiki; credenciais em dois sítios (C5/C7). |
| **Alvo** | First-run (ou passo pós-ready) pergunta/mostra: Handles OFF default + 1 linha de consequência; aponta path canónico de credenciais; readiness inclui “prefs”. |
| **§5 aceate** | Preferências encontráveis; onboarding. |
| **§5 testes** | Onboarding instalação limpa; taxa config sem docs externos (indicador). |
| **Arquivos** | `first-run-setup.ts` (`prefs` no readiness); journey help. |
| **Não fazer** | Duplicar AGENTS.md DETECT pipeline dentro do orchestrator. |
| **Audit** | C5, C6, C7 |
| **Entrega** | `ReadinessReport.prefs` + limitations Handles OFF |

### P0-4 — Histórico mínimo: listar e retomar Tasks anteriores — **DONE**

| | |
|---|---|
| **Problema** | Home só latest MSO/contract; sem browse (H1/H5). |
| **Alvo** | Lista curta de Tasks/contratos recentes do workspace (read StateDb); selecionar → retomar ou mostrar limitação explícita se estado incompleto. |
| **§5 aceate** | Localizar e retomar sem reconstruir contexto; limitações explícitas. |
| **§5 testes** | Localizar tarefa anterior e retomar; inspecionar histórico; tempo histórico/retomada (benchmark). |
| **Arquivos** | `task-history.ts`; `StateDb.listMsoSessionsForWorkspace`; `evolve history`; `/history`. |
| **Não fazer** | Dashboard; inventar retomada perfeita; confundir com `continuity` handoff. |
| **Audit** | H1, H3, H4, H5 |
| **Entrega** | list/show + limitações explícitas; retomada via TUI/`evolve resume` |

### P0-5 — Proveniência na TUI default (compact + Delivery) — **DONE**

| | |
|---|---|
| **Problema** | Compact footer e Delivery omitem `estimated`/`reported` (O1/O2). |
| **Alvo** | Mesma disciplina `HonestMetric` do footer clássico na superfície Ink default; UNAVAILABLE não vira 0 silencioso. |
| **§5 aceate** | Métricas com origem; estimativas rotuladas. |
| **§5 testes** | Métricas distinguem medido / estimado / indisponível. |
| **Arquivos** | `footer-compact.ts`; `delivery-card-view.ts`; testes v42 + regressão M19/V4.1. |
| **Não fazer** | Expor telemetria measurement-plane na home. |
| **Audit** | O1, O2 |
| **Entrega** | `(reported)` / `(estimated)` / `(indisponível)` |

### P0-6 — Workspace ativo inequívoco na jornada — **DONE**

| | |
|---|---|
| **Problema** | Path mostrado, mas colisão com `evolve workspace` integration (W1/W3). |
| **Alvo** | Home/footer/help usam rótulo **Workspace** = cwd/estado; CLI integration passa a qualificar “integration/worktree” na help; CTA claro se estado não inicializado. |
| **§5 aceate** | Workspace ativo sempre identificável. |
| **§5 testes** | Identificar workspace; (prep) criar/selecionar. |
| **Arquivos** | `help-usage.ts`; `HomeResume.tsx`; `home-resume.ts`; `v35-commands.ts` usage notes. |
| **Não fazer** | Renomear breaking do grupo `workspace` sem deprecation (deixar P1). |
| **Audit** | W1, W3 |
| **Entrega** | Glossário na help advanced; Home copy cwd ≠ integration |

---

## 2. P1 — Workspace flows, compat, continuidade, help — **DONE** (V42-M3)

### P1-1 — Selecionar / trocar workspace (fachada) — **DONE**

| | |
|---|---|
| **Problema** | Troca = cd/--workspace; `project` registry paralelo (W2). |
| **Alvo** | Fluxo mínimo: listar recentes (cwd registados ou `project list`) + abrir com `--workspace`; confirmação do path ativo. |
| **§5 aceate** | Workspace identificável; operação recorrente. |
| **§5 testes** | Criar, selecionar e trocar workspace; tempo troca workspace. |
| **Arquivos** | `workspace-product-surface.ts`; `evolve use|switch`; recent ledger `~/.evolveloop/recent-workspaces.json`. |
| **Não fazer** | Multi-root mágico; dashboard. |
| **Audit** | W2, W5 |
| **Entrega** | `evolve use list|active|<path>`; confirma + `evolve --workspace` |

### P1-2 — Isolamento entre workspaces (prova + UX) — **DONE**

| | |
|---|---|
| **Problema** | Isolamento por path implícito; sem verificação utilizável (W4). |
| **Alvo** | Teste automatizado + mensagem: Task/contrato scoped a `state.db` do workspace; doc de limitação. |
| **§5 testes** | Contexto não vaza entre workspaces. |
| **Arquivos** | `v42-p1-workspace-continuity.test.ts`; notas em history/use + `compat-matrix.md`. |
| **Audit** | W4 |

### P1-3 — Inspecionar histórico / evidências (CLI) — **DONE**

| | |
|---|---|
| **Problema** | events/ledger/goal-db JSON-only (H4). |
| **Alvo** | `evolve history show <id>` (ou equivalente) com resumo humano: estado, evidências path, limitações. |
| **§5 aceate** | Histórico acessível; trilha decisões/evidências. |
| **§5 testes** | Inspecionar histórico e evidências. |
| **Arquivos** | `task-history.ts` show enriquecido (evidence ids + paths). |
| **Audit** | H4, H2 (copy: ≠ continuity) |

### P1-4 — Continuity: deixar limitações explícitas na UI — **DONE**

| | |
|---|---|
| **Problema** | Substituição Agent / handoff pouco traduzida para “o que foi preservado” (H3). |
| **Alvo** | Quando Agent REPLACED / handoff applied: 3 linhas — preservado / perdido / próximo passo. |
| **§5 aceate** | Explícito o preservado após falha/substituição; limitações. |
| **§5 testes** | (overlap V4.1 handles replaced; V4.2 retomada). |
| **Arquivos** | `continuity/limitation-ui.ts`; `presentation.ts`; `inspect-view.ts`; continuity show/apply. |
| **Audit** | H3, H2 |

### P1-5 — Taxonomia: desambiguar `workspace` CLI vs produto — **DONE**

| | |
|---|---|
| **Problema** | K3 / W1 / W5. |
| **Alvo** | Help advanced + journey notes; opcional alias `evolve integration …` deprecated path; não apagar ainda. |
| **§5 aceate** | Comandos críticos sem conflito. |
| **§5 testes** | Compat comandos públicos (prep V4.3). |
| **Arquivos** | `help-usage.ts`; `normalizeWorkspaceIntegrationGroup`; `V35_USAGE_GROUPS`. |
| **Audit** | K3, W1, W5 |
| **Entrega** | `evolve integration` → `workspace` (compat); grupo `workspace` mantido |

### P1-6 — Matriz de compatibilidade (smoke) — **DONE**

| | |
|---|---|
| **Problema** | §5 exige Node suportado, shells, tmux/Zellij on/off, config antiga, paths especiais, terminal estreito/baixo. |
| **Alvo** | Documento `docs/v4/V4.2/tests/compat-matrix.md` + smokes automatizáveis onde barato; LIMITATION onde não. |
| **§5 testes** | Toda a subsecção compatibilidade. |
| **Arquivos** | `docs/v4/V4.2/tests/compat-matrix.md`; smokes em `v42-p1-*.ts`. |
| **Não fazer** | Inventar passes. |

### P1-7 — Help contextual por tarefa (exemplos mínimos) — **DONE**

| | |
|---|---|
| **Problema** | Advanced JSON sem exemplos de tarefa (taxonomia §7). |
| **Alvo** | Estender journey help com 2–3 exemplos (setup prefs, history, switch workspace) sem alongar L0 demais. |
| **§5 aceate** | Atalhos documentados. |
| **Arquivos** | `help-usage.ts` journey_examples. |
| **Audit** | K2, K5 |

---

## 3. P2 — Perf, a11y, polish — **DONE** (V42-M4)

### P2-1 — Re-medir vs baseline V4.0 (comparativo) — **DONE**

| | |
|---|---|
| **Problema** | Sem relatório V4.2 (P1 audit §6). |
| **Alvo** | Mesmo roteiro `docs/v4/V4.0/baseline/repro-script.md`; registo §8; mediana+dispersão; decisão §9. |
| **§5 aceate** | Melhorias demonstradas por medições. |
| **§5 testes** | Benchmarks §5 (init, update, CPU/RSS, tempos onboarding/workspace/history). |
| **Arquivos** | `docs/v4/V4.2/baseline/*` (comparative-report, benchmark-log, raw-measurements). |
| **Não fazer** | Otimizar microbenchmarks sem latência percebida (risco planning §6). |
| **Entrega** | Mediana+MAD N≥3/5; comparative vs V4.0; sem claim de ganho de produto |

### P2-2 — Acessibilidade terminal (contraste, teclado, altura) — **DONE** (parcial + LIMITATION humana)

| | |
|---|---|
| **Problema** | Cor-only residual; rows baixas não degradadas (P2/P3 audit). |
| **Alvo** | Checklist: info sem cor; Tab/slash; aviso altura; NO_COLOR regression. |
| **§5 testes** | Navegar teclado; redimensionar; taxa erro teclado. |
| **Arquivos** | `layout-narrow.ts` (`LOW_ROWS`); `App.tsx` rows+AVISO; `v42-p2`; `navigation-a11y.md`. |
| **Audit** | P2, P3, P4 |
| **Entrega** | Rows&lt;12 notice + banner compact; NO_COLOR unit; taxa erro teclado = LIMITATION N=0 |

### P2-3 — Reduzir render / output desnecessário — **DONE** como **LIMITATION**

| | |
|---|---|
| **Problema** | §2.6 evitar render excessivo — medições após P2-1. |
| **Alvo** | Só se baseline mostrar hotspots (Ink re-render, probes HUD). |
| **Arquivos** | Sem patch — journey help já curto; sem hotspot Ink medido. |
| **Não fazer** | Premature optimization. |
| **Entrega** | Nota em `comparative-report.md` §3; reabrir só com harness/queixa |

### P2-4 — Unificar paths de credenciais (doc + redirect) — **DONE** (doc + precedência; ficheiros não mergeados)

| | |
|---|---|
| **Problema** | C7 duas casas. |
| **Alvo** | Documentar canónico; setup aponta para o mesmo que ProviderSetup **ou** lê ambos com precedência explícita. |
| **Arquivos** | `credentials-paths.ts`; `help-usage.ts`; `first-run-setup.ts`; `ProviderSetup.tsx`; `migration-notes.md`. |
| **Audit** | C7 |
| **Entrega** | Canónicos + precedência FreeLLM env &gt; secrets.env; unificação de ficheiro = fora |

### P2-5 — Version string / polish help advanced — **DONE**

| | |
|---|---|
| **Problema** | `0.1.0-v0-cli` em advanced JSON. |
| **Alvo** | Alinhar versão produto ou marcar “legacy label”. |
| **Arquivos** | `help-usage.ts` — `version: 2.0.0` + `legacy_cli_label`. |
| **Entrega** | `v42-p2` assert product version |

---

## 4. Ordem sugerida de execução

```text
P0-2 (validação) → P0-1 (prefs) → P0-3 (setup)
     → P0-5 (métricas TUI) → P0-6 (rótulo workspace) → P0-4 (histórico)
P1-1 / P1-5 (workspace taxonomy) → P1-2 (isolamento) → P1-3 / P1-4 (history+continuity)
     → P1-6 (compat) → P1-7 (help)
P2-1 (benchmarks) → P2-2 (a11y) → P2-3/4/5 conforme evidência
```

Gate V4.2 (§7): só após P0+P1 essenciais + evidências §5 + comparativo baseline (P2-1 ou LIMITATION explícita).

---

## 5. Fora de escopo (reafirmar)

- Reescrever motor de agentes / MSO core  
- Dashboard gráfico / painel de métricas na Home  
- Telemetria interna excessiva na UX default  
- Prometer recuperação perfeita sem dados  
- Apagar grupos CLI legados sem deprecation  

---

## 6. Evidência exigida ao fechar V4.2 (§9)

- Critérios §5: aprovado / reprovado / N/A com links  
- `docs/v4/V4.2/tests/` (funcional, compat, benchmarks §8)  
- Comparação com `docs/v4/V4.0/baseline/`  
- Regressões conhecidas + limitações  
- Decisão: liberar | liberar com ressalvas | bloquear  

---

*MSO TASK V42-M1 — backlog apenas; implementação = tarefas seguintes.*
