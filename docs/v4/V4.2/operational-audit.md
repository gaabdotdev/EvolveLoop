# V4.2 — Auditoria Operational Excellence

**Status:** mapa atual vs alvo (pré-implementação)  
**Data:** 2026-11-22  
**Alvo:** `V4.2-Operational-Excellence.md` §2 + critérios §5  
**Testes:** `V4-Tests-and-Benchmarks.md` §5  
**Regra:** não inventar comportamento — citar path:linha. Precedência: código > docs.

---

## 0. Resumo executivo

| Domínio (§2) | Estado | Veredito |
|---|---|---|
| 2.1 Configuração / onboarding | Setup first-run + profile YAML + Provider TUI; preferências produto pouco expostas | **Parcial** — gaps P0 em validação acionável e UI de preferências |
| 2.2 Workspaces / projetos | Workspace ≈ cwd; Home mostra path; `workspace` CLI = integration/worktree; `project` = registry ops | **Parcial** — ambiguidade de três entidades; troca explícita fraca |
| 2.3 Comandos / atalhos | Journey help + slash V4.1; advanced JSON denso | **Parcial** — taxonomia melhorou; colisões de nome e descoberta residual |
| 2.4 Observabilidade | Proveniência no footer clássico; compact/Delivery omitem rótulos | **Parcial** — honestidade incompleta na superfície TUI default |
| 2.5 Histórico / continuidade | Home resume latest; continuity = handoff Agent; sem browse de Tasks históricas | **Gap forte** — localizar/retomar histórico além do “último” |
| 2.6 Perf / a11y terminal | Baseline V4.0; narrow layout; NO_COLOR; resize | **Parcial** — medições existem; a11y/contraste e benchmarks V4.2 ainda não |

**Gate §7 (alvo):** “Configuração, workspace, histórico, observabilidade e compatibilidade validados” — **não atingido** nesta M1 (só auditoria).

---

## 1. Configuração e onboarding (§2.1)

### 1.1 Alvo

- Onboarding revisado; opções por intenção do usuário; consequências explícitas.
- Revisar/alterar preferências (ex.: Agent Handles) sem editar ficheiros internos quando houver UI.
- Config inválida → campo + correção.

### 1.2 Estado atual (evidência)

| Peça | Papel | Path |
|---|---|---|
| First-run setup | `evolve setup` → probes + credentials 0600 + limits.json + readiness | `first-run-setup.ts:1-5`, `277-309`; router `evolve.ts:213-229` |
| Profile load | `profiles/default.yaml` → knowledge/memory/preferences | `profile.ts:82-134`; `profiles/default.yaml:1-26` |
| Handles preference | resolve env → workspace config → profile → default false; **write** API | `preference.ts:48-81`, `90-107` |
| `/config` slash | Só abre Provider / API key | `slash-commands.ts:31`; `slash-handlers.ts:146-150`; `App.tsx` phase `provider` |
| ProviderSetup | Credenciais em `~/.config/evolveloop/` 0600 | `ProviderSetup.tsx:3` |
| Install / AGENTS | Pipeline DETECT→… separado do `evolve setup` | `AGENTS.md`; `agent-setup/` |

### 1.3 Gaps

| ID | Gap | Evidência | Critério §5 / teste §5 |
|---|---|---|---|
| C1 | Preferências essenciais (Handles, memory, knowledge) **não** têm comando/TUI produto para alterar — só YAML/env/API de teste | `writeWorkspaceAgentHandles` usado em testes (`v41-p1-handles-approvals.test.ts:65`), **não** em `cli/` | Preferências sem editar ficheiros; §5 “Alterar preferências”; “Habilitar/desabilitar Agent Handles” |
| C2 | `/config` = provider only — não agrupa por intenção (Handles / limites / knowledge) | `slash-handlers.ts:146-150` | §2.1 agrupar por intenção |
| C3 | Profile YAML inválido / parse fail → **fallback silencioso** a DEFAULT, sem mensagem de campo | `profile.ts:124-132` (`catch` → default) | “Config inválida aponta opção e correção” |
| C4 | Workspace `config.yaml` YAML inválido → `readYamlFile` ignora (`catch` vazio) | `preference.ts:25-35` | Idem |
| C5 | Setup first-run não guia Handles / memory / wiki path — só probes + credentials + limits | `runFirstRunSetup` `277-309`; limits `DEFAULT_LIMITS:65-69` | Onboarding instalação limpa §5 |
| C6 | Consequências de opções (ex. Handles ON → sessões auxiliares) só em docs V4.1, não no fluxo setup/UI | `agent-handles.md`; attach soft-fail copy em `attach.ts:116` | §2.1 explicar consequências |
| C7 | Duas “casas” de credenciais: `.evolveloop/credentials.env` (setup) vs `~/.config/evolveloop/` (ProviderSetup) | `first-run-setup.ts:81-83`; `ProviderSetup.tsx:3` | Clareza operacional; risco de ambiguidade |

### 1.4 O que já está OK

- Handles default OFF no profile (`profiles/default.yaml:24-26`; `DEFAULT_PROFILE` `profile.ts:53`).
- Secrets redacted no readiness (`first-run-setup.ts:74-78`, `198-200`).
- Credenciais setup mode 0600 (`writeCredentialsSecure` `201-233`).
- Nome de credential inválido lança erro acionável (`218`: `invalid credential name`).

---

## 2. Workspaces e projetos (§2.2)

### 2.1 Alvo

- Workspace ativo sempre identificável; criar/selecionar/retomar simples; sem ambiguidade cwd ↔ projeto registado ↔ contexto Task; segurança/limites preservados.

### 2.2 Estado atual

| Entidade | Significado no código | Superfície |
|---|---|---|
| **Workspace (produto / cwd)** | Estado em `<cwd>/.evolveloop/`; `--workspace` / `--cwd` | `evolve.ts:3`, `179-188`; `detectWorkspaceSession` `workspace-session.ts:23+` |
| **Home display** | Path encurtado + Tasks curtas | `home-resume.ts:46`, `101-103`; `HomeResume.tsx:28` |
| **`evolve workspace *`** | IntegrationCoordinator / worktrees (V3.5) — **não** “trocar projeto ativo” | `v35-commands.ts:235-289`, usage `422` |
| **`evolve project *`** | Registry ops (add/list/inspect/doctor/…) | `v36-commands.ts:49+` |
| Glossário V4.0 | Workspace = contexto; alvo “um ativo; Tasks não vazam” | `glossary-and-mental-model.md` §Workspace |

### 2.3 Gaps

| ID | Gap | Evidência | §5 / §5 testes |
|---|---|---|---|
| W1 | Três nomes “workspace/project/worktree” sem fachada única de seleção | `v35` workspace vs `v36` project vs cwd | “Criar, selecionar e trocar workspace”; glossário |
| W2 | Troca de workspace = `cd` / `--workspace`; sem fluxo produto “switch” com confirmação de contexto | Shell entry `evolve.ts:179-188` | Tempo/passos troca workspace (benchmark §5) |
| W3 | Home mostra **um** cwd; não lista projetos registados nem worktrees como escolha | `buildHomeResumeView` | Identificar workspace ativo nos fluxos |
| W4 | Isolamento entre workspaces é por path de `.evolveloop/` — **não** há teste/UX que prove “contexto não vaza” ao utilizador | Convenção + StateDb scoped; sem comando “verify isolation” | §5 “contexto de tarefa não vaza” |
| W5 | `evolve workspace list` sem `--work-id` devolve worktrees **vazios** + nota técnica | `v35-commands.ts:237-244` | Descoberta / intenção do utilizador |
| W6 | Lease / ownership (`v3/workspace/ownership.ts`) pouco exposto na jornada | inventário V4.0; ownership module | Segurança sem confundir UX |

### 2.4 OK parcial

- Footer idle inclui `workspace_display` (`footer-compact.ts:84`).
- Banner / Home identificam path do workspace atual.
- Sandbox/limites por workspace via `.evolveloop/limits.json` no setup.

---

## 3. Comandos e atalhos (§2.3)

Ver detalhe em [`command-taxonomy-current.md`](./command-taxonomy-current.md).

### Gaps resumidos

| ID | Gap | Path |
|---|---|---|
| K1 | Journey help menciona slash `/plan` etc.; alinhado V4.1 — OK | `help-usage.ts:9-30` |
| K2 | `evolve help advanced` ainda é JSON denso de dezenas de grupos | `help-usage.ts:34-121` |
| K3 | Colisão semântica: `workspace` (integration) ≠ Workspace produto; `service logs` ≠ `agents logs` | `v35-commands.ts:422`; V4.1 audit |
| K4 | Sem `evolve config` / `evolve preferences` produto | ausência em `cli/` (grep) |
| K5 | Compatibilidade: aliases `agent`→`agents` existem; deprecations pouco documentadas no CLI | `help-usage.ts:63-64`; `normalizeAgentsGroup` |

---

## 4. Observabilidade (§2.4)

### 4.1 Estado atual

| Camada | Comportamento | Path |
|---|---|---|
| HonestMetric | `reported` \| `estimated` \| `UNAVAILABLE` | `footer.ts:12-20` |
| Footer clássico | Rótula estimated/reported; idle esconde UNAVAILABLE spam | `footer.ts:133-161`, `3-4` |
| Compact footer (TUI default) | Tokens via `metricTok` **sem** sufixo provenance | `footer-compact.ts:42-55`, `106+` |
| Delivery tokens | Números ou "—" sem origem | `delivery-card-view.ts:40-47`, `74-76` |
| HUD | Campos ausentes → UNAVAILABLE | `hud.ts:3`, `46-53` |
| Status board | `evolve tui status` read-only | `evolve.ts` + `status-board.ts` |
| Logs | Stream técnico off default (V4.1 P0-4) | journey / ExecutionLive |

### 4.2 Gaps

| ID | Gap | Evidência | §5 |
|---|---|---|---|
| O1 | Superfície TUI compacta **não** propaga rótulo estimated/reported | `footer-compact.ts:42-55` vs `footer.ts:133-136` | Métricas com unidade/escopo/origem |
| O2 | Delivery card tokens sem proveniência | `delivery-card-view.ts` | Idem |
| O3 | `status-panel` / HUD podem ainda expor jargon interno em caminhos clássicos | `status-panel.ts:62` (“0 tokens”) | Logs/detalhe sob demanda; clareza |
| O4 | Não há painel único “estado · bloqueio · ação” vs “detalhe técnico sob demanda” documentado como contrato V4.2 | parcialmente V4.1 L1 | §2.4 priorizar estado/bloqueios |
| O5 | Measurement-plane migrate existe, mas **fora** da jornada operacional quotidiana | `telemetry/measurement-plane/migrations.ts` | Não confundir telemetria interna com UX |

### 4.3 OK

- Modelo de proveniência existe e é testável no footer clássico.
- Idle não spam UNAVAILABLE (`footer-compact.ts:3-4`).
- PASS Delivery só com evidência (V4.1) — alinhado a não inventar métricas de sucesso.

---

## 5. Histórico e continuidade (§2.5)

### 5.1 Estado atual

| Capacidade | O que faz | Path |
|---|---|---|
| Home resume | Latest MSO + latest Goal Contract (máx. 5) | `home-resume.ts:27`, `49-89` |
| `evolve resume` | Intent trivial / session detect | `evolve.ts:309-312`, `450-477` |
| Continuity | handoff / apply / show (substituição Agent) | `evolve.ts:913+`; `v3/continuity/` |
| Events / ledger | JSON por work-id | `evolve.ts:982+`, `997+` |
| Goal DB list | `listValidatedGoalContracts` via `goal-db` / goal show | `evolve.ts:518-531` |
| Input history TUI | Histórico de **input** visual (não Tasks) | `input-history.ts`; `/clear` cosmético |

### 5.2 Gaps

| ID | Gap | Evidência | §5 / testes |
|---|---|---|---|
| H1 | Não há “encontrar Task anterior” além do latest no Home | `buildHomeResumeView` só latest | Localizar e retomar; benchmark tempo histórico |
| H2 | Continuity ≠ histórico de utilizador — fácil confundir | grupo `continuity` em help advanced | Vocabulário V4.0 |
| H3 | Limitações de retomada parcial pouco explícitas na UI (além “retomável” / estados MSO) | `home-resume.ts:103` | “Apresentar limitações quando estado não permitir retomada integral” |
| H4 | Evidências/decisões: stores existem; browse produto ausente | evidence builders; ApprovalStore CLI | Inspecionar histórico e evidências §5 |
| H5 | `evolve resume` via intent flow imprime JSON + side-channels — não UX de lista | `evolve.ts:447-515` | Retomada acessível pela CLI |

---

## 6. Performance e acessibilidade terminal (§2.6)

### 6.1 Estado atual

| Item | Evidência |
|---|---|
| Baseline V4.0 | `docs/v4/V4.0/baseline/` — cold `--help` mediana ~466 ms; classic REPL to prompt ~520 ms |
| Narrow layout | `<72` cols → stack + notice (`layout-narrow.ts:18-26`; `App.tsx:149`, `736-738`) |
| Resize | `process.stdout` resize listener (`App.tsx:189-191`) |
| NO_COLOR | `colors.ts:3`, `24-27`; banner/spinner respeitam |
| Teclado | Ctrl+P/C/D; slash menu (`App.tsx`; `slash-commands.ts`) |
| Benchmarks V4.2 | **Ainda não** — M1 só docs |

### 6.2 Gaps

| ID | Gap | Notas |
|---|---|---|
| P1 | Sem relatório comparativo V4.2 vs baseline (init, update latency, CPU/RSS idle/load) | §5 benchmarks; §8 formato |
| P2 | Contraste / legibilidade sem cor: depende de texto + NO_COLOR; **sem** auditoria sistemática de pares cor-only | §2.6; teste teclado/resize §5 |
| P3 | Altura reduzida (rows) — narrow trata **cols**; degradação por poucas linhas **não** auditada como feature | overlap V4.1 P0-6 |
| P4 | Taxa de erro navegação teclado / matriz shells-emulators — N=0 | Compat §5 |
| P5 | Paths com espaços / non-ASCII — não inventar pass; marcar para matriz compat | §5 compatibilidade |

---

## 7. Matriz critérios de aceite §5

| Critério §5 | Status | Nota |
|---|---|---|
| Preferências essenciais encontráveis/alteráveis sem editar ficheiros (com UI) | **FAIL** | C1/C2 |
| Config inválida → campo + correção | **FAIL** | C3/C4 |
| Workspace ativo identificável nos fluxos relevantes | **PASS parcial** | Home/footer path; W1 ambiguidade |
| Localizar e retomar Task anterior sem reconstruir tudo | **FAIL parcial** | Só latest (H1) |
| Métricas: unidade, escopo, origem; estimativas rotuladas | **PASS parcial** | Clássico OK; compact/Delivery O1/O2 |
| Logs detalhados não dominam default | **PASS** | V4.1 stream off |
| Atalhos/comandos críticos documentados sem conflito | **PASS parcial** | Journey help; K3 colisões |
| Melhorias perf demonstradas por medições | **N/A** | Só após implementação + re-medida |

---

## 8. Fontes cruzadas

- Planning V4.2 §1–§7  
- Tests §5, §7–§9  
- V4.0 glossário Workspace; baseline  
- V4.1 journey-map, tui-command-audit, agent-handles, help-usage, gate-report  

**GAP wiki:** pack EvolveLoop ausente.

---

*V42-M1 — auditoria apenas.*
