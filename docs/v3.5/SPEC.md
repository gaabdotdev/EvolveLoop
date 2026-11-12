# EVOLVELOOP V3.5 — PRODUCTION RUNTIME & SECURE EXECUTION

**Documento:** Metas, escopo, arquitetura-alvo, roadmap e critérios de aceitação  
**Versão:** 1.0  
**Status:** Proposta de especificação para implementação  
**Release de referência:** `v3-complete`  
**Benchmark & Observability:** frente separada; não faz parte do escopo funcional da V3.5

---

# 1. Visão executiva

A V3.5 deve transformar a infraestrutura de orquestração e o Engineering Loop da EvolveLoop em um runtime operacional confiável para executar trabalho real de engenharia com agentes e harnesses externos.

A V3 estabeleceu os fundamentos: contratos de objetivo, TaskGraph, hierarquia de agentes, delegação, orçamento, locks, fencing, recuperação, worktrees, adapters, Engineering Loop, revisão e avaliação por evidências. A V3.5 não deve recriar esses mecanismos. Deve fechar as lacunas entre os mecanismos existentes e uma operação persistente, isolada, controlada e recuperável.

A direção da V3.5 é:

> **A EvolveLoop deve executar trabalho de engenharia em ambientes isolados, com autoridade mínima, harnesses operacionais, processos supervisionados, estado persistente, integração controlada de alterações e aprovações humanas específicas — sem depender de uma TUI aberta e sem confundir worktree com sandbox.**

A V3.5 não é uma versão para adicionar mais agentes por padrão. É uma versão para tornar confiável a execução dos agentes que já existem.

## 1.1 Resultados principais esperados

1. **Native Harness Runtime:** adapters consistentes para iniciar, acompanhar, controlar e recuperar sessões de harness conforme as capacidades reais de cada ambiente.
2. **Secure Execution Environment:** isolamento de sistema operacional, políticas de filesystem, processos, rede, recursos e credenciais.
3. **Persistent Coordinator:** serviço em background que mantém workflows ativos quando o terminal ou a interface são fechados e recupera estado após falhas/reinicializações.
4. **Workspace & Change Management:** isolamento de alterações, ownership, integração de patches, resolução controlada de conflitos, rollback e preservação do trabalho.
5. **Human-in-the-loop Policy:** aprovações persistentes, escopadas, auditáveis e solicitadas somente para operações que realmente exigem autorização.
6. **Operational Experience:** CLI/TUI para operar, inspecionar, aprovar, pausar, retomar e diagnosticar workflows.
7. **End-to-end proof:** cenário reproduzível que demonstre execução multiagente real, isolamento, continuidade em background, recuperação, integração de alterações, revisão e conclusão baseada em evidências.

---

# 2. Estado de referência e premissas

## 2.1 Referência histórica

A V3 está registrada como congelada na referência `v3-complete`, associada ao commit informado `6b69c3f`, com o código congelado anteriormente identificado como `a92a839`. O agente deve verificar a relação real entre tag, commits e árvore Git antes de iniciar qualquer alteração.

A implementação da V3.5 deverá ocorrer em branch própria, criada a partir da referência oficial de release após inspeção do repositório. Não deve reescrever ou alterar a tag congelada.

A frente `feature/bench-obs-v1` e o sistema Benchmark & Observability são separados. A V3.5 pode reutilizar contratos e APIs de telemetria que estejam presentes e estáveis no branch-base, mas não deve incorporar, implementar ou ampliar o Benchmark System como parte desta release.

## 2.2 Inspeção do snapshot de referência

O arquivo `EvolveLoop-v3-complete-6b69c3f.zip`, disponibilizado como snapshot de referência, foi inspecionado parcialmente. Ele contém módulos relevantes que devem ser auditados antes de criar novos mecanismos:

- `orchestrator/src/v3/coordinator/`
- `orchestrator/src/v3/adapters/`
- `orchestrator/src/v3/adapters/drivers/`
- `orchestrator/src/v3/engineering/`
- `orchestrator/src/v3/worktrees/`
- `orchestrator/src/jobs/`
- `orchestrator/src/v3/execution/`
- `orchestrator/src/v3/continuity/`
- `orchestrator/src/v3/locks/`
- `orchestrator/src/v3/recovery/`
- `orchestrator/src/v3/tui/`

### Observações encontradas nesse snapshot

Estas observações são pontos de auditoria, não afirmações sobre o HEAD atual. O agente deve revalidá-las no repositório em que trabalhar:

1. `CoordinatorService` registra estado e PID, mas seu comentário indica que o chamador precisa manter o processo vivo por um loop foreground ou supervisor externo. Isso não equivale, por si só, a um daemon/serviço operacional persistente.
2. `WorktreeManager` declara explicitamente que oferece isolamento Git worktree, não sandbox de sistema operacional, e que não impede um agente no host de editar o checkout primário.
3. `EngineeringWorkspace` utiliza confinamento baseado em `realpath` e executa comandos por `spawnSync` no host. O código precisa ser avaliado contra TOCTOU, symlinks, corridas de filesystem e isolamento de processos; `realpath` não é uma sandbox OS.
4. `CliProcessAdapterDriver` possui modo dry-run por padrão e exige `provider_mode=real` mais `EVOLVELOOP_HARNESS_CONSENT=true` para spawn real. O caminho de processo externo deve ser avaliado quanto a streaming, supervisão, persistência de sessão, cancelamento da árvore de processos e recuperação.
5. `ProcessSessionStore` registra PIDs e o método de cancelamento mostrado envia `SIGTERM` ao PID registrado. Isso não demonstra, por si só, controle completo da árvore de processos, contenção em cgroup ou encerramento de descendentes.
6. `CursorJobsAdapterDriver` utiliza o `ExecutionBridge`/JobStore, mas a documentação do adapter não afirma controle completo de uma sessão IDE ou de uma API de agente nativa.
7. `EngineeringLoop` documenta que implement/fix/review utilizam workers determinísticos no fluxo demonstrativo daquela implementação. A versão atual deve ser auditada para determinar exatamente quais caminhos já usam harnesses LLM reais.

Não assumir que essas lacunas continuam presentes sem inspeção. Se já tiverem sido resolvidas, comprovar e reutilizar a implementação.

## 2.3 Premissas arquiteturais

- O Core continua sendo a autoridade sobre Goals, Tasks, Delegations, Agents, ownership, budgets e estado do trabalho.
- Sessões e processos de harness são recursos substituíveis; não são a identidade da tarefa.
- O Coordinator deve sobreviver à desconexão da interface e conseguir reconciliar o estado após crash.
- Cada agente recebe autoridade mínima necessária para sua tarefa.
- Git worktree é mecanismo de isolamento de alterações Git, não isolamento de processos ou sistema operacional.
- O controle de uma sessão IDE externa só pode ser declarado quando a integração realmente fornece essa capacidade.
- A implementação inicial deve priorizar Linux, mantendo contratos de backend que permitam futuras implementações em Windows e macOS. Não declarar suporte multiplataforma sem testes reais.
- A rede deve ser negada por padrão nos perfis de execução que não necessitem dela; exceções são escopadas e auditadas.
- Credenciais não devem ser herdadas indiscriminadamente por processos de tarefa.
- O estado local deve continuar local por padrão.

---

# 3. Escopo da V3.5

## 3.1 Incluído

### A. Native Harness Runtime

- Contrato comum de lifecycle para harnesses.
- Descoberta de capacidades reais.
- Inicialização e encerramento.
- Streaming de stdout/stderr/eventos quando suportado.
- Identificação de processo, sessão, tarefa e agente.
- Consulta de estado.
- Cancelamento dos processos realmente pertencentes ao Core.
- Retomada/reconexão somente quando suportada pelo harness.
- Captura de usage e limites quando expostos.
- Integração com handoff e recovery.
- Políticas de permissões e ferramentas.
- Testes de contrato por adapter.

### B. Secure Execution Environment

- Sandbox OS para execução de código e ferramentas.
- Contenção de filesystem.
- Proteção contra symlink/path traversal/TOCTOU.
- Isolamento e supervisão de processos.
- Limites de CPU, memória, tempo, processos e disco quando suportados.
- Políticas de rede.
- Gestão de variáveis de ambiente e credenciais.
- Profiles de autoridade.
- Falha fechada quando um perfil de segurança obrigatório não estiver disponível.

### C. Persistent Coordinator

- Processo de serviço real.
- CLI/TUI como clientes do serviço.
- Execução independente da interface.
- Estado durável.
- Heartbeats e leases.
- Reconciliador após crash.
- Recuperação após reinicialização.
- Supervisão e encerramento controlado.
- Múltiplos workflows concorrentes, dentro de limites.
- IPC local autenticado/autorizado.

### D. Workspace & Change Management

- Worktree/workspace por agente ou unidade de trabalho compatível.
- Ownership explícito.
- Registro de alterações por agente/tarefa.
- Detecção de conflitos.
- Integração controlada de patches/branches.
- Merge queue ou mecanismo equivalente.
- Testes antes e depois da integração.
- Rollback/checkpoint.
- Preservação de alterações não relacionadas.
- Proteção contra integração de alterações não revisadas.

### E. Approval & Policy Broker

- Solicitações de aprovação persistentes.
- Escopo mínimo por operação, recurso e workflow.
- Decisões aprovar/rejeitar/adiar/expirar.
- Políticas automáticas para ações de baixo risco.
- Aprovação obrigatória para ações de risco configurado.
- Decisão auditável e não transferível para outro contexto sem regra explícita.
- Retomada do workflow após decisão.

### F. Operational Experience

- CLI para status, service, runs, agents, processes, sandboxes, workspaces, approvals e recovery.
- TUI para observar workflows e tomar decisões.
- Diagnóstico do runtime.
- Exibição honesta de limitações por harness e backend.
- Logs estruturados e audit trail operacional.

### G. Integração ponta a ponta

- Objetivo de engenharia recebido.
- Goal Contract e TaskGraph persistidos.
- Agentes executados em ambientes isolados.
- Harnesses reais utilizados conforme suas capacidades.
- Coordinator permanece ativo após fechar a interface.
- Falha de agente/processo detectada e recuperada.
- Alterações preservadas e integradas de forma controlada.
- Operação sensível submetida a aprovação.
- Review independente e testes executados.
- TRUE_FULL_PASS somente após evidências válidas.

## 3.2 Fora do escopo

- Implementar ou ampliar Benchmark & Observability v1.0.
- Abrir ou implementar V3.6/V4 ou qualquer versão posterior.
- Reescrever o Core inteiro.
- Criar um segundo sistema de Goals, TaskGraph, Agent Registry, Work Ledger, EventBus, Evidence ou Recovery.
- Autoevolução irrestrita ou auto-modificação sem gates.
- Deploy/publicação externos automáticos sem autorização.
- Controle absoluto de sessões IDE que não forneçam APIs para isso.
- Garantia exactly-once.
- Suporte Windows/macOS anunciado sem backend e testes correspondentes.
- Cloud multi-tenant, fleet management ou serviço SaaS.
- Acesso irrestrito ao host por padrão.

## 3.3 Reuso de telemetria sem acoplamento ao Benchmark System

A V3.5 pode emitir eventos operacionais por meio do EventBus, CoordinationEventLog ou contratos de telemetria existentes no branch-base. Isso serve para logs, auditoria e diagnóstico do runtime.

Não deve exigir a branch `feature/bench-obs-v1`, nem incorporar o Measurement Plane completo, Benchmark Runner, suites A/B/C ou dashboard analítico como dependência da V3.5.

---

# 4. ARQUITETURA-ALVO

A arquitetura deve ser adaptada ao repositório após auditoria. A seguinte divisão é conceitual e define responsabilidades, não obriga a criar exatamente esses diretórios.

## 4.1 Camadas

1. **EvolveLoop Core:** Goals, TaskGraph, Agents, Delegation, Policies, budgets, locks e recovery.
2. **Runtime Coordinator:** lifecycle dos workflows, scheduler, heartbeats, leases, persistência, reconciliação e IPC.
3. **Harness Runtime:** adapters, sessões, capacidades, streaming, usage e cancelamento.
4. **Execution Supervisor:** processos, árvores de processos, recursos, timeout e sinais.
5. **Sandbox Manager:** criação/remoção dos ambientes isolados e aplicação de profiles.
6. **Workspace Manager:** worktrees, ownership, diffs, checkpoints e integração de alterações.
7. **Policy & Approval Broker:** autorização por ação e workflow.
8. **Operational Interface:** CLI/TUI para operação e diagnóstico.

## 4.2 Contratos centrais

Auditar e consolidar os seguintes contratos, evitando duplicação:

### Runtime / Coordinator

- `CoordinatorLifecycle`: start, ready, pause, resume, stop, health.
- `WorkflowLease`: owner, lease expiry, renewal, fencing token.
- `RuntimeRecord`: runtime ID, PID/process identity, start time, state, restart generation.
- `WorkRecoveryRecord`: último estado durável, processos/sessões vinculados, checkpoints e plano de reconciliação.

Estados recomendados para o serviço:

`STOPPED`, `STARTING`, `RUNNING`, `DEGRADED`, `STOPPING`, `CRASHED`, `RECOVERING`.

A semântica deve ser implementada e testada, não apenas adicionada como enum.

### Harness Adapter

Um adapter deve declarar capacidades opcionais, por exemplo:

- `discover`
- `healthCheck`
- `startSession`
- `sendTask`
- `streamEvents`
- `getSessionStatus`
- `cancelSession`
- `resumeSession`
- `attachSession`
- `collectUsage`
- `capabilities`
- `permissionModel`
- `sandboxCompatibility`

Não exigir que todos os adapters implementem métodos que o harness não suporta. Cada capability deve possuir estado e evidência: `SUPPORTED`, `PARTIAL`, `PROBE_ONLY`, `DRY_RUN`, `BLOCKED` ou `UNSUPPORTED`.

### Sandbox Profile

Cada execução deve declarar:

- Workspace montado.
- Paths read-only/read-write.
- Paths negados.
- Acesso à rede.
- Binários permitidos.
- Variáveis de ambiente permitidas.
- Secrets especificamente autorizados.
- CPU/memória/processos/tempo/disco.
- Ações que exigem aprovação.
- Backend de sandbox e versão.

### Approval Request

Cada solicitação deve conter:

- ID único.
- Run/Goal/Task/Agent IDs.
- Operação exata.
- Recurso afetado.
- Justificativa.
- Risco.
- Permissões pedidas.
- Duração/validade.
- Contexto mínimo necessário.
- Estado e histórico de decisão.

A aprovação deve autorizar apenas a operação, recurso e janela definidos. Não pode se transformar silenciosamente em autorização global.

---

# 5. META 1 — NATIVE HARNESS RUNTIME

## 5.1 Objetivo

Fazer o EvolveLoop operar harnesses como recursos controlados pelo Core, sem depender de suposições sobre suas capacidades internas.

## 5.2 Funcionalidades

- Descobrir binário/API e versão.
- Identificar status de autenticação sem expor tokens.
- Fazer health check.
- Criar sessão com identidade vinculada ao Agent Attempt e Task.
- Enviar objetivo/contrato/handoff package.
- Capturar stdout/stderr/eventos quando disponível.
- Acompanhar estado e término.
- Registrar exit code e motivo de encerramento.
- Cancelar processos Core-owned e suas árvores quando suportado.
- Reconectar ou retomar somente se o harness suportar.
- Capturar usage real somente quando informado pelo provider/harness.
- Propagar políticas de tools e permissões.
- Encerrar e limpar recursos com segurança.

## 5.3 Adapters prioritários

Auditar e priorizar:

- Cursor / ExecutionBridge / Cursor Jobs.
- Claude Code CLI.
- Codex CLI ou API disponível.
- Antigravity, conforme interfaces oficiais disponíveis.

A ordem deve ser decidida por evidência de suporte, maturidade do mecanismo de integração, capacidade de autenticação e valor operacional. Não simular equivalência entre harnesses.

**Meta mínima de release:** pelo menos dois adapters com caminho real de execução ponta a ponta, quando os ambientes/credenciais disponíveis permitirem; os demais devem ter matriz de capacidades correta e testes de contrato. Se faltar acesso externo, o gate deve ficar `BLOCKED`, não `PASS`.

## 5.4 Requisitos de confiabilidade

- Spawn solicitado ≠ spawn efetivo.
- Processo criado ≠ sessão pronta.
- Sessão aceita ≠ tarefa concluída.
- PID não é identidade suficiente em todos os sistemas; considerar PID reuse e process start identity.
- Cancelamento deve lidar com árvore de processos ou declarar precisamente sua limitação.
- Sessões externas não controláveis devem ser classificadas corretamente.
- Os callbacks de saída devem atualizar o estado de forma idempotente.
- Crash do Coordinator não deve fazer o sistema esquecer processos já iniciados.
- Reconciliar processos ativos ao reiniciar.
- Não iniciar duplicatas sem checar idempotência e estado anterior.

---

# 6. META 2 — SECURE EXECUTION ENVIRONMENT

## 6.1 Objetivo

Executar comandos, testes, builds, scripts e ferramentas dos agentes em um ambiente com limites verificáveis, sem conceder por padrão os privilégios do processo do orquestrador.

**Worktree não é sandbox.** A V3.5 só pode declarar sandbox OS quando o processo de execução estiver efetivamente confinado por um backend do sistema operacional.

## 6.2 Linux como plataforma de referência inicial

Começar pelo Linux, validando as primitivas disponíveis no kernel e no ambiente. Avaliar uma composição de mecanismos estabelecidos, como namespaces, cgroups, seccomp, Landlock, rootless OCI/container ou bubblewrap, conforme compatibilidade e ameaça.

Não desenvolver um sandbox criptográfico ou kernel próprio.

Não escolher tecnologia apenas por conveniência. Registrar ADR com:

- ameaça considerada;
- isolamento fornecido;
- limitações;
- requisitos de kernel/dependências;
- configuração padrão;
- modo de falha;
- testes de escape;
- plano de atualização.

Criar interface de backend que permita outros sistemas operacionais no futuro, sem declarar suporte até existir implementação e teste correspondente.

## 6.3 Políticas de filesystem

- Workspace designado como leitura/escrita.
- Repositório de origem protegido quando o agente estiver em worktree.
- Diretórios do sistema read-only ou negados.
- Home do usuário não montado integralmente por padrão.
- Chaves SSH, credenciais, browser profiles e diretórios sensíveis negados.
- Symlinks não podem permitir escape.
- Verificações não podem depender apenas de string prefix ou de `realpath` prévio com janela de corrida.
- Operações devem usar APIs e primitivas que reduzam TOCTOU.
- Remoção/rename devem validar inode/identidade quando necessário.
- Arquivos especiais e sockets devem ter política explícita.

## 6.4 Processos e recursos

- Executar com usuário não privilegiado.
- Restringir process tree a um grupo/cgroup/escopo equivalente.
- Aplicar CPU, memória, PIDs, timeout e disco quando suportado.
- Capturar exit code, sinais e término.
- Cancelar descendants Core-owned.
- Evitar shell interpolation; preferir `spawn` com argv.
- Aplicar limites de output/log.
- Detectar processos órfãos.
- Reconciliar após crash.
- Não matar processos por PID sem validar ownership/identidade atual.

## 6.5 Rede

- Negar rede por padrão nos perfis de execução que não precisem.
- Permitir egress por allowlist quando possível.
- Distinguir rede para provider/harness de rede para subprocessos de tarefa.
- Instalação de dependências exige profile específico ou aprovação conforme política.
- Registrar destino/escopo permitido sem registrar payload sensível.
- Não permitir que o agente desative o sandbox por prompt ou argumento informal.

## 6.6 Credenciais e ambiente

- Não herdar `process.env` integral.
- Construir env allowlist por processo.
- Separar credenciais necessárias ao harness do ambiente dos comandos de build/test.
- Injetar secrets apenas quando autorizados, no menor escopo e tempo possível.
- Redigir secrets de stdout/stderr e logs.
- Não gravar secrets em prompt packages, checkpoints ou handoff packages.
- Revogar/inutilizar material temporário após o processo.

## 6.7 Falha fechada

Se o profile exigir sandbox OS e o backend não estiver disponível, a tarefa deve ser bloqueada ou executada em profile alternativo explicitamente aprovado e claramente menos seguro.

Não fazer fallback silencioso para execução no host.

---

# 7. META 3 — PERSISTENT RUNTIME COORDINATOR

## 7.1 Objetivo

Permitir que os workflows continuem quando terminal/TUI for fechado e que o estado possa ser recuperado após crash ou reboot.

## 7.2 Requisitos

- Processo de serviço independente do processo CLI/TUI.
- Inicialização, health check, pause, resume e shutdown.
- IPC local autenticado/autorizado.
- Persistência transacional do estado relevante.
- Heartbeats e leases.
- Fencing/ownership.
- Monitoramento de processes e harness sessions.
- Scheduler de workflows ativos.
- Reconciliation loop.
- Detecção de órfãos.
- Recuperação de tasks e subtrees.
- Logs estruturados.
- Política de retry com limites.
- Shutdown gracioso.
- Restart/recovery com identidade de geração.

## 7.3 Independência da interface

A TUI/CLI deve ser cliente do Coordinator. Fechar a interface não pode encerrar o serviço nem as tarefas, salvo quando uma política explícita disser que aquele workflow deve ser cancelado ao desconectar.

O encerramento da interface deve ser testado por processo separado, não apenas simulando um evento interno.

## 7.4 Persistência e recuperação

O agente deve avaliar o armazenamento atual e escolher a estratégia de durabilidade apropriada. Não é obrigatório introduzir um banco novo se os stores existentes puderem ser consolidados com garantias suficientes. Se optar por SQLite ou outra tecnologia, justificar a decisão e criar migrações.

Exigir:

- operações atômicas;
- consistência após crash;
- schema versioning;
- migrações testadas;
- integridade de estado;
- backup/recovery quando aplicável;
- locks entre instâncias;
- detecção de Coordinator duplicado;
- proteção contra stale owner.

## 7.5 Modo de serviço

Implementar comando equivalente a:

```bash
evolve service install
evolve service start
evolve service status
evolve service stop
evolve service restart
evolve service logs
```

A integração de serviço deve seguir o sistema operacional. No Linux, avaliar user service (por exemplo, systemd --user quando disponível) e fallback foreground supervisionado. Não assumir que systemd está sempre presente.

Não alegar execução enquanto a máquina está suspensa/desligada. O estado precisa ser retomado após reinicialização quando configurado.

---

# 8. META 4 — WORKSPACE & CHANGE MANAGEMENT

## 8.1 Objetivo

Permitir que múltiplos agentes trabalhem em paralelo sem sobrescrever silenciosamente mudanças uns dos outros ou do usuário.

## 8.2 Workspace lifecycle

- Criar workspace vinculado a run/task/agent.
- Associar worktree/branch quando o repositório for Git.
- Registrar base commit.
- Registrar owner e capabilities.
- Registrar arquivos/diffs alterados.
- Capturar checkpoints.
- Preservar estado em falhas.
- Limpar somente recursos que comprovadamente pertencem ao workflow e não contenham trabalho não integrado.

## 8.3 Ownership e concorrência

- Um arquivo/recurso compartilhado precisa de ownership/lock ou estratégia explícita de concorrência.
- Mudanças paralelas devem produzir conflito detectável, não last-write-wins silencioso.
- Evitar que dois agentes modifiquem a mesma checkout root sem coordenação.
- Detectar alterações humanas concorrentes.
- Nunca descartar dirty changes preexistentes.

## 8.4 Change integration

Criar Merge/Integration Coordinator que:

1. Recebe artefato/branch do worker.
2. Valida base commit.
3. Verifica ownership e evidências.
4. Detecta conflito.
5. Executa merge/cherry-pick/patch em ambiente controlado.
6. Executa testes relevantes.
7. Solicita review/aprovação quando necessário.
8. Aplica integração somente após gates.
9. Registra commit/resultados.
10. Mantém rollback seguro.

Não executar `git reset --hard`, `clean -fd`, force update ou remoção de worktree sem verificar ownership, estado e autorização.

## 8.5 Rollback

- Restaurar apenas alterações atribuídas ao workflow.
- Preservar alterações externas/humanas.
- Registrar o artefato restaurado e motivo.
- Não prometer rollback perfeito para operações externas irreversíveis.

---

# 9. META 5 — HUMAN-IN-THE-LOOP POLICY & APPROVAL BROKER

## 9.1 Objetivo

Evitar tanto a interrupção constante quanto a autonomia irrestrita.

## 9.2 Política por capability

Definir permissões por agente, tarefa, workflow, sandbox profile e recurso:

- filesystem read/write;
- shell/process execution;
- network;
- package installation;
- MCP/tool invocation;
- secrets;
- Git mutation;
- deploy/publish;
- acesso fora do workspace.

## 9.3 Padrões iniciais propostos

| Ação | Padrão proposto |
|---|---|
| Ler workspace | Permitido |
| Criar/modificar arquivos no workspace isolado | Permitido |
| Executar testes/build no sandbox | Permitido |
| Ler fora do workspace | Negado por padrão |
| Alterar checkout primário | Negado quando existir workspace isolado |
| Rede externa | Negada por padrão; profile/allowlist quando necessário |
| Instalar dependências | Profile específico ou aprovação |
| MCPs | Conforme capability e escopo |
| Acessar secrets | Negado; injeção específica autorizada |
| Deploy/publicação | Aprovação explícita |
| Remover dados/branches/worktrees | Aprovação/política estrita |
| Operações destrutivas externas | Negado por padrão |

Os padrões precisam ser configuráveis, documentados e testados.

## 9.4 Approval Broker

Solicitações devem sobreviver à sessão e à interface:

- `approval_id`;
- workflow/task/agent;
- ação;
- recurso;
- motivo;
- impacto;
- permissões pedidas;
- escopo;
- expiração;
- estado;
- decisor;
- timestamp;
- trilha de auditoria.

Estados: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`.

A aprovação deve autorizar apenas a ação descrita. Não conceder acesso permanente por consequência de uma decisão pontual.

## 9.5 Retomada

Após aprovação, o Coordinator retoma o ponto seguro da execução. Após rejeição, o agente deve receber a decisão e escolher alternativa permitida ou marcar bloqueio. A resposta do agente não pode alterar o registro da aprovação.

---

# 10. META 6 — OPERATIONAL EXPERIENCE

## 10.1 CLI

Fornecer comandos equivalentes, adaptados à CLI real:

```bash
evolve service status
evolve service start
evolve service stop
evolve service logs

evolve runtime status
evolve runtime doctor
evolve runtime recover

evolve agents list --run <run_id>
evolve agents inspect <agent_id>

evolve harness list
evolve harness inspect <adapter>
evolve harness sessions --run <run_id>

evolve sandbox status
evolve sandbox profiles

evolve workspace list --run <run_id>
evolve workspace inspect <workspace_id>
evolve workspace diff <workspace_id>
evolve workspace integrate <workspace_id>
evolve workspace rollback <workspace_id>

evolve approvals list
evolve approvals inspect <approval_id>
evolve approvals approve <approval_id>
evolve approvals reject <approval_id>
```

Os comandos são referência de UX, não contrato final obrigatório.

Cada comando precisa ter help, validação, exit codes semânticos e formato machine-readable quando aplicável.

## 10.2 TUI

Criar visões operacionais para:

- Service health.
- Workflows ativos.
- Agent hierarchy.
- Harness sessions.
- Process trees.
- Sandbox profile/status.
- Workspace/worktree e diffs.
- Approvals pendentes.
- Recovery suggestions.
- Eventos e logs.

A TUI não deve ser a fonte da verdade. Ela consulta e comanda o Coordinator.

## 10.3 Diagnóstico

`evolve runtime doctor` deve detectar:

- backend de sandbox disponível;
- kernel/features compatíveis;
- permissões;
- cgroups/namespaces quando aplicável;
- service manager disponível;
- conflito de Coordinator;
- storage e schema;
- processos órfãos;
- harnesses e autenticação sem revelar secrets;
- configurações inseguras;
- consentimento;
- limitações.

---

# 11. CENÁRIO END-TO-END OBRIGATÓRIO

A V3.5 precisa provar um fluxo integrado em ambiente controlado:

1. Iniciar o Coordinator como serviço independente.
2. Criar um objetivo de engenharia em repositório existente.
3. Construir Goal Contract e TaskGraph.
4. Criar workspaces/worktrees isolados.
5. Iniciar pelo menos dois agentes/harnesses reais quando disponíveis.
6. Executar tarefas paralelas em ambientes segregados.
7. Demonstrar que cada agente possui permissões limitadas.
8. Fechar CLI/TUI e comprovar que o workflow continua.
9. Interromper um worker e comprovar detecção/recovery.
10. Criar handoff para substituto compatível.
11. Produzir solicitação de aprovação para uma operação protegida, como instalação de dependência com rede ou ação externa.
12. Aprovar em CLI/TUI de processo separado.
13. Comprovar que somente a ação autorizada foi liberada.
14. Integrar alterações por merge queue/controlador.
15. Detectar e tratar conflito em fixture específica.
16. Executar testes após integração.
17. Executar review independente.
18. Registrar evidências.
19. Concluir somente se todos os critérios do Goal Contract forem válidos.
20. Reiniciar o Coordinator e comprovar reconciliação do estado final e de workflows não concluídos.

O cenário deve conter falhas controladas e estados intermediários persistidos.

Muitos componentes não precisam ser testados no mesmo cenário; crie testes específicos além do E2E.

---

# 12. ROADMAP PROPOSTO

As divisões abaixo organizam a execução. Não autorizam declarar a V3.5 concluída com etapas pendentes.

## V3.5.0 — Secure Runtime Foundation

- Threat model.
- Policy model.
- Sandbox backend Linux inicial.
- Filesystem containment.
- Process supervisor.
- Environment/secret handling.
- Resource limits.
- Security tests.

## V3.5.1 — Native Harness Runtime

- Adapter contract consolidado.
- Lifecycle.
- Streaming.
- Session/process registry.
- Capability matrix.
- Cancel/reconnect/resume quando possível.
- Pelo menos dois paths reais de adapter, condicionados à disponibilidade de credenciais e suporte externo.

## V3.5.2 — Persistent Coordinator

- Serviço real.
- IPC.
- Durable state.
- Workflows em background.
- Heartbeat/lease.
- Reconciliation.
- Crash/reboot recovery.
- Process supervision.

## V3.5.3 — Workspace & Change Management

- Per-agent/task workspace.
- Ownership.
- Conflict detection.
- Integration queue.
- Automated validation.
- Rollback seguro.

## V3.5.4 — Approval & Operational Experience

- Approval Broker.
- Policy UX.
- CLI/TUI.
- Runtime Doctor.
- Audit logs.
- E2E final.
- Release freeze.

---

# 13. GATES DE ACEITAÇÃO DA V3.5

## Gate S — Secure Execution

- Sandbox OS real disponível no alvo Linux suportado.
- Nenhum fallback silencioso para host.
- Filesystem escapes testados e bloqueados.
- Symlink/path traversal/TOCTOU testados.
- Processos e descendants confinados ou limitação explícita.
- Network policy demonstrada.
- Env/secrets minimizados e redigidos.
- CPU/memória/PID/timeout testados quando suportados.
- Worktree e sandbox claramente distintos.

## Gate H — Harness Runtime

- Contrato de adapter estável.
- Matriz de capabilities honesta.
- Process/session lifecycle persistido.
- Eventos/streaming quando suportados.
- Spawn real distinto de dry-run/probe.
- Cancelamento da árvore Core-owned comprovado quando suportado.
- Pelo menos dois paths de execução real quando ambiente e autorização permitirem.
- Limitações de IDE sessions externas documentadas.

## Gate C — Coordinator

- Serviço independente da CLI/TUI.
- Estado persistente.
- IPC protegido.
- Singleton/leader ownership.
- Heartbeats/leases/fencing.
- CLI fechada sem perda do workflow.
- Crash recovery.
- Restart/reboot recovery quando configurado.
- Process reconciliation.
- Sem workflows duplicados após restart.

## Gate W — Workspace & Change Management

- Workspace isolado por agente/tarefa conforme política.
- Ownership por alterações.
- Dirty changes preservadas.
- Conflitos detectados.
- Integração controlada.
- Testes pós-integração.
- Rollback seguro.
- Sem sobrescrita silenciosa.

## Gate A — Approval & Policy

- Policy Engine com least privilege.
- Requests persistentes.
- Escopo específico.
- Decisão via CLI/TUI.
- Expiração/rejeição/cancelamento.
- Retomada segura.
- Auditoria de decisões.
- Ações proibidas realmente bloqueadas.

## Gate O — Operations

- CLI operacional.
- TUI operacional.
- Runtime doctor.
- Logs/diagnóstico.
- Status real, não mock.
- Documentação atualizada.

## Gate E2E — Integrated Engineering Runtime

- Cenário da seção 11 reproduzível.
- Execução real em harnesses disponíveis.
- Sandbox real.
- Background após fechar UI.
- Falha e recovery.
- Aprovação persistente.
- Merge/integration segura.
- Review e testes.
- TRUE_FULL_PASS por evidências.

## Gate R — Release

- Build/typecheck/lint/testes obrigatórios.
- Testes de segurança.
- Testes de falha.
- Migrações.
- Compatibilidade documentada.
- ADRs.
- Acceptance matrix.
- Evidências reproduzíveis.
- Tag/referência imutável da V3.5.

Todos os gates obrigatórios devem estar em `PASS`. `BLOCKED`, `FAIL` ou `NOT_RUN` não podem ser reclassificados para liberar a versão.

---

# 14. NÃO OBJETIVOS E LIMITAÇÕES HONESTAS

A V3.5 não deve alegar:

- Exactly-once.
- Controle total de sessões IDE externas sem API apropriada.
- Sandbox OS quando apenas worktree ou realpath confinement existir.
- Execução em background enquanto o computador está desligado/suspenso.
- Suporte Windows/macOS sem backends e testes.
- Secret isolation se o harness puder acessar credenciais do host sem mediação.
- Network isolation se o processo puder usar a rede do host sem controle.
- Cancelamento de process tree quando apenas PID do processo principal for sinalizado.

Uma limitação pode ser aceita somente quando estiver fora dos requisitos obrigatórios do alvo de release e documentada com evidência. Limitações que afetam o objetivo central da V3.5 devem bloquear o gate.

---

# 15. CRITÉRIO DE SUCESSO

A V3.5 estará concluída quando o EvolveLoop conseguir executar um workflow real de engenharia em ambiente isolado, operar harnesses com capacidades verificadas, manter o trabalho em background, recuperar-se de falhas, integrar alterações sem perda, controlar operações sensíveis por política e aprovação, e validar o resultado por evidências.

A medida de sucesso não é quantidade de módulos ou adapters. É a capacidade de operar com segurança e continuidade.

**A V3 construiu o cérebro organizacional. A V3.5 deve entregar o runtime operacional confiável no qual esse cérebro trabalha.**
