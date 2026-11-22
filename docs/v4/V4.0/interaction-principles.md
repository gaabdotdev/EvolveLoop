# V4.0 — Princípios de interação e hierarquia de informação

**Status:** contrato-alvo de UX CLI  
**Data:** 2026-11-22  
**Princípios-mãe:** Product Identity Brief §3 (1–7)  
**Presente:** `cli-inconsistency-inventory.md` §§4–6, §8

---

## 1. Hierarquia canónica (do mais importante ao menos)

Em qualquer vista default (Ink TUI ou shell), a ordem de atenção é:

1. **Ação exigida do usuário** (Approval pendente, confirmação de Plan, consentimento bloqueante, erro que impede progresso).
2. **Estado** da Task / Session / Orchestrator (o que está acontecendo agora).
3. **Bloqueios e espera** (BLOCKED, WAITING, aguardando modelo, pausa).
4. **Progresso resumido** (fase, Agents ativos, último sinal — sem dump de log).
5. **Delivery / resultado** quando a Task termina (com evidências).
6. **Logs e detalhe técnico** — só sob demanda.

**Regra:** se (1) e (2) competirem por espaço, (1) vence. Estado nunca fica atrás de um stream de log.

### Contrato-alvo vs atual

| Regra | Alvo | Atual |
|---|---|---|
| Estado antes de log | Banner/painel de estado; logs em `/status`, painel expansível ou modo verbose | Parcial: TUI tem banner + `ExecutionLive`; shell emite `MSO → …` no fluxo principal (inventário §6) |
| “Pronto” | Só quando o sistema aceita input **e** não há bloqueio oculto | `INIT`/`IDLE` → “Pronto” (`banner.ts:75-77`) — pode mentir readiness |
| Sucesso | Só com Delivery verificável | `Entrega Final · PASS` sem verification (inventário §5 #1) |

---

## 2. Default vs sob demanda

### Visível por padrão (default)

| Informação | Por quê |
|---|---|
| Workspace ativo (path/nome) | Contexto de isolamento |
| Task atual (id/título) + estado de produto | Unidade de acompanhamento |
| Fase/estado da Session (orquestração) | “O que está acontecendo” |
| Contagem ou lista curta de Approvals pendentes | Controle |
| Agents: contagem + 1 linha de status se relevante | Autonomia observável |
| Delivery resumida ao fim | Resultado verificável |
| Erros/bloqueios em linguagem operacional | Intervenção |

### Sob demanda (não poluir o default)

| Informação | Como obter (alvo) | Atual |
|---|---|---|
| Log completo / stream MSO | comando/status verbose, scroll de atividade | Shell já despeja no fluxo |
| Agent inspect completo (`AgentState`, contratos) | `agents inspect` | JSON CLI; TUI default não lista |
| Diff detalhado | `/diff` ou Delivery expandida | `/diff` existe (`slash-commands.ts`) |
| Adapters / harness / process sessions | `adapters` / `harness` | Grupos CLI presentes |
| Circuit, jobs, continuity internals | comandos avançados | Superfície ampla em `evolve.ts` usage |
| Agent Handle attach | só se Handles enabled | **GAP** |
| Tokens/métricas | com provenance (`reported`/`estimated`/`UNAVAILABLE`) | Painel pode sugerir “0 tok” sem provenance (inventário §5 #6) |

### Complexidade progressiva (comando)

1. `evolve` (sem args) → jornada Task.
2. Slash/comandos curtos de estado (`/status`, `status`, `progress`).
3. Grupos avançados (`agents`, `approvals`, `adapters`, …) quando o usuário precisa.

Não exigir que o usuário conheça `circuit`, `SkillJob` ou `WorkspaceLease` para concluir a jornada.

---

## 3. Autonomia com controle

### Autonomia (sistema age sozinho)

- Avançar fases da Session/Orchestrator.
- Delegar a Agents.
- Coletar sinais de progresso (“último sinal há Ns”).
- Recuperar quando a política permitir (`RECOVERING` → nova delegação).

### Controle (usuário decide)

| Momento | Ação do usuário | Alvo de apresentação |
|---|---|---|
| Antes de executar | Revisar Plan; confirmar | Cartão claro; Esc cancela |
| Operação sensível | Approval approve/reject | Fila + contexto da operação |
| Durante execução | pause / resume / cancel | Estado imediato; confirmação se destrutivo |
| Viewer de Agent (Handles) | attach / detach | Fechar viewer ≠ cancelar Agent |
| Fim | Aceitar Delivery ou reabrir Task | Evidências obrigatórias no PASS |

### O que não é controle

- Microgerenciar cada tool call do Agent no default.
- Exigir backend tmux/Zellij para a jornada funcionar.

---

## 4. Padrões de feedback por intenção

Alinhados a `terminal-visual-guide.md`. Conteúdo (não só estilo):

| Intenção | Deve comunicar | Não deve |
|---|---|---|
| **Progresso** | Fase + o que está em curso | Declarar conclusão |
| **Espera** | Por que espera + há quanto tempo | Parecer idle sem causa |
| **Bloqueio** | Causa + próxima ação possível | Só código interno sem remédio |
| **Erro** | O que falhou + como recuperar | Stacktrace como única mensagem |
| **Sucesso** | O que mudou + evidência + limitações | “PASS” / “Pronto” vazios |
| **Cancelamento** | O que parou + o que permanece (daemon, arquivos) | Ambiguir cancel UI vs cancel Task |

Amostras atuais a corrigir ou preservar:

- Preservar: aviso de que `TRUE-FULL-PASS` exige Evidence Validator (`shell-start-execution.ts:335-337`).
- Corrigir: `Entrega Final · PASS` após kick sem verification (inventário §5 #1).
- Corrigir: `Delegação concluída com status ok` como se fosse fim (inventário §5 #3).

---

## 5. Superfícies e consistência

| Superfície | Papel | Regra de interação |
|---|---|---|
| Ink TUI (`cli/tui/`) | Jornada principal | Hierarquia §1; slash mínimos |
| Shell REPL (`v3/evolve-shell/`) | Fallback conversacional | Mesmos termos; estado antes de stream |
| Subcomandos (`evolve.ts`, v35/v36) | Automação / script | JSON/`print` estável; nomes oficiais |
| Status board (`v3/tui/status-board.ts`) | Read-only | Só estado; sem ações destrutivas |

Mudança de termo em uma superfície exige a mesma mudança nas outras (princípio Consistência).

---

## 6. Agent Handles na interação

| Preferência | Comportamento de interação |
|---|---|
| **Off (default)** | Nenhuma janela/sessão auxiliar; jornada completa via TUI/CLI |
| **On** | Handle visível no inspect do Agent; `attach` sob demanda; desconectar não mata processo |

V4.0: documentar apenas. Implementação e testes de jornada com Handles = V4.1 (`V4-Tests-and-Benchmarks.md` §4).

---

## 7. Anti-padrões (proibidos no contrato-alvo)

1. Log contínuo como única visão de progresso.
2. Sucesso sem evidência verificável.
3. Mesmo rótulo para entidades diferentes (“Tarefa” = `work_id`).
4. Quatro fluxos de Approval com nomes quase iguais sem fila unificada.
5. Dashboard gráfico como caminho principal.
6. Estética que reduz legibilidade (ver guia visual).

---

*Fim — Princípios de interação (entregável 3).*
