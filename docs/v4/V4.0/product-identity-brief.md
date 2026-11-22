# V4.0 — Product Identity Brief

**Status:** contrato-alvo de produto (V4.0 Identity)  
**Data:** 2026-11-22  
**Fontes:** `V4.0-Identity.md`; inventário `docs/v4/V4.0/cli-inconsistency-inventory.md`; tipos em `orchestrator/src/v3/**`  
**Wiki:** scout/search OK; pack UX EvolveLoop **ausente** no corpus (GAP wiki — não inventar contratos de vault).

---

## 1. O que o EvolveLoop é

O EvolveLoop é um **ambiente CLI-first** para delegar objetivos técnicos, acompanhar execução autônoma e controlar resultados com evidências.

Não é:

- um wrapper genérico de modelos;
- um lançador de agentes sem estado compartilhado;
- um dashboard gráfico com terminal opcional.

A orquestração (MSO, coordinator, adapters, task-graph) permanece **dentro** do sistema. O usuário precisa saber *o que está acontecendo*, *o que está bloqueado* e *o que exige ação* — sem precisar conhecer a arquitetura interna.

---

## 2. Posicionamento

| Dimensão | Contrato-alvo V4.0 | Comportamento atual (inventário) |
|---|---|---|
| Interface principal | Terminal (`evolve` → Ink TUI ou shell REPL) | Confirmado: `bin/evolve` → `orchestrator/dist/cli/evolve.js`; superfícies A–D no inventário §8 |
| Unidade de trabalho | **Task** (objetivo delegado) | Conflito: Intent / Goal Contract / Meta / Work / Job competem (inventário §1–§2) |
| Coordenação | **Orchestrator** (nome de produto); MSO como máquina interna | Usuário vê “MSO”, “Coordinator”, daemon — não “Orchestrator” (inventário §1, §6) |
| Resultado | **Delivery** com alterações, validação e limitações | Cartão TUI existe; `PASS` pode ser declarado sem `TRUE-FULL-PASS` nem verification (inventário §5) |
| Acesso a sessão de agente | **Agent Handle** opcional | **GAP:** sem tipo/comando/preferência (inventário §6) |

**Frase de posicionamento (produto):**

> EvolveLoop — CLI para delegar trabalho técnico, supervisionar agentes e aceitar entregas verificáveis.

---

## 3. Princípios de produto (1–7)

Estes princípios são **normativos** para V4.1–V4.3. Decisões de UI que os violem exigem ADR em `decisions-and-open-questions.md`.

### 1. CLI-first, não CLI-complicated

O terminal é a interface principal. Comandos e fluxos devem ser descobertos pelo uso comum, não por memorização da superfície completa.

- **Alvo:** jornada principal cabe nos conceitos Workspace → Task → Plan → execução → Approval (se houver) → Delivery.
- **Atual:** `usage()` em `evolve.ts` expõe dezenas de grupos (`circuit`, `harness`, `adapters`, …) além do modelo mental de 9 conceitos (inventário §8). Complexidade progressiva ainda não está aplicada.

### 2. Complexidade progressiva

A experiência comum é simples; controles avançados aparecem quando são relevantes.

- **Default:** estado da Task/Session, bloqueios, aprovações pendentes, Delivery.
- **Sob demanda:** logs detalhados, `agents inspect`, adapters/harness, circuit/jobs legados.

### 3. Autonomia com controle

Agentes executam sem microgerenciamento; decisões relevantes permanecem visíveis e controláveis.

- Autonomia: MSO avança estados (`INIT` → … → `VALIDATING` / `TRUE-FULL-PASS`) sem o usuário dirigir cada passo.
- Controle: Approval, revisão de Plan/Goal Contract, pause/cancel/resume, Delivery com evidências.

### 4. Estado antes de log

Apresentar primeiro: o que está acontecendo, o que está bloqueado, o que exige ação. Logs detalhados ficam sob demanda.

- **Atual (parcial):** TUI tem painéis/banner; shell ainda emite stream `MSO → …` (inventário §6). Banner mapeia `INIT`/`IDLE` → “Pronto” — risco de ocultar estado real (inventário §2, §5).

### 5. Resultado verificável

Conclusão deve apresentar alterações, evidências, validações e limitações. Não declarar sucesso sem suporte verificável.

- **Atual:** vários casos de sucesso sem evidência (inventário §5, itens 1–7 e 9) — **não** alinham a este princípio; V4.1 deve corrigir.

### 6. Consistência

Mesmos conceitos, nomes, estados e padrões de interação em toda a CLI (Ink TUI, shell REPL, subcomandos JSON/print).

- **Atual:** 10 clusters de sinônimos/conflitos (inventário §2); ≥8 state machines (inventário §3, §7).

### 7. CLI-only como direção

Não transformar a experiência principal em dashboard gráfico. Interfaces externas podem complementar o terminal; nunca substituir o fluxo principal.

- Agent Handles (tmux/Zellij ou similar) são **complemento opcional**, não a UX principal.

---

## 4. Linguagem de produto

**Usar:**

- direta, operacional, precisa;
- orientada a tarefas e resultados;
- explícita sobre incerteza, falha, espera e intervenção.

**Evitar:**

- jargão interno (`TRUE_FULL_PASS` vs `TRUE-FULL-PASS` vs Delivery `PASS`) na superfície sem glossário;
- nomes diferentes para o mesmo conceito;
- excesso de indicadores simultâneos;
- sucesso sem evidência (“Pronto”, “PASS” sem verification).

**Nomes internos vs produto:**

| Interno (código) | Produto (alvo) | Regra |
|---|---|---|
| MSO / CoordinatorService | Orchestrator (coordenação); estado de Session MSO pode mostrar fase operacional | Não exigir que o usuário diga “MSO” |
| Goal Contract | Plan (vista de decomposição) + contrato de aceite | Ver glossário — migração de rótulo |
| Workers (footer) | Agents | Unificar rótulo HUD |
| work_id sob “Tarefa” | mostrar Task id / título da Task | Corrigir rótulo mentiroso (`status-panel.ts`) |

---

## 5. Agent Handles — opcional / GAP atual

| Aspecto | Contrato-alvo V4.0 | Estado atual |
|---|---|---|
| Definição | Mecanismo de acesso à Session de um Agent (inspect/attach sem matar o processo) | **GAP** — inventário §1, §6 |
| Default | **Desligado**; execução normal sem janelas/sessões auxiliares | N/A (conceito inexistente) |
| Obrigatório para jornada? | Não | — |
| Preferência on/off | Prevista para V4.1 (testes); identidade V4.0 **contempla** o recurso | Preferência inexistente no profile/CLI inventariados |

V4.0 **não** implementa Handles. Documenta que são opcionais e que o fluxo principal deve funcionar sem eles.

---

## 6. Fora de escopo deste brief

- Reescrever motor MSO / coordinator.
- Novas capacidades de agentes sem justificativa de experiência.
- Dashboard web como UX principal.
- Estética por preferência visual sem legibilidade (ver `terminal-visual-guide.md`).

---

## 7. Critério de conclusão (Identity)

V4.0 Identity está operacional quando este brief, o glossário, a matriz de estados, os princípios de interação e o guia visual servem de **contrato de produto** para reconstruir a experiência — não quando cores ou componentes forem escolhidos.

**Dependência cumprida:** inventário M1 em `cli-inconsistency-inventory.md`.

---

*Fim — Product Identity Brief (entregável 1).*
