# V4.0 — Glossário e modelo mental oficial

**Status:** definições canónicas de produto (contrato-alvo) + mapeamento legado  
**Data:** 2026-11-22  
**Precedência:** código verificado > este glossário > planning. Onde o código não expõe o conceito → **GAP**.  
**Fonte do presente:** `docs/v4/V4.0/cli-inconsistency-inventory.md`.

---

## 0. Como ler

- **Definição oficial:** significado único para o usuário na experiência V4.
- **Contrato-alvo:** como a CLI deve nomear e explicar o conceito.
- **Comportamento atual:** o que o inventário/código mostram hoje.
- **Sinônimos legados → oficial:** termos a migrar ou relegar a docs internas / `--verbose`.

Nenhuma definição abaixo deve contradizer outra nesta tabela. Se houver tensão, ver `decisions-and-open-questions.md`.

---

## 1. Definições oficiais (9 conceitos)

### Workspace

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Contexto de trabalho onde Tasks, recursos e limites (cwd, dados, sandbox) são organizados. |
| **Contrato-alvo** | Um Workspace ativo por sessão de CLI; troca explícita; Tasks não vazam entre Workspaces. |
| **Comportamento atual** | Coerente como path/`cwd`; também `workspace_id`, `WorkspaceLease`, grupo CLI `workspace` (V3.5), banner `workspace_display`. Lease pouco exposto. (inventário §1) |
| **GAP?** | Não (conceito presente). Unificação de rótulo “Workspace” vs só path ainda parcial. |

### Task

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Objetivo que o usuário delega ao sistema. É a unidade principal de acompanhamento na UX. |
| **Contrato-alvo** | Criar, listar, inspecionar e acompanhar **Tasks**. Estado de Task é o que o usuário lê por padrão. |
| **Comportamento atual** | `TaskState` / `OrchestrationTask`; CLI `task add\|show\|approve-plan`; placeholder TUI “tarefa”; painel `│ Tarefa:` — **mas** o painel mostra `work_id` sob esse rótulo (`status-panel.ts:44-56`). Intent/Goal/Meta competem. (inventário §1–§2) |
| **GAP?** | Vocabulário único **não** estabelecido. Decisão aberta: Task de produto = Goal Contract, Work, ou nó TaskGraph? (inventário §9 #2) |

### Plan

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Decomposição compreensível do trabalho da Task (o que será feito, em que ordem, com quais critérios). |
| **Contrato-alvo** | Usuário revisa um **Plan** antes/durante execução; aprovação de plano é um Approval (ou passo nomeado de Approval). |
| **Comportamento atual** | Interno: `task_kind: "plan"`, condição `PLAN_APPROVED`, CLI `task approve-plan` / `hierarchy approve`. UI mostra **Goal Contract**, não “Plan”. (`GoalContractReview.tsx`) |
| **GAP?** | Label de produto “Plan” ausente na TUI. Goal Contract cobre aceite + decomposição sem separar conceitos. |

### Agent

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Executor especializado que recebe uma parte do trabalho sob coordenação do Orchestrator. |
| **Contrato-alvo** | Listar/inspecionar Agents; estado do Agent ≠ estado da Session de terminal. |
| **Comportamento atual** | `AgentRecord` / `AgentState`; CLI `agents …`; footer TUI “**Workers**”; adapters/harness como runtime efetivo. (inventário §1) |
| **GAP?** | Hierarquia Agent vs Worker vs Adapter invisível na TUI default (não lista `AgentState`). |

### Orchestrator

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Camada que coordena Agents, dependências e progresso da Task/Session. |
| **Contrato-alvo** | Nome de produto “Orchestrator”; detalhes MSO/coordinator/daemon são implementação. |
| **Comportamento atual** | Usuário vê **MSO** (estados oficiais em `mso/states.ts`), `CoordinatorService`, CLI `coordinator`, daemon UDS — nunca o rótulo “Orchestrator”. (inventário §1, §6) |
| **GAP?** | Nome de produto não exposto. |

### Session

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Contexto de execução associado a uma Task em andamento (e, quando aplicável, ao terminal/processo de um Agent). |
| **Contrato-alvo** | Uma Session de produto por execução acompanhada; fases operacionais legíveis; não misturar Session MSO com ProcessSession sem rótulo. |
| **Comportamento atual** | Várias máquinas: `MsoSession` (`INIT`…`TRUE-FULL-PASS`); `ProcessSessionRecord` (`running`…); Grill-Me `session.ts`; slash “Sessão · contrato”. (inventário §3.4) |
| **GAP?** | Sem rótulo unificado; attach/detach fala de daemon, não de Agent Handle. |

### Agent Handle

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Mecanismo opcional de acesso à Session de um Agent (inspect/attach) sem confundir visualização com ciclo de vida do processo. |
| **Contrato-alvo** | Default **off**; quando on, handle único por sessão ativa; fechar viewer ≠ matar Agent. |
| **Comportamento atual** | **GAP total:** nenhum tipo/comando `AgentHandle` / preferência. Closest: daemon detach + `adapters sessions` / harness `sessions`. (inventário §6) |
| **GAP?** | Sim — identidade V4.0 contempla; implementação ≥ V4.1. |

### Approval

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Decisão que exige autorização explícita do usuário antes de continuar uma operação sensível ou um Plan. |
| **Contrato-alvo** | Fila única de Approvals na jornada; estados `PENDING` → `APPROVED`/`REJECTED`/`EXPIRED`/`CANCELLED`. |
| **Comportamento atual** | Store `ApprovalRequest`/`ApprovalState`; CLI `approvals list\|approve\|reject`. TUI **não** lista essa fila — só Goal Contract Confirm, consent harness, `approve-plan`, `confirm_mso`. (inventário §1–§2, §3.5) |
| **GAP?** | Quatro gates sob linguagem próxima; Approval unificado na TUI ausente. |

### Delivery

| Campo | Conteúdo |
|---|---|
| **Definição oficial** | Resultado final da Task acompanhado de alterações, evidências, validações e limitações. |
| **Contrato-alvo** | Status de Delivery só reflete verificação real; nunca “PASS” sem evidência. |
| **Comportamento atual** | `DeliveryCard` / `DeliveryStatus`: `PASS`\|`BLOCKED`\|`FAILED` (TUI Ink). Shell devolve `message_pt` + estado MSO. Derivação de PASS pode ignorar `TRUE-FULL-PASS` e `verification` (`App.tsx:282-287`). (inventário §3.6, §5) |
| **GAP?** | Cartão existe; contrato de evidência **não** cumprido. |

---

## 2. Modelo mental (fluxo do usuário)

```text
Workspace
   └── Task          ← o que o usuário delega
         ├── Plan    ← decomposição revisável
         ├── Orchestrator coordena
         │      └── Agent(s)  [+ Agent Handle opcional → Session do agente]
         ├── Approval(s) quando necessário
         └── Delivery        ← resultado verificável
```

Session (produto) = contexto de execução da Task sob o Orchestrator.  
Agent Handle = *atalho opcional* para a Session de um Agent — não é passo obrigatório do fluxo.

---

## 3. Sinônimos legados → termo oficial

| Legado (código/UI) | Termo oficial V4.0 | Ação |
|---|---|---|
| Intent | (entrada NL) → produz/atualiza **Task** / Plan | Manter como verbo de entrada; não como entidade de estado |
| Goal / Goal Contract / Goal Document / Meta | **Plan** (+ artefacto de aceite anexado à Task) | Migrar rótulos de UI; guardar “Goal Contract” em docs internas se necessário |
| Work / work_id | Camada interna entre Goal e Tasks | Não rotular como “Tarefa” no painel |
| Job / SkillJob | Legado Capability IR | Deprecar na CLI de produto (decisão aberta §9 inventário) |
| MSO / Coordinator / daemon | **Orchestrator** (produto); Session (fases) | Traduzir na UI; conservar nomes em logs `--verbose` |
| Workers (footer) | **Agents** | Renomear HUD |
| Adapter / Harness | Runtime do Agent (detalhe) | Sob demanda; não competir com “Agent” no default |
| ProcessSession / MsoSession / Grill session | **Session** (qualificar: orquestração vs processo vs grill) | Desambiguar rótulos |
| TRUE_PASS / TRUE_FULL_PASS / TRUE-FULL-PASS / Delivery PASS | Ver matriz de estados + decisões | Unificar literal de sucesso de **produto** |
| CANCELLED / cancelled | Preferir `CANCELLED` em produto; aceitar legado em APIs | Ortografia EN consistente na UI |
| IDLE → “Pronto” | Não é estado oficial MSO | Remover mapeamento enganoso ou rotular “aguardando entrada” |
| confirm_mso / Goal review / approve-plan / harness consent | **Approval** (tipos distintos sob o mesmo conceito) | Unificar apresentação |

---

## 4. Conceitos extras (não oficiais V4.0)

Podem existir no runtime; **não** entram no modelo mental default:

| Nome | Relação | Superfície |
|---|---|---|
| Circuit / Fire-5 | Validação/execução V0 paralela | `evolve circuit` |
| Criterion | Critérios de aceite do Goal Contract | interno + Delivery futuro |
| Continuity handoff | Substituição/retomada de Agent | `continuity` CLI |
| TUI phase (`ready`, `grill_q`, …) | Estado local da UI Ink | `cli/tui/App.tsx` — ≠ Session MSO |

---

## 5. Checklist de consistência (V4-Tests §3)

- [ ] Nove conceitos com definição única neste doc
- [ ] Sinônimos mapeados (não usados como sinônimos na UI nova)
- [ ] GAPs marcados (Handle, Plan label, Orchestrator label, Approval-in-TUI, Delivery evidenciada)
- [ ] Sem contradição com `state-matrix.md`

---

*Fim — Glossário (entregável 2).*
