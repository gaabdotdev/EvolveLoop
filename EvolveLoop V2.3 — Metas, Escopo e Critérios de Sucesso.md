# EvolveLoop V2.3 — Metas, Escopo e Critérios de Sucesso

**Status:** Documento-base para planejamento  
**Versão:** 2.3  
**Foco:** Integração operacional entre EvolveLoop e Orca  
**Natureza:** Definição de objetivos, resultados esperados, restrições e critérios de aceitação. Não constitui arquitetura técnica nem plano de implementação.

---

## 1. Visão da versão

A EvolveLoop V2.3 deve transformar o Orca no ambiente operacional multiagente utilizado pelo EvolveLoop para coordenar o trabalho em projetos, preservando o EvolveLoop como responsável por seus contratos, políticas, conhecimento, evidências e critérios de qualidade.

A integração não deve se limitar à abertura de terminais, ao lançamento de agentes ou à criação de worktrees. Deve proporcionar um fluxo verificável em que o trabalho seja decomposto, delegado, executado em contextos adequados, acompanhado, revisado e encerrado com evidências rastreáveis.

O comando público `/evolve` deve ser o ponto de entrada para preparar, validar e utilizar o ambiente multiagente do projeto atual. Em um projeto novo, deve permitir reconhecer as condições existentes e conduzir o projeto à preparação necessária. Em um projeto já preparado, deve reconhecer e reutilizar o ambiente válido, sem recriá-lo indiscriminadamente.

A delegação precisa deixar de depender apenas da intenção expressa em prompts. Deve ser demonstrável por execuções reais do Orca, com tarefas, agentes, contextos de trabalho, estados, verificações e resultados identificáveis.

### Resultado central

Estabelecer um fluxo confiável:

`/evolve` **→ reconhecimento do projeto → preparação ou reutilização do ambiente → orquestração no Orca → execução especializada → revisão independente → evidências e encerramento.**

O fluxo deve representar honestamente falhas, bloqueios, limitações e incertezas.

## 2. Princípios obrigatórios

1. **EvolveLoop como núcleo de governança:** o Orca fornece o ambiente de execução e coordenação; não substitui os contratos, políticas, critérios de qualidade ou mecanismos de conhecimento do EvolveLoop.
2. **Orquestração real:** um prompt, terminal aberto, processo iniciado ou mensagem enviada não prova, isoladamente, que uma tarefa foi delegada ou concluída.
3. **Delegação verificável:** cada tarefa precisa ter identidade, escopo, responsável, estado, critérios de aceitação e resultado rastreáveis.
4. **Responsabilidades explícitas:** o coordenador organiza, distribui, supervisiona e verifica; não assume silenciosamente a implementação que deveria delegar.
5. **Isolamento proporcional ao risco:** o contexto de trabalho deve ser adequado à tarefa. Uma worktree Git não deve ser considerada uma sandbox completa.
6. **Continuidade sem reinicialização cega:** interrupções e retomadas devem preservar o estado relevante e distinguir trabalho concluído, incompleto, falho ou incerto.
7. **Falha honesta:** indisponibilidade de runtime, agente, ferramenta, credencial ou capacidade deve produzir um estado explícito, nunca uma alegação de sucesso.
8. **Idempotência:** repetir `/evolve` não deve duplicar configurações, destruir estado válido ou sobrescrever silenciosamente personalizações.
9. **Portabilidade:** não depender de caminhos absolutos da máquina do autor, de um sistema operacional específico ou de configurações pessoais não declaradas.
10. **Evidência antes da conclusão:** os resultados devem ser sustentados por observações e verificações, não apenas pela autodeclaração do agente executor.
11. **Autonomia controlada:** os limites de ação devem ser compatíveis com o papel, o risco e a política aplicável.
12. **Compatibilidade honesta:** capacidades não suportadas por um agente ou backend devem ser explicitamente limitadas, não simuladas.

---

## 3. Metas individuais

### V23-GOAL-001 — `/evolve` como ponto de entrada operacional por projeto

**Prioridade:** P0 — essencial

O `/evolve` deve ser a entrada canônica para iniciar ou retomar o trabalho do EvolveLoop em um projeto. A experiência precisa contemplar projetos novos, preparados, parcialmente configurados, incompatíveis ou cujo estado não possa ser determinado com segurança.

O projeto atual deve ser tratado como a unidade de contexto. O usuário não deve precisar reconstruir manualmente a intenção de usar o Orca em cada sessão, nem refazer uma preparação válida em todas as invocações.

**Resultados exigidos**

- O projeto atual é identificado sem dependência de caminhos fixos da máquina do autor.
- Os estados ausente, pronto, parcialmente preparado, incompatível, bloqueado e desconhecido são distinguíveis.
- Ambientes válidos são reutilizados; a preparação ocorre quando necessária.
- O fluxo não declara prontidão sem verificar os componentes críticos.
- Pré-requisitos ausentes e decisões humanas pendentes são apresentados claramente.
- As políticas, os gates e os requisitos de conhecimento do EvolveLoop continuam aplicáveis.

**Critérios de aceitação**

- Um projeto novo é reconhecido como não preparado e encaminhado ao processo apropriado.
- Um projeto preparado é reutilizado sem duplicação desnecessária.
- Uma configuração parcial ou inválida não é classificada como pronta.
- Invocações repetidas não causam alterações duplicadas ou destrutivas.
- Projetos diferentes não compartilham estado específico de projeto acidentalmente.

### V23-GOAL-002 — Preparação e validação do ambiente Orca

**Prioridade:** P0 — essencial

O EvolveLoop deve distinguir a mera presença do Orca da disponibilidade efetiva das capacidades necessárias para operar o projeto. A preparação deve ser compatível com as configurações existentes e com o fluxo de execução pretendido.

A meta não determina antecipadamente se a preparação será automática, interativa ou híbrida. Exige que o resultado seja seguro, compreensível e verificável.

**Resultados exigidos**

- O estado do Orca e das capacidades necessárias pode ser classificado.
- A configuração existente é inspecionada antes de alterações.
- Configurações do projeto, do usuário e do runtime são tratadas como âmbitos distintos.
- Preparação, validação, bloqueios e limitações são visíveis ao coordenador.
- Configurações válidas são preservadas e não são sobrescritas silenciosamente.
- Decisões que não possam ser inferidas com segurança são solicitadas ao usuário.

**Critérios de aceitação**

- Orca instalado não é automaticamente considerado Orca funcional para a operação exigida.
- Recursos experimentais ou opcionais não são considerados ativos sem confirmação.
- A ausência de agente, CLI, autenticação ou capacidade requerida é explicitamente registrada.
- Alterações relevantes de configuração são rastreáveis.
- Uma preparação incompleta bloqueia alegações de prontidão e operações que dependam de recursos indisponíveis.

### V23-GOAL-003 — Orquestração multiagente real e rastreável

**Prioridade:** P0 — essencial

O trabalho multiagente deve utilizar os mecanismos de orquestração efetivamente disponíveis no Orca e na versão instalada. Não pode depender apenas de um coordenador afirmar que delegou, abrir terminais manualmente ou produzir instruções que os workers nunca receberam.

O coordenador deve conseguir organizar objetivos em unidades de trabalho delimitadas, representar dependências, acompanhar execuções e consolidar resultados. O número de agentes não constitui, por si só, uma medida de qualidade.

**Resultados exigidos**

- Objetivos podem ser representados por tarefas individualizadas e rastreáveis.
- Cada tarefa possui escopo, entregável, critérios de aceitação e condições de bloqueio.
- Dependências relevantes entre tarefas são explícitas.
- O coordenador acompanha estados, perguntas, falhas, interrupções e conclusões.
- Cada execução pode ser relacionada à tarefa, ao agente e ao contexto de trabalho.
- A consolidação distingue resultados aceitos, rejeitados, falhos e pendentes.

**Critérios de aceitação**

- Uma execução real demonstra pelo menos duas tarefas independentes quando o cenário permite paralelismo.
- O relatório identifica o agente responsável e o resultado observado para cada tarefa.
- Mensagens, heartbeats, terminais ociosos e declarações textuais não são provas suficientes de conclusão.
- Falhas e timeouts não são convertidos automaticamente em sucesso.
- Dependências são respeitadas e conflitos evitáveis são detectados.

### V23-GOAL-004 — Contratos claros para os papéis dos agentes

**Prioridade:** P0 — essencial

Os papéis da operação EvolveLoop–Orca devem possuir fronteiras explícitas de responsabilidade, autoridade e prestação de contas.

No mínimo, deve haver uma distinção efetiva entre coordenação, execução especializada e revisão independente. Papéis adicionais só devem ser introduzidos quando houver benefício demonstrável.

O coordenador deve delegar, supervisionar e verificar. O executor deve atuar dentro do escopo recebido e comunicar bloqueios. O revisor deve avaliar os resultados com independência suficiente para rejeitar uma entrega inadequada.

**Resultados exigidos**

- Cada papel possui missão, responsabilidades, proibições e limites de autoridade.
- Planejamento, execução, revisão, aprovação e integração não são confundidos.
- Os critérios de aceitação são conhecidos pelo agente responsável.
- A revisão não depende exclusivamente da narrativa do executor.
- A ausência de um papel necessário é registrada como limitação ou bloqueio.

**Critérios de aceitação**

- O coordenador não implementa diretamente artefatos de produto quando a política exige delegação, salvo exceção explícita e rastreada.
- O executor não amplia unilateralmente seu escopo nem toma decisões reservadas ao coordenador ou ao usuário.
- O revisor pode rejeitar resultados e justificar a decisão com evidências.
- Perguntas que exigem decisão externa chegam ao responsável correto.
- Cada entrega possui um responsável identificável e um estado de validação.

### V23-GOAL-005 — Uso verificável do EvolveLoop pelos workers

**Prioridade:** P0 — essencial

Os agentes participantes devem ter acesso efetivo aos contratos e recursos do EvolveLoop aplicáveis às suas tarefas. Uma simples menção ao EvolveLoop no prompt não é suficiente.

A integração deve respeitar diferenças reais entre CLIs e backends. Não se pode presumir que `/evolve`, uma skill, um arquivo de instruções, uma regra ou um MCP seja universalmente suportado ou carregado em todos os agentes.

**Resultados exigidos**

- É possível determinar quais instruções e capacidades do EvolveLoop estão disponíveis para cada worker.
- Requisitos pertinentes de política, conhecimento, gates, evidências e reporte acompanham a tarefa.
- Disponibilidade, carregamento, utilização e comprovação de utilização são estados distintos.
- Limitações específicas de cada backend são respeitadas.
- A conformidade não é comprovada apenas pela repetição de uma afirmação do agente.

**Critérios de aceitação**

- Um teste real demonstra que cada worker tem acesso ao contrato correto para seu backend e à política aplicável.
- Um worker sem requisito obrigatório não é reportado como plenamente conforme.
- Um backend sem capacidade necessária gera bloqueio ou estado limitado explícito.
- Instruções ad hoc do Orca ou do agente não substituem políticas canônicas incompatíveis.
- A comprovação exigida é proporcional ao risco da tarefa.

### V23-GOAL-006 — Isolamento do trabalho e integração controlada das worktrees

**Prioridade:** P0 — essencial

Cada tarefa deve executar em um contexto compatível com seu risco, suas dependências e seu potencial de conflito. As worktrees devem permitir execução paralela e revisão sem misturar alterações, destruir trabalho preexistente ou sugerir garantias de segurança que não oferecem.

Não é necessário criar uma worktree nova a cada invocação de `/evolve`. A decisão deve considerar o ambiente existente e a unidade real de trabalho.

**Resultados exigidos**

- Cada execução pode ser relacionada ao contexto de trabalho em que ocorreu.
- Alterações de tarefas paralelas permanecem identificáveis e revisáveis separadamente.
- A integração depende dos critérios de revisão e validação aplicáveis.
- Alterações preexistentes e não relacionadas são preservadas.
- Arquivos compartilhados, caches, configurações locais e segredos recebem tratamento compatível com seus riscos.
- Worktrees não são apresentadas como isolamento completo do sistema operacional.

**Critérios de aceitação**

- Um teste com múltiplas tarefas identifica corretamente o contexto e as alterações de cada uma.
- Conflitos e mudanças fora de escopo são detectáveis antes da aceitação.
- A falha de um worker não apaga ou mistura silenciosamente o trabalho de outro.
- Nenhuma integração ignora gates obrigatórios.
- Alterações não integradas são reportadas no encerramento.

### V23-GOAL-007 — Recuperação de falhas e continuidade entre sessões

**Prioridade:** P1 — alta

A operação deve suportar interrupções sem reiniciar cegamente todo o trabalho ou declarar sucesso pela ausência de erros visíveis.

É necessário distinguir falha confirmada, timeout, agente sem resposta, execução possivelmente ativa, pergunta pendente, resultado parcial e conclusão validada.

**Resultados exigidos**

- Os estados de execução representam corretamente conclusão e incerteza.
- Resultados já validados podem ser preservados durante a retomada.
- Repetições não duplicam de forma descontrolada efeitos externos.
- Perguntas, aprovações e decisões pendentes continuam visíveis.
- Existem limites claros para recuperação e escalonamento ao usuário.
- O estado do Orca não é confundido com a fonte canônica de estado e evidências do EvolveLoop.

**Critérios de aceitação**

- Um worker interrompido não é classificado como concluído com sucesso.
- A retomada recupera escopo, estado e evidências pertinentes.
- Operações com efeitos externos não idempotentes não são repetidas cegamente.
- Estados ambíguos ou irrecuperáveis são escalonados.
- O relatório identifica o que foi retomado, reexecutado, perdido, bloqueado ou permaneceu incerto.

### V23-GOAL-008 — Autonomia controlada, permissões e proteção proporcional ao risco

**Prioridade:** P1 — alta

A V2.3 deve estabelecer limites de autonomia para coordenadores, executores e revisores. A existência de worktrees ou de vários agentes não implica isolamento de credenciais, diretórios pessoais, rede ou serviços externos.

**Resultados exigidos**

- Os papéis possuem limites de ação compatíveis com suas responsabilidades.
- Ações destrutivas, irreversíveis, externas ou de alto impacto têm requisitos explícitos de autorização.
- Segredos não são expostos em prompts, mensagens, logs, evidências, checkpoints ou relatórios.
- A política considera o risco da tarefa, não apenas o tipo de agente.
- O usuário consegue identificar execuções limitadas, bloqueadas ou aguardando aprovação.
- O sistema não afirma possuir sandbox ou proteção que não tenha sido comprovada.

**Critérios de aceitação**

- Ações não autorizadas são bloqueadas ou escalonadas conforme a política.
- Artefatos versionados e relatórios não contêm segredos detectáveis.
- Alterações destrutivas em configurações ou conhecimento persistente exigem salvaguardas adequadas.
- As permissões efetivas são observáveis, não presumidas.
- Uma falha crítica de segurança impede a aprovação da meta, mesmo que o fluxo funcional tenha passado.

### V23-GOAL-009 — Rastreabilidade, evidências e prestação de contas

**Prioridade:** P1 — alta

Cada execução relevante deve deixar uma trilha capaz de responder: o que foi solicitado, o que foi delegado, quem executou, em qual contexto, quais alterações ocorreram, como o resultado foi verificado e o que permanece pendente.

A evidência de execução do Orca e a evidência canônica do EvolveLoop devem possuir responsabilidades claras. Nenhuma mensagem ou resumo isolado deve substituir universalmente os artefatos de validação.

**Resultados exigidos**

- Tarefas, execuções, agentes, worktrees, artefatos e resultados podem ser correlacionados.
- Relatórios distinguem declarações do agente, observações do runtime e verificações independentes.
- Evidências são específicas o suficiente para sustentar o estado declarado.
- Os estados PASS, LIMITED, BLOCKED, NOT_MEASURED e UNAVAILABLE — ou equivalentes documentados — são usados sem inflar resultados.
- Pendências, limitações, riscos aceitos e decisões humanas ficam explícitos.
- A trilha não registra segredos nem dados desnecessários.

**Critérios de aceitação**

- Um avaliador consegue reconstruir o resultado com base no relatório e nas evidências referenciadas.
- O relatório identifica, quando aplicável, objetivo, tarefas, execuções, agentes, worktrees, arquivos, testes, resultados, bloqueios e pendências.
- Alegações de testes aprovados apontam para evidências verificáveis.
- Falhas de validação não são ocultadas por resumos positivos.
- Evidências ausentes são registradas como ausentes, nunca fabricadas ou inferidas.

### V23-GOAL-010 — Testes de aceitação, falhas e regressão integrada

**Prioridade:** P1 — alta

A V2.3 deve ser avaliada por cenários que demonstrem o comportamento integrado do EvolveLoop e do Orca, incluindo cenários negativos. A presença de arquivos, configurações válidas ou testes unitários isolados não prova que a delegação real funciona.

**Resultados exigidos**

- Existe um conjunto de cenários de aceitação reproduzíveis.
- Testes distinguem validação estrutural, simulação, integração real e avaliação de qualidade.
- Falhas de runtime, worker, configuração, política, recuperação e conformidade são testadas.
- Resultados são comparáveis entre mudanças para identificar regressões.
- Limitações de credenciais ou ambiente não mascaram cobertura ausente.

**Critérios de aceitação**

- O cenário principal demonstra tarefas reais, execução por workers e validação dos resultados.
- Worker falho, worker sem resposta e requisito obrigatório ausente produzem estados distintos e corretos.
- A preparação de um projeto novo e a reutilização de um projeto preparado são validadas.
- Há cenários de isolamento entre tarefas e retomada após interrupção.
- Os relatórios distinguem testes executados, não executados, bloqueados e simulados.

### V23-GOAL-011 — Portabilidade e compatibilidade por backend

**Prioridade:** P2 — importante, condicionada às capacidades reais

A integração deve preservar a arquitetura backend-agnostic do EvolveLoop. O Orca pode ser o ambiente operacional central desta versão sem contaminar o núcleo canônico com lógica específica de fornecedor ou tornar capacidades exclusivas do Orca requisitos universais de todo backend.

**Resultados exigidos**

- Responsabilidades específicas do Orca permanecem separadas dos contratos canônicos.
- Diferenças entre CLIs, skills, comandos, MCPs e carregamento de instruções são reconhecidas.
- Recursos exclusivos de um backend são descritos como opcionais ou como limitações explícitas.
- Configurações não dependem de caminhos da máquina do autor.
- Não existe fallback automático capaz de alterar silenciosamente permissões ou garantias.

**Critérios de aceitação**

- A integração Orca pode ser validada sem dependência indevida no núcleo canônico.
- Backends não suportados são classificados honestamente como limitados ou indisponíveis.
- Adaptadores não simulam capacidades não implementadas.
- Compatibilidade universal não é declarada a partir de um único ambiente de teste.

---

## 4. Priorização e dependências

### P0 — Fundamento operacional

- GOAL-001: `/evolve` como entrada por projeto.
- GOAL-002: preparação e validação do ambiente Orca.
- GOAL-003: orquestração real.
- GOAL-004: contratos de papéis.
- GOAL-005: uso verificável do EvolveLoop pelos workers.
- GOAL-006: isolamento e integração por worktree.

Essas metas definem o fluxo operacional mínimo. A versão não deve ser considerada funcional se alguma delas estiver apenas documentada, sem demonstração integrada.

### P1 — Confiabilidade

- GOAL-007: recuperação e continuidade.
- GOAL-008: autonomia e segurança.
- GOAL-009: rastreabilidade e evidências.
- GOAL-010: testes de aceitação e regressão.

Segurança e evidências são condições de aprovação: falhas críticas não podem ser compensadas pelo sucesso de outras metas.

### P2 — Portabilidade ampliada

- GOAL-011: compatibilidade por backend.

A portabilidade não pode enfraquecer o fluxo principal. O planejamento deve distinguir requisitos canônicos de recursos dependentes de versões ou ambientes específicos.

### Dependências gerais

- A auditoria do ambiente Orca e do ponto de entrada atual do EvolveLoop informa as metas 001, 002, 003 e 005.
- Os contratos dos papéis informam orquestração, revisão, segurança e testes.
- A compreensão do modelo de worktrees é necessária para validar paralelismo e recuperação.
- As exigências de segurança precisam estar claras antes de habilitar autonomia ampla.
- A bateria de aceitação deve verificar o sistema integrado, não apenas componentes isolados.

O agente de planejamento deverá mapear dependências reais, identificar ciclos e propor uma ordem viável. A lista acima não constitui uma sequência técnica definitiva.

---

## 5. Limites de escopo

### Dentro da V2.3

- Integração operacional do EvolveLoop com Orca.
- `/evolve` como entrada para preparar, validar, reutilizar ou retomar o ambiente do projeto.
- Orquestração real com tarefas e workers rastreáveis.
- Contratos de coordenação, execução e revisão.
- Comprovação do acesso dos workers ao EvolveLoop e às políticas aplicáveis.
- Worktrees com revisão e integração controladas.
- Recuperação, retomada, bloqueios e estados incertos.
- Permissões proporcionais ao risco.
- Evidências, relatórios e testes integrados.
- Portabilidade compatível com a arquitetura canônica.

### Fora de escopo por padrão

- Reescrever integralmente o motor central do EvolveLoop apenas para acomodar o Orca.
- Criar um segundo orquestrador que duplique sem necessidade as responsabilidades do Orca.
- Substituir todos os backends atuais ou declarar suporte universal sem provas.
- Multiplicar papéis e agentes sem benefício demonstrável.
- Automatizar merges, publicações, exclusões ou ações externas sem os gates apropriados.
- Migrar imediatamente a execução para servidor remoto ou cloud antes de validar o fluxo operacional no ambiente-alvo.
- Realizar refatorações estéticas ou reorganizações sem relação necessária com as metas.
- Prometer sandbox, segurança forte ou autonomia irrestrita sem evidências.

Expansões de escopo devem justificar benefício, custo, risco e impacto sobre as metas prioritárias.

---

## 6. Entregáveis esperados

1. Fluxo `/evolve` operacional, capaz de reconhecer o estado do projeto e preparar, validar ou reutilizar o ambiente.
2. Integração Orca demonstrada por execuções reais, não apenas por documentação.
3. Contratos de papéis com responsabilidades e limites explícitos.
4. Modelo verificável de acesso dos workers ao EvolveLoop.
5. Fluxo de trabalho com isolamento, revisão e integração controlada.
6. Tratamento explícito de falhas, timeouts, perguntas, retomadas e estados incertos.
7. Trilha de evidências e relatório final auditáveis.
8. Bateria de aceitação e regressão, incluindo cenários negativos.
9. Documentação das capacidades suportadas, limitações, decisões e itens adiados.
10. Resultado reproduzível em ambiente de referência declarado, distinguindo o que foi testado do que não foi medido.

---

## 7. Condições para declarar a V2.3 concluída

A versão só poderá ser considerada concluída quando:

- Todas as metas P0 tiverem sido demonstradas por critérios verificáveis.
- Riscos críticos de segurança estiverem resolvidos; caso contrário, a liberação estará bloqueada.
- `/evolve` preparar ou reutilizar o ambiente sem duplicação destrutiva ou falso estado de prontidão.
- Uma execução integrada demonstrar tarefas reais, workers identificáveis, contextos rastreáveis e revisão.
- Os workers demonstrarem conformidade verificável com o contrato EvolveLoop aplicável.
- Pelo menos um cenário de falha e um de recuperação tiverem sido testados e relatados corretamente.
- As conclusões estiverem sustentadas por evidências.
- Limitações conhecidas estiverem registradas.
- O estado final distinguir PASS, LIMITED, BLOCKED, NOT_MEASURED e UNAVAILABLE, ou uma taxonomia equivalente documentada.
- O usuário conseguir compreender o que funciona, o que depende de configuração externa e o que não foi comprovado.

Não é necessário implementar todos os recursos imagináveis, oferecer suporte a todos os backends ou permitir autonomia irrestrita. É necessário que o escopo aprovado funcione de maneira verificável, segura e honesta.

---

## 8. Orientações para o planejamento individual das metas

Este documento não é uma ordem para implementar todas as metas imediatamente nem uma arquitetura técnica pré-aprovada.

Cada meta deverá ser planejada individualmente. Cada plano deve esclarecer:

- Estado atual comprovado e lacunas identificadas.
- Resultado concreto pretendido.
- Critérios de aceitação verificáveis.
- Dependências, riscos e possíveis conflitos com outras metas.
- Componentes e contratos afetados.
- Decisões que precisam ser tomadas antes da implementação.
- O que pode ser validado sem implementar alterações.
- Como o resultado será demonstrado e quais evidências serão produzidas.
- Limites explícitos da meta.
- Relações com outras metas sem duplicar escopo.

O planejamento deve partir do código, das configurações e da documentação reais do EvolveLoop e do Orca no ambiente-alvo. Não deve assumir que hipóteses desta proposta já são capacidades existentes, nem preencher lacunas com uma arquitetura inventada.

Incertezas devem ser registradas e investigadas antes de se tornarem decisões. O produto desta fase é um conjunto de planos individuais coerentes e integráveis, não código ou implementação antecipada.

---

## 9. Base e ressalvas

Este documento consolida os objetivos discutidos para a integração EvolveLoop–Orca e a pesquisa técnica preliminar sobre o Orca. A pesquisa indica a existência de conceitos de worktrees e orquestração estruturada, mas a disponibilidade e o comportamento exato dependem da versão e da configuração instaladas. Uma capacidade documentada não prova que esteja habilitada no ambiente atual.

O contrato atual de `/evolve` e a arquitetura backend-agnostic do EvolveLoop devem ser tratados como referências a inspecionar durante o planejamento. Nenhuma meta autoriza remover gates, políticas, requisitos de conhecimento ou salvaguardas existentes sem análise explícita de compatibilidade e aprovação apropriada.

**Princípio final:** a V2.3 não deve apenas fazer agentes trabalharem em paralelo. Deve tornar o trabalho multiagente do EvolveLoop operacional, rastreável, verificável, recuperável e seguro dentro do Orca.