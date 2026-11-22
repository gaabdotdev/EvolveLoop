# V4.1 — Mapa da jornada: atual vs alvo

**Status:** entregável 1 (`V4.1-Experience.md` §7.1)  
**Data:** 2026-11-22  
**Ciclo-alvo:** abrir → iniciar → plano → acompanhar → intervir → entrega  
**Fontes-alvo:** `V4.1-Experience.md` §2–§3; `docs/v4/V4.0/interaction-principles.md`; `state-matrix.md`; `glossary-and-mental-model.md`  
**Presente:** `cli-inconsistency-inventory.md` + código citado (path:linha)

---

## 0. Como ler

| Coluna | Significado |
|---|---|
| **Etapa** | Passo do ciclo cotidiano |
| **Atual** | O que o código/UI faz hoje (evidência) |
| **Alvo V4.1** | Experiência desejada (planning + V4.0) |
| **Gap** | Diferença acionável; `GAP` = conceito sem superfície |

Hierarquia de informação alvo: ação exigida → estado → bloqueio → progresso → Delivery → logs sob demanda (`interaction-principles.md` §1).

---

## 1. Tabela da jornada

### 1.1 Abrir (entrada / retomada)

| | |
|---|---|
| **Atual** | `bin/evolve` → `orchestrator/dist/cli/evolve.js` (`bin/evolve:15-21`). Sem args / `shell` / `repl` → Ink TUI se TTY (`evolve.ts:229-250`; `shouldUseInkTui` `cli/tui/index.ts:67-74`), senão REPL PT (`v3/evolve-shell/repl.ts`). Retomada parcial: notes prometem auto-detect `.evolveloop/state.db` (`evolve.ts:198`); `/status` lê sessão via `detectWorkspaceSession` (`App.tsx:220-221`) — **não** na home. Tela inicial **não** lista Tasks em andamento / que exigem intervenção — fase `ready` ou `provider` (`App.tsx:60-64`, `82`, `141`). Banner legado pode mapear INIT→“Pronto” (`banner.ts` via inventário §2). |
| **Alvo** | Identificar rápido: workspace ativo; Tasks em andamento; Tasks que exigem intervenção; opção clara iniciar/retomar. **Sem** painel de métricas nem lista longa de comandos (`V4.1-Experience.md` §3.1). Label “Aguardando entrada” ≠ MSO INIT (`decisions` D9). |
| **Gap** | Home de retomada ausente; Tasks pendentes/bloqueadas não são L0 na abertura; “Pronto” enganoso; superfície `usage()` (`evolve.ts:134-195`) é o oposto de “entrada limpa” se o usuário cai em `help`. |

### 1.2 Iniciar (criar / descrever tarefa)

| | |
|---|---|
| **Atual** | Input NL na TUI: placeholder “Descreva a **tarefa**…” (`App.tsx:552`) → `runIntentFlow` / Grill-Me (`App.tsx:384-421`) → Goal Contract. Alternativas CLI: `evolve intent`, `evolve goal create`, `evolve task add`, `evolve circuit run` (`evolve.ts` groups `intent`/`goal`/`task`/`circuit`). Múltiplas entidades competem (Intent/Goal/Meta/Work/Job) — inventário §1–§2. |
| **Alvo** | Uma entrada principal; linguagem natural preferencial; perguntas **só** quando alteram o plano ou evitam risco; sem formulário longo (`V4.1` §2, §3.2). Unidade: **Task** (glossário). |
| **Gap** | Vocabulário único Task não estabelecido (Q2 em `decisions-and-open-questions.md`); Grill-Me existe (bom) mas rótulos Goal Contract/Meta competem; caminhos CLI paralelos obrigam memorização. |

### 1.3 Plano (entender antes de executar)

| | |
|---|---|
| **Atual** | Fase TUI `review` + `GoalContractReview` (`App.tsx:347`, `512-513`) — título **Goal Contract**, não “Plan”. CLI: `task approve-plan`, `hierarchy approve`, `confirm_mso` (`shell-start-execution` / `App.tsx:250-257`). Interno: `PLAN_APPROVED` condição, não label de produto (inventário §1). |
| **Alvo** | Plano legível: objetivo + critérios; etapas/dependências; Agents/capacidades relevantes; riscos/permissões/custos; o que roda autónomo (`V4.1` §3.3). Rótulo produto **Plan** (glossário; D2). |
| **Gap** | Label “Plan” ausente na TUI; cartão não padroniza riscos/custos/Agents como secções; Approval de Plan não entra na fila unificada `approvals`. |

### 1.4 Acompanhar (execução / supervisão)

| | |
|---|---|
| **Atual** | Fase `busy` + `ExecutionLive` + activity window (`App.tsx:261`, `516`; `activity-window.ts`). Footer mostra `[mso_state]` e `Workers` tokens (`footer-compact.ts:73-80`). Shell emite stream `MSO → …` (`shell-start-execution.ts` ~332). CLI: `status`, `progress`, `evolve tui status` (board `status-board.ts`), `/status` slash. **Não** lista `AgentState` no default TUI (inventário §3.3). |
| **Alvo** | Estado da Task compreensível **sem** abrir cada Agent; distinguir execução / espera / bloqueio / falha / cancelamento / conclusão (`V4.1` §3.4; state-matrix §6). Estado **antes** de log (D4). Footer/HUD: **Agents**, não Workers. |
| **Gap** | Hierarquia L0–L3 incompleta no shell (log no fluxo); estados Task vs MSO vs Agent misturados na cabeça do usuário; painel `Tarefa:` = `work_id` (`status-panel.ts:44-56`); sem fila Approval na TUI. |

### 1.5 Intervir (aprovação / pausa / cancel / orientação)

| | |
|---|---|
| **Atual** | **Pausa:** Ctrl+P TUI (`App.tsx:195-198`) / shell `MSG_PAUSE` (`keybindings.ts:33-34`); CLI `pause`/`resume`; V3.6 `workflow pause|resume`. **Interrupt:** Ctrl+C graceful/force (`keybindings.ts:27-31`; TUI `App.tsx:185-188`). **Detach:** Ctrl+D (`App.tsx:190-193`; `MSG_DETACH_*` `keybindings.ts:36-40`) — ciclo de vida daemon, **não** Agent Handle. **Approvals store:** `evolve approvals list\|approve\|reject` (`v35-commands.ts:292-368`) — **fora** da Ink TUI. Gates paralelos: Goal Confirm, harness consent, `approve-plan`, `confirm_mso` (inventário §2). |
| **Alvo** | Ações explícitas e contextualizadas; destrutivo ≠ navegação; Approval com o quê/porquê/impacto (`V4.1` §2, §3.5; D8). Handles opcionais: fechar viewer ≠ matar Agent (§4). |
| **Gap** | Quatro gates sem fila TUI; pause TUI é flag local UI (`setPaused`) — relação com pause de Task/Orchestrator pouco clara ao usuário; sem `evolve agent attach`; detach fala daemon. |

### 1.6 Entrega (resultado verificável)

| | |
|---|---|
| **Atual** | Fase `delivery` + `DeliveryCard` (`App.tsx:297`, `518+`). Status derivado: default **PASS** se kick started e não BLOCKED (`App.tsx:282-287`) — **sem** exigir `TRUE-FULL-PASS` nem `verification` preenchido (inventário §5 #1). Shell devolve `message_pt` + estado MSO, sem o mesmo cartão. Diff pode ser vazio sob título PASS. |
| **Alvo** | Resumo + alterações + testes + evidências + falhas conhecidas + próximos passos; separar “processo terminou” de “objetivo validado” (`V4.1` §3.6; princípio Resultado verificável; D5). |
| **Gap** | Bug de contrato Delivery PASS; tokens/provenance incompletos; sem diferenciação verificada vs não verificada na cópia. |

---

## 2. Agent Handles na jornada (transversal)

| | |
|---|---|
| **Atual** | **GAP total** — sem tipo/comando/preferência `AgentHandle` (inventário §6; glossário; D3). Closest: `agents list\|inspect` JSON (`evolve.ts:842-853`; `v35-commands.ts:371-384`); `adapters sessions` / `session-cancel` (`evolve.ts:1145-1161`); `harness sessions` (`v35-commands.ts:221-228`); daemon detach. `attach*` no código = observer/keybindings/process identity — **não** UX de Handle. |
| **Alvo** | Preferência on/off; CLI principal centro; `inspect`/`attach`/`logs` sob demanda; fechar viewer ≠ kill; backend ausente não bloqueia jornada (`V4.1` §4). |
| **Gap** | Toda a fatia Handles + testes §4 específicos — ver backlog P1. |

---

## 3. Diagrama resumido

```text
                    ATUAL (Ink path)                    ALVO V4.1
abrir     evolve → provider|ready                 → home: WS + Tasks + ação
iniciar   NL → Grill → Goal Contract              → NL → Task (+ perguntas mínimas)
plano     GoalContractReview                      → Plan (critérios, riscos, Agents)
executar  busy + ExecutionLive + MSO stream       → estado Task/Session L1; log L5
intervir  Ctrl+P/C/D · gates dispersos            → Approval unificada + pause/cancel claros
entrega   Delivery PASS frágil                    → Delivery com evidência obrigatória
handles   (inexistente)                           → opcional; fallback CLI
```

---

## 4. Critérios de aceite tocados por etapa

| Etapa | Critérios `V4.1-Experience.md` §8 |
|---|---|
| Abrir / iniciar | Iniciar tarefa comum sem docs; TUI em dimensões suportadas |
| Plano | Aprovação com contexto (quando Plan exige OK) |
| Acompanhar | Distinguir estado Task / Agent / Session; bloqueios sem logs brutos |
| Intervir | Approval contextual; Handles on/off; fechar viewer ≠ kill Agent |
| Entrega | Resultados verificados vs não verificados |

Mapeamento fino → `implementation-backlog.md`.

---

## 5. Limites desta auditoria

- Inspeção estática + docs V4.0; **não** dogfood TUI interativo completo nesta tarefa.
- Q1/Q2 (literal de sucesso de produto; Task = qual entidade) **ainda abertas** — jornada-alvo usa nomes de produto; runtime mapping fica ADR na implementação.
- Wiki pack EvolveLoop UX: ausente.

---

*Fim — journey map (V41-M1).*
