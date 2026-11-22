# V4.0 — Matriz de estados (Task, Agent, Session, Approval)

**Status:** contrato-alvo de apresentação + inventário do presente  
**Data:** 2026-11-22  
**Regra:** nomes e significados **inequívocos** na UX. Literais de runtime podem diferir se a UI mapear 1:1 sem ambiguidade.  
**Evidência de tipos:** inventário §3; `goal-contract/types.ts`, `agent-registry/types.ts`, `mso/states.ts`, `approvals/types.ts`.

---

## 0. Convenções

| Coluna | Significado |
|---|---|
| **Estado (produto)** | Nome estável na UI V4 |
| **Literal atual** | String no código (se existir) |
| **Significado** | O que o usuário deve entender |
| **Transições válidas** | Para onde pode ir (alvo de produto; runtime pode ser mais restrito) |
| **Apresentação terminal** | Como mostrar (símbolo/cor → guia visual) |

**Estados terminais** não avançam sozinhos. **Cancelamento** é sempre explícito ou por política documentada.

---

## 1. Task (unidade de acompanhamento do usuário)

### 1.1 Estados de produto (contrato-alvo)

| Estado (produto) | Literal atual (`TaskState`) | Significado | Transições válidas (alvo) | Apresentação terminal |
|---|---|---|---|---|
| **Pendente** | `PENDING` | Task criada; ainda não em execução | → Em progresso; → Cancelada | neutro / espera |
| **Em progresso** | `IN_PROGRESS` | Trabalho em curso | → Parcial; → Concluída; → Bloqueada; → Falhou; → Cancelada | progresso |
| **Parcial** | `PARTIAL_PASS` | Parte dos critérios OK; resto aberto | → Em progresso; → Concluída; → Bloqueada; → Falhou; → Cancelada | aviso |
| **Concluída** | `TRUE_PASS` | Critérios da Task satisfeitos (nível Task) | (terminal) | sucesso *só se evidência* |
| **Bloqueada** | `BLOCKED` | Não avança sem intervenção | → Em progresso; → Cancelada; → Falhou | bloqueio |
| **Falhou** | `FAILED` | Terminou sem sucesso recuperável nesta tentativa | (terminal ou → Em progresso se retomar política) | erro |
| **Cancelada** | `CANCELLED` | Usuário/sistema cancelou | (terminal) | cancelamento |

**Nota de runtime:** `approve-plan` seta task de plano para `TRUE_PASS` (`task-graph/store.ts`); `PLAN_APPROVED` é condição, não enum de Task (inventário §3.1).

### 1.2 Camadas paralelas (não confundir com Task de produto)

| Máquina | Literais | Uso na UI |
|---|---|---|
| **Work** (`WorkState`) | `NOT_PASS`, `IN_PROGRESS`, `VERIFICATION`, `RECOVERY`, `BLOCKED`, `CANCELLED`, `TRUE_FULL_PASS` | Interno / verbose; **não** rotular como “Tarefa” |
| **Delivery** | `PASS`, `BLOCKED`, `FAILED` | Só no cartão de **Delivery**; `PASS` ⇔ verificação real (alvo) |
| **Criterion** | `NOT_STARTED`…`NOT_APPLICABLE` | Detalhe de Delivery/Plan |
| **Job** | `pending`\|`completed`\|`failed` | Legado; fora do modelo mental default |

### 1.3 Sucesso — desambiguação obrigatória

| Literal | Camada | UI produto (alvo) |
|---|---|---|
| `TRUE_PASS` | Task | “Task concluída” |
| `TRUE_FULL_PASS` | Work | “Work verificado” (verbose) |
| `TRUE-FULL-PASS` | MSO Session | “Session concluída / Orchestrator: sucesso verificado” |
| Delivery `PASS` | Delivery | “Entrega aceita” **somente** com evidências |

**Proibido:** usar “PASS” genérico sem qualificar a camada (inventário §2).

---

## 2. Agent

Fonte: `AgentState` em `orchestrator/src/v3/agent-registry/types.ts:5-16`.

| Estado (produto) | Literal | Significado | Transições típicas (alvo) | Apresentação |
|---|---|---|---|---|
| **Inicializando** | `INITIALIZING` | Agent a subir | → Ativo; → Falhou; → Cancelado | progresso |
| **Ativo** | `ACTIVE` | Executando trabalho | → Esperando; → Cedendo; → Limite; → Concluído; → Falhou; → Cancelado; → Substituído | progresso |
| **Esperando** | `WAITING` | Aguarda dependência/sinal | → Ativo; → … | espera |
| **Cedendo** | `YIELDING` | Liberando turno/recurso | → Ativo; → Esperando; → … | espera |
| **Limite** | `LIMIT_REACHED` | Quotas/limites atingidos | → Esperando; → Falhou; → Substituído; → Cancelado | aviso |
| **Falhou** | `FAILED` | Erro do Agent | → Substituído; (terminal) | erro |
| **Obsoleto** | `STALE` | Sem heartbeat / desatualizado | → Orfão; → Substituído; → Cancelado | aviso |
| **Órfão** | `ORPHANED` | Sem dono/sessão válida | → Substituído; → Cancelado | aviso/erro |
| **Substituído** | `REPLACED` | Outro Agent assumiu | (terminal histórico) | cancelamento/histórico |
| **Concluído** | `COMPLETED` | Trabalho do Agent terminou | (terminal) | sucesso |
| **Cancelado** | `CANCELLED` | Cancelado | (terminal) | cancelamento |

**Exposição atual:** CLI `agents list|inspect` (JSON). TUI default **não** lista `AgentState` (inventário §3.3).  
**Regra:** estado do Agent ≠ estado da Session de processo/terminal.

---

## 3. Session

Há **mais de uma** máquina. O produto deve **qualificar** qual Session.

### 3.1 Session de orquestração (MSO) — principal na jornada

Fonte: `mso/states.ts:6-33` (transições **hardcoded** no runtime).

| Estado (produto) | Literal MSO | Significado | Transições válidas (runtime) | Apresentação |
|---|---|---|---|---|
| **Início** | `INIT` | Session criada; ainda não carregou goals | → `LOADING_GOALS` | espera / “aguardando início” — **não** “Pronto” genérico |
| **Carregando** | `LOADING_GOALS` | Carrega goals | → `ANALYZING` | progresso |
| **Analisando** | `ANALYZING` | Interpreta objetivo | → `DECOMPOSING` | progresso |
| **Decompondo** | `DECOMPOSING` | Gera Plan/decomposição | → `DELEGATING` | progresso |
| **Delegando** | `DELEGATING` | Distribui a Agents | → `WAITING_AGENTS` | progresso |
| **Aguardando agents** | `WAITING_AGENTS` | Espera resultados | → `VALIDATING` | espera |
| **Validando** | `VALIDATING` | Verifica evidências/resultados | → `TRUE-FULL-PASS` \| `DECOMPOSING` \| `DELEGATING` \| `BLOCKED` | progresso / aviso se reentra |
| **Bloqueada** | `BLOCKED` | Parada; precisa recuperação/intervenção | → `RECOVERING` | bloqueio |
| **Recuperando** | `RECOVERING` | Tenta sair do bloqueio | → `DELEGATING` | progresso |
| **Concluída (verificada)** | `TRUE-FULL-PASS` | Sucesso de Session MSO | ∅ (terminal) | sucesso |

**Proibido no alvo:** mapear `INIT` → label “Pronto” (`banner.ts` / inventário §2 IDLE).  
Label alvo para aceitar input sem session ativa: **“Aguardando entrada”** / fase TUI `ready` — distinto de MSO `INIT`.

### 3.2 Session de processo (harness/adapter)

Fonte: `adapters/drivers/process-sessions.ts:28`.

| Estado | Literal | Significado | Apresentação |
|---|---|---|---|
| Em execução | `running` | Processo vivo | progresso |
| Encerrou | `exited` | Processo terminou | neutro/sucesso/erro conforme exit |
| Cancelada | `cancelled` | Cancelada | cancelamento |
| Dry-run | `dry_run` | Simulação | aviso |
| Órfã | `orphaned` | Sem supervisor | aviso |

Usar só em inspect de Agent/adapter ou com Agent Handles — não como estado principal da Task.

### 3.3 Outras (não default)

| Tipo | Estados | Nota |
|---|---|---|
| Continuity handoff | `pending`, `applied`, `paused_no_substitute`, `cancelled` | Retomada/substituição |
| TUI phase | `ready`, `grill_q`, `review`, `busy`, `delivery` | UI local (`App.tsx`); **não** é MSO |

---

## 4. Approval

Fonte: `approvals/types.ts:8-13`.

| Estado (produto) | Literal | Significado | Transições válidas (alvo) | Apresentação |
|---|---|---|---|---|
| **Pendente** | `PENDING` | Aguarda decisão do usuário | → Aprovada; → Rejeitada; → Expirada; → Cancelada | **ação exigida** (topo da hierarquia) |
| **Aprovada** | `APPROVED` | Autorizada na janela/operação | (terminal) | sucesso de controle |
| **Rejeitada** | `REJECTED` | Negada | (terminal) | cancelamento/aviso |
| **Expirada** | `EXPIRED` | Janela de validade passou | (terminal) | aviso |
| **Cancelada** | `CANCELLED` | Retirada sem decisão | (terminal) | cancelamento |

### Gates atuais que devem convergir na UX (ainda distintos no runtime)

| Gate atual | Evidência | Tratamento alvo |
|---|---|---|
| `ApprovalRequest` CLI | `v35-commands.ts` approvals | Fila canónica |
| Goal Contract Confirm | `GoalContractReview` | Tipo: Approval de Plan |
| `approve-plan` | task → `TRUE_PASS` | Tipo: Approval de Plan (domínio) |
| harness consent | `shell-start-execution.ts` | Tipo: Approval de spawn/adapter |
| `confirm_mso` | shell | Tipo: Approval de início de Session |

**Atual:** TUI não lista `approvals` (inventário §6).

---

## 5. Delivery (estado de apresentação do resultado)

| Estado | Literal | Significado alvo | Quando usar |
|---|---|---|---|
| **Aceita** | `PASS` | Critérios verificados; evidências presentes | Só após validação real |
| **Bloqueada** | `BLOCKED` | Entrega não pode ser aceita ainda | Bloqueio explícito |
| **Falhou** | `FAILED` | Entrega rejeitada por falha | Falha verificada |

**Atual (não alvo):** default `PASS` se kick started (`App.tsx:282-287`) — **inequívoco de forma errada**; tratar como bug de contrato na V4.1.

---

## 6. Matriz cruzada rápida (o que mostrar juntos)

| Situação | Task | Session (MSO) | Agent | Approval | Delivery |
|---|---|---|---|---|---|
| Digitando objetivo | Pendente / — | — ou Início | — | — | — |
| Revisando Plan | Pendente/Em progresso | Analisando/Decompondo | — | Pendente (Plan) | — |
| Executando | Em progresso | Delegando…Validando | Ativo/Esperando | — | — |
| Precisa OK humano | Bloqueada ou Em progresso | Bloqueada ou Validando | Esperando | **Pendente** | — |
| Sucesso verificado | Concluída | Concluída (`TRUE-FULL-PASS`) | Concluído | — | Aceita |
| Usuário cancelou | Cancelada | (parar/reconciliar) | Cancelado | Cancelada | — |

---

## 7. Critério de aceite (V4-Tests §3)

- Cada estado acima tem definição, transições e apresentação.
- Nenhum literal de sucesso é usado em duas camadas sem qualificação.
- UI não apresenta estado antigo como ativo (regra V4.3; preparar nomes agora).

---

*Fim — Matriz de estados (parte do entregável 4).*
