# V4.0 — Decisões e questões abertas (ADR-lite)

**Status:** registro de Identity  
**Data:** 2026-11-22  
**Entradas:** `V4.0-Identity.md`; inventário M1; briefs deste diretório  
**Regra:** decisões aqui orientam V4.1–V4.3; questões abertas **não** inventam runtime.

---

## A. Decisões tomadas (V4.0 Identity)

### D1 — CLI-only como experiência principal

- **Decisão:** Terminal (`evolve` TUI/shell) é a UX principal; dashboard gráfico não substitui o fluxo.
- **Motivo:** Identity §2 princípio 7; inventário confirma entrypoint CLI.
- **Consequência:** Agent Handles e UIs externas são complementares e opcionais.
- **Status:** aceita.

### D2 — Nove conceitos oficiais; resto é legado ou interno

- **Decisão:** Workspace, Task, Plan, Agent, Orchestrator, Session, Agent Handle, Approval, Delivery são o vocabulário de produto. Intent/Goal/Work/Job/Circuit/Workers não são sinônimos oficiais.
- **Motivo:** Identity §4 + glossário; inventário §1–§2 mostra conflitos.
- **Consequência:** V4.1 deve migrar rótulos (ex.: Workers → Agents; Goal Contract UI → Plan + aceite).
- **Status:** aceita (migração de UI = trabalho futuro).

### D3 — Agent Handles são opcionais; default off; GAP no presente

- **Decisão:** Identity contempla Handles; implementação e preferência on/off ficam para V4.1+. Jornada deve funcionar sem Handles.
- **Motivo:** inventário §6 GAP total; V4-Tests §4 exige testes com off e on.
- **Consequência:** não bloquear V4.0 Identity pela ausência de Handles.
- **Status:** aceita.

### D4 — Estado antes de log

- **Decisão:** Hierarquia L0 ação → L1 estado → … → L5 log (`interaction-principles.md`, `terminal-visual-guide.md`).
- **Motivo:** Identity princípio 4; shell atual ainda streama MSO no fluxo (inventário §6).
- **Consequência:** V4.1 reduz spam de log no default.
- **Status:** aceita como contrato; implementação pendente.

### D5 — Sucesso exige evidência verificável

- **Decisão:** Delivery `PASS` / “concluída” / “Pronto” de sucesso só com alterações/validação/limitações honestas. Casos inventário §5 são **não-conformes**.
- **Motivo:** Identity princípio 5; V4-Tests §3.
- **Consequência:** corrigir derivação em `App.tsx` / cartão Delivery na V4.1.
- **Status:** aceita como contrato; bug de contrato documentado.

### D6 — Qualificar literais de sucesso por camada

- **Decisão:** Não unificar os literais de runtime nesta fase; unificar a **apresentação** de produto e proibir “PASS” genérico sem camada (Task vs Work vs MSO vs Delivery). Ver `state-matrix.md` §1.3.
- **Motivo:** inventário §2 / §9 #1 — unificar literais exige mudança de motor; Identity não reescreve o motor.
- **Consequência:** glossário + UI traduzem; JSON/verbose mantêm literais.
- **Status:** aceita (compromisso consciente).

### D7 — Session de produto = orquestração (MSO); processo é detalhe

- **Decisão:** Estado default de Session na jornada = fases MSO traduzidas. ProcessSession só em inspect/Handles.
- **Motivo:** inventário §3.4 múltiplas sessões; Identity §4 Session como contexto de execução/terminal do trabalho.
- **Consequência:** slash/status devem dizer qual Session.
- **Status:** aceita.

### D8 — Approval como conceito único de UX; gates internos tipados

- **Decisão:** Usuário vê **Approval**; tipos (Plan, spawn, capability, início MSO) são metadado. Fila TUI é alvo V4.1.
- **Motivo:** inventário §2 quatro gates; Identity um conceito Approval.
- **Consequência:** não apagar stores distintos sem desenho; unificar apresentação primeiro.
- **Status:** aceita como direção UX.

### D9 — “Pronto” não mapeia MSO INIT/IDLE

- **Decisão:** Remover equivalência banner `INIT`/`IDLE` → “Pronto” no contrato-alvo; usar “Aguardando entrada” (fase UI) vs “Session: início”.
- **Motivo:** inventário §2, §5 #4; MSO não tem IDLE.
- **Consequência:** mudança de copy na V4.1.
- **Status:** aceita.

### D10 — Estética subordinada à legibilidade

- **Decisão:** Guia visual fixa semântica de cor/símbolo/densidade; proíbe skin por preferência.
- **Motivo:** Identity §6 fora de escopo; V4-Tests compreensão de estados.
- **Status:** aceita.

---

## B. Questões não resolvidas

Herdadas do inventário §9 e abertas pela Identity:

### Q1 — Literal canónico de sucesso de *produto* — **fechada (V4.1 ADR)**

- **Pergunta:** A cópia humana padroniza em torno de qual âncora — Task `TRUE_PASS`, Work `TRUE_FULL_PASS`, MSO `TRUE-FULL-PASS`, ou só Delivery “Aceita”?
- **Decisão:** Delivery “Entrega aceita” só com verification; `UNVERIFIED` quando processo terminou sem validação. Ver `docs/v4/V4.1/adr/Q1-success-copy.md`.
- **D6** mantém literais de runtime; só a apresentação de produto foi ancorada.

### Q2 — Task de usuário = qual entidade de runtime? — **fechada (V4.1 ADR)**

- **Opções:** (a) Goal Contract id, (b) Work/`work_id`, (c) nó TaskGraph/`task_id`, (d) fachada nova que agrega.
- **Decisão:** (d) fachada UX sobre Goal Contract + Session MSO; IDs runtime inalterados. Ver `docs/v4/V4.1/adr/Q2-task-entity.md`.

### Q3 — Agent Handle: desenho sobre o quê? — **fechada (V4.1 ADR)**

- **Opções:** (a) wrapper UX sobre `ProcessSession`/`session_id`, (b) novo id estável ligado a `AgentRecord`, (c) adiar desenho fino até spike V4.1.
- **Decisão:** (a)+(AgentRecord): fachada UX; preferência default off; attach tmux→Zellij→CLI fallback; fechar viewer ≠ kill. Ver `docs/v4/V4.1/adr/Q3-agent-handle.md` e `docs/v4/V4.1/agent-handles.md`.

### Q4 — Unificar stores de Approval ou só a UI? — **fechada (V4.1 ADR)**

- **Opções:** (a) fachada de fila sobre gates existentes, (b) migrar Goal confirm / consent para `ApprovalRequest`, (c) manter paralelo indefinidamente.
- **Decisão:** (a) fachada TUI/CLI sobre `ApprovalStore`; migração consent adiada. Ver `docs/v4/V4.1/adr/Q4-approval-facade.md`.

### Q5 — Aposentadoria visível de Job/SkillJob / Circuit na CLI de produto?

- **Opções:** ocultar do `usage()` default; deprecar; manter para automação.
- **Impacto:** complexidade progressiva (princípio 2).
- **Próximo:** política de superfície pública V4.1/V4.2.

### Q6 — Nome “Orchestrator” vs manter “MSO” na UI

- **D2** diz Orchestrator é produto; operadores atuais já falam MSO.
- **Opções:** (a) só Orchestrator, (b) “Orchestrator (MSO)”, (c) MSO na UI + Orchestrator só em docs.
- **Próximo:** teste de compreensão (V4-Tests §3) com usuários do projeto.

### Q7 — Plan vs Goal Contract: um artefacto ou dois?

- **Glossário:** Plan = decomposição; Goal Contract pode permanecer como artefacto de aceite.
- **Não resolvido:** um cartão ou dois na TUI; o que `approve-plan` aprova exatamente na linguagem nova.
- **Próximo:** wireframe textual na V4.1.

### Q8 — Wiki pack UX EvolveLoop

- **Gap:** vault sem pack canónico (inventário §6; ground.sh 2026-11-22).
- **Não bloqueia** docs in-repo; bloqueia grounding futuro via `/wiki`.
- **Próximo:** ingest opcional do diretório `docs/v4/V4.0/` no corpus (fora deste task se workdir = só repo).

---

## C. Rastreio de aceite Identity

| Critério (Identity §8 / Tests §3) | Evidência |
|---|---|
| Definições únicas não contraditórias | `glossary-and-mental-model.md` |
| Estados inequívocos | `state-matrix.md` |
| Default vs sob demanda | `interaction-principles.md` §2 |
| Orienta UI concreta | `terminal-visual-guide.md` + princípios |
| CLI-only + Handles opcionais | Brief §5; D1, D3 |
| Revisado contra fluxos reais | Referências ao inventário em todos os docs |
| Inventário de inconsistências | `cli-inconsistency-inventory.md` (M1) |

**Não concluído nesta entrega:** teste de compreensão com usuários externos; baseline numérica (pasta `baseline/` separada).

---

## D. Changelog deste registro

| Data | Evento |
|---|---|
| 2026-11-22 | Criação M2–M6 Identity docs; D1–D10; Q1–Q8 |
| 2026-11-22 | Q1/Q2 fechadas via ADR V4.1 (Delivery copy; Task fachada) |
| 2026-11-22 | Q3/Q4 fechadas via ADR V4.1 (Handles fachada; Approval fachada) |

---

*Fim — Decisões e questões (entregável 6).*
