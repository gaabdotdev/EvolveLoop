# EVOLVELOOP V3
## Visão de produto, princípios arquiteturais e critérios de sucesso

**Documento-base de definição — versão 0.6**  
**Data:** 9 de novembro de 2026  
**Status:** Revisão 0.6 incorpora a reconciliação entre a visão V3 e o snapshot atual do repositório V2. Identifica componentes preserváveis, capacidades a evoluir, lacunas e limites de evidência. Nenhum código do repositório foi alterado nesta revisão; build e testes não foram reproduzidos nesta sessão por indisponibilidade de dependências.

> **Definição:** EvolveLoop é uma plataforma CLI-first, local-first e agnóstica a provedores para coordenar hierarquias de agentes e ferramentas especializadas em trabalhos complexos de engenharia de software. Um Orquestrador-Mestre acompanha o estado global sem executar trabalho diretamente; líderes de domínio planejam e supervisionam; workers executam tarefas delimitadas. Um estado de trabalho persistente e compartilhado permite que tarefas sobrevivam a limites, falhas ou substituições de agentes, enquanto o Goal Contract e as evidências determinam a conclusão.

---

## Controle do documento

| Campo | Definição |
|---|---|
| Produto | EvolveLoop V3 |
| Tipo | Visão de produto, princípios arquiteturais e framework de sucesso |
| Versão do documento | 0.6 — reconciliação da visão V3 com o baseline de código V2 |
| Estado | Visão V3 consolidada e reconciliada com snapshot V2; itens de produto pendentes permanecem explícitos; validação de build/testes do snapshot não reproduzida nesta sessão |
| Público | Produto, arquitetura, engenharia e colaboradores |
| Escopo | O que construir, por que construir, como avaliar sucesso e quais limites respeitar |
| Fora do escopo | Código, seleção definitiva de bibliotecas, desenho detalhado de APIs e plano de implementação por arquivo |

### Como interpretar este documento

As afirmações estão separadas em quatro categorias:

- **Alinhado:** direção expressa e aceita nas discussões até aqui.
- **Proposta:** decisão recomendada para tornar a visão coerente e verificável.
- **Hipótese:** ideia plausível que depende de experimento ou validação técnica.
- **Em aberto:** decisão que não deve ser tratada como compromisso até ser deliberada.

A V3 não deve começar com todas as escolhas de tecnologia congeladas. O objetivo deste documento é estabilizar o problema, a proposta de valor, os princípios, as capacidades, os limites e os resultados esperados. As decisões de implementação virão depois.

## Histórico de revisão

| Versão | Data | Alteração principal |
|---|---|---|
| 0.1 | 1 nov 2026 | Primeira consolidação da visão de produto. |
| 0.2 | 1 nov 2026 | CLI-first, execução em background, local-first, Goal Contract, autonomia e critérios de sucesso. |
| 0.3 | 2 nov 2026 | Canvas: Mestre não executor, líderes, planners, workers, auxiliares, memória compartilhada e handoff; distinção entre JEV, embeddings e intenção de licença não comercial. |
| 0.4 | 2 nov 2026 | Ciclo hierárquico, estados do agente, gatilhos de limite/falha, checkpoint, handoff e retomada sem repetir trabalho verificado. |
| 0.5 | 2 nov 2026 | Incorpora o canvas como modelo operacional explícito: contratos de delegação, registry e estado vivo dos agentes, responsabilidade por subagentes, recuperação de descendentes e gates de hierarquia. |

# 1. Resumo executivo

O EvolveLoop V3 será um ambiente de trabalho CLI-first para coordenar hierarquias de agentes em trabalhos complexos de engenharia de software. A TUI será a interface principal, mas o Core executará como serviço local persistente: fechar a interface ou os terminais visíveis não encerrará trabalhos em andamento.

O modelo operacional deixa explícita a separação de responsabilidades. O **Orquestrador-Mestre** é o coordenador global: acompanha o Goal Contract, o grafo de tarefas, o registry de agentes, estados, dependências, bloqueios e recursos; delega responsabilidades e organiza handoffs. Ele não escreve código, não executa trabalho de worker, não elabora planos setoriais detalhados e não avalia qualidade subjetivamente. **Líderes de domínio** coordenam setores como backend, frontend, banco de dados, segurança, testes, deploy, auditoria ou outros domínios necessários; cada líder cria obrigatoriamente um planner, revisa seu plano e registra aprovação antes de liberar execução. **Workers** realizam o trabalho delimitado e podem criar auxiliares de pesquisa/análise quando necessário. Toda delegação possui objetivo, escopo, critérios, permissões, orçamento, responsável e evidências esperadas.

Todos os agentes e níveis compartilham uma fonte persistente de estado, mas não recebem o mesmo histórico bruto. O estado global é registrado em memória de trabalho, eventos, tarefas, artefatos e evidências. Cada agente recebe uma visão filtrada pelo seu papel e pela tarefa atribuída. Assim, se um worker atingir limite de tokens, quota, rate limit, perder a sessão ou falhar, o supervisor consegue reconstruir onde o trabalho parou e delegar a continuidade a outro agente sem refazer o que já foi verificado.

O usuário poderá conectar os agentes e provedores que preferir. As integrações prioritárias de agentes são Cursor, Claude Code, Antigravity e Codex. O caminho local será sustentado por Ollama e modelos adequados ao hardware; OmniRoute poderá oferecer acesso unificado a provedores locais, gratuitos e pagos. Nenhum serviço remoto será usado com dados do projeto sem habilitação explícita do usuário.

A eficiência de tokens é uma propriedade arquitetural central. O EvolveLoop deverá recuperar contexto sob demanda, usar Nomic Embed Text para embeddings, separar memória de estado de execução, compactar informações sem perder decisões e usar modelos de decisão do estilo Jev para selecionar recursos elegíveis. Nomic não é o seletor de modelos: ele gera embeddings; a seleção estruturada pertence ao decision model e às políticas determinísticas do Core.

O trabalho começa com Grill-Me e um Goal Contract, e só termina em `TRUE FULL PASS` quando todos os critérios obrigatórios aplicáveis tiverem passado com evidências suficientes. Um agente ou modelo pode parar; o trabalho não deve morrer com ele. Se não houver recurso substituto disponível, a tarefa fica persistida e pausada, com o motivo visível.

## 1.1 Tese do produto

**O EvolveLoop coordena trabalho; agentes especializados o executam.** O produto transforma objetivos em contratos verificáveis, estrutura uma hierarquia de responsáveis, preserva estado compartilhado, escolhe recursos e recupera tarefas quando agentes deixam de estar disponíveis.

## 1.2 Promessa principal

> Entregar trabalhos complexos de engenharia com agentes especializados coordenados por um orquestrador persistente, transferíveis entre provedores e sustentados por evidências — com o menor desperdício razoável de tokens, tempo e recursos.

---

# 2. Visão, missão e posicionamento

## 2.1 Visão

Ser uma plataforma extensível com código-fonte disponível sob uma licença que permita estudar, modificar e redistribuir para usos permitidos, mas restrinja a exploração comercial conforme uma política ainda a formalizar. O EvolveLoop deve coordenar diferentes modelos, agentes e ferramentas em fluxos complexos, mantendo continuidade, controle de contexto, execução, segurança, custo e qualidade.

## 2.2 Missão

Reduzir a distância entre um objetivo de software e sua conclusão verificável, tornando agentes heterogêneos coordenáveis e suas execuções observáveis, eficientes e governáveis.

## 2.3 Categoria do produto

**Agent Orchestration Environment for Software Engineering**, com experiência CLI-first.

O EvolveLoop combina aspectos de:

- ambiente de trabalho interativo no terminal;
- orquestrador de agentes e tarefas;
- roteador de modelos e provedores;
- camada de contexto, memória e eficiência;
- runtime de execução governada;
- sistema de verificação e evidências.

## 2.4 Diferenciação pretendida

O diferencial não será simplesmente suportar muitos modelos ou expor muitos comandos. Será coordenar capacidades de diferentes origens em um fluxo coerente, com estado compartilhado, regras consistentes, observabilidade e avaliação de resultado.

---

# 3. Problemas que a V3 deve resolver

A V3 deve responder a problemas concretos do uso atual de agentes de engenharia:

1. **Fragmentação:** diferentes agentes, CLIs, SDKs e ferramentas possuem sessões, estados, capacidades e formatos de saída distintos.
2. **Coordenação fraca:** tarefas complexas exigem decomposição, dependências, delegação, sincronização, recuperação e visão global do progresso.
3. **Contexto inflado:** agentes frequentemente recebem arquivos, histórico, instruções e resultados que não são relevantes para a tarefa atual.
4. **Consumo pouco controlado:** chamadas, modelos, paralelismo e contexto podem aumentar o custo sem benefício proporcional.
5. **Execução difícil de governar:** permissões, isolamento, credenciais, efeitos colaterais e cancelamento variam entre ferramentas.
6. **Conclusão não comprovada:** uma resposta afirmando sucesso não prova que o código foi alterado corretamente, testado ou que os critérios foram cumpridos.
7. **Dependência de fornecedor:** workflows ficam presos a um único agente, modelo ou serviço.
8. **Continuidade frágil:** limites de contexto, quotas, desconexões, falhas de processo e encerramento de interfaces podem interromper agentes e perder o fio do trabalho, mesmo quando a tarefa ainda pode ser concluída por outro recurso.

A V3 não deve presumir que um único modelo ou agente seja o melhor para todas essas etapas.

---

# 4. Público e cenários prioritários

## 4.1 Público primário

Desenvolvedores e equipes técnicas que trabalham com projetos de software reais e desejam delegar tarefas a agentes sem perder controle sobre planejamento, execução, qualidade, custo e segurança.

## 4.2 Cenários prioritários

- Entender uma base de código desconhecida antes de modificá-la.
- Investigar bugs com múltiplos arquivos, dependências ou serviços envolvidos.
- Planejar e executar refatorações de médio ou grande porte.
- Implementar funcionalidades com especificação, tarefas, testes e revisão.
- Coordenar agentes diferentes para pesquisa, implementação, testes e auditoria.
- Executar tarefas em ambientes locais sem depender de serviços remotos.
- Retomar trabalhos interrompidos sem reconstruir todo o contexto.
- Auditar mudanças com critérios de segurança e evidências.

## 4.3 Cenários fora da prioridade inicial

A V3 poderá evoluir para outros domínios, mas sua primeira identidade deve permanecer focada em engenharia de software. Automação genérica de qualquer profissão, agentes pessoais universais e workflows empresariais sem relação com desenvolvimento não devem diluir o foco inicial.

---

# 5. Princípios não negociáveis

## 5.1 CLI-first, não CLI-only

A experiência principal será no terminal, com TUI interativa, mas o produto deverá oferecer uso interativo e não interativo desde a primeira versão. O núcleo não dependerá da interface. A execução será persistente e desacoplada dos terminais: fechar a TUI, a janela do CLI ou os terminais de agentes não encerrará automaticamente os trabalhos. A continuidade após logout, reboot, suspensão ou desligamento do sistema terá políticas próprias e configuráveis, não devendo ser confundida com a simples persistência em background.

## 5.2 Core independente de fornecedor

Agentes, modelos e ferramentas devem ser conectados por adaptadores e contratos explícitos. Nenhum fornecedor deve ser requisito para o funcionamento básico. As primeiras integrações de agentes priorizadas são Cursor, Claude Code, Antigravity e Codex; isso representa prioridade de integração, não promessa de equivalência funcional entre eles.

## 5.3 Local-first e escolha do usuário

O usuário deve poder começar sem conectar serviços externos. A operação local será o caminho padrão de independência. Serviços remotos poderão ser adicionados pelo usuário, com configuração e consentimento explícitos.

## 5.4 Modelo e agente são conceitos diferentes

Um modelo fornece capacidade de inferência. Um agente/harness pode fornecer ciclo de execução, ferramentas, sessões, permissões e estado próprios. A V3 precisa representar essas diferenças, sem reduzir todos os provedores a uma chamada de texto.

## 5.5 Autonomia governada

O padrão de autonomia inclui leitura, criação e edição de arquivos dentro do workspace autorizado. Essas capacidades básicas não serão toggles desativáveis na configuração comum do produto. Terminal/processos, MCPs, rede, APIs externas, criação de subagentes, GitHub, instalação de dependências, deploy, operações destrutivas e uso de credenciais serão capacidades configuráveis pelo usuário e sujeitas às políticas do projeto e do agente. A plataforma deve permitir perfis amplos de autonomia, mas tornar explícito o alcance concedido. Um agente não pode ampliar suas próprias permissões nem transferir a um subagente autoridade superior à sua.

## 5.6 Contexto mínimo suficiente

Cada agente deve receber apenas o contexto necessário para sua tarefa, acrescido de informações obrigatórias de segurança e critérios de aceitação. Reenviar todo o histórico não será a estratégia padrão.

## 5.7 Evidência acima de afirmação

Uma tarefa só será considerada concluída quando os critérios aplicáveis tiverem evidências suficientes. A mensagem final do agente, isoladamente, não é prova de conclusão.

## 5.8 Delegação tem custo

Criar mais agentes não é automaticamente melhor. Delegação e paralelismo precisam justificar seu custo em tokens, tempo, sincronização e risco.

## 5.9 Extensibilidade sem promessa universal

A arquitetura deverá permitir adicionar integrações. A compatibilidade de cada integração será publicada por níveis e capacidades verificadas, sem declarar suporte completo apenas porque uma CLI pode ser iniciada.

## 5.10 Segurança por padrão

A autonomia de arquivos existe dentro do workspace autorizado, não como acesso irrestrito ao sistema. Operações fora do workspace, destrutivas, externas ou irreversíveis respeitam os limites configurados e, quando aplicável, exigem aprovação. A plataforma deverá tornar visível o que cada agente pode fazer e quais controles não consegue impor a agentes externos.

## 5.11 Hierarquia com separação de responsabilidades

O Orquestrador-Mestre e os líderes de domínio coordenam e delegam; não executam diretamente o trabalho dos workers. Cada líder cria obrigatoriamente um subagente de planejamento e aprova o plano antes de liberar a execução. Workers executam tarefas delimitadas e podem criar agentes auxiliares de pesquisa/análise quando necessário. A quantidade de agentes não terá um teto fixo por líder, mas toda criação continuará limitada por orçamento, concorrência, recursos disponíveis, profundidade de delegação e prevenção de ciclos.

## 5.12 Memória compartilhada, contexto seletivo

Todos os agentes compartilham a mesma fonte persistente de estado do trabalho, não necessariamente o mesmo prompt ou histórico completo. O Core mantém dados canônicos e cada agente recebe uma projeção mínima suficiente para seu papel. O compartilhamento deve permitir continuidade sem multiplicar tokens nem criar conflito de escrita.

## 5.13 A tarefa é durável; o agente é substituível

O identificador, o estado, os critérios e os artefatos da tarefa pertencem ao EvolveLoop, não à sessão de um modelo. Um agente pode terminar, atingir quota ou ser substituído sem que a tarefa seja considerada concluída ou descartada. A continuidade depende do estado persistido, não da permanência de uma conversa específica.

---

# 6. Definição do produto e experiência principal

## 6.1 Experiência CLI/TUI

A experiência deverá permitir ao usuário:

- iniciar uma sessão e definir um objetivo em linguagem natural;
- executar em modo interativo ou não interativo;
- fechar e reabrir a TUI sem perder trabalhos em andamento;
- escolher entre planejar, executar ou continuar um trabalho;
- inspecionar o plano, o grafo de tarefas e as dependências;
- visualizar quais agentes e modelos estão disponíveis e por que foram selecionados;
- acompanhar execuções, logs resumidos, eventos, diffs e evidências;
- aprovar ou negar ações conforme a política;
- pausar, cancelar, retomar ou replanejar um trabalho;
- consultar uso de tokens, custo estimado, latência e recursos;
- configurar provedores, modelos, limites e preferências locais.

A interface deve favorecer clareza e controle. Ela não deve esconder a complexidade operacional atrás de uma única animação de “agente trabalhando”.

## 6.2 Comandos e modos conceituais

Os comandos exatos serão definidos posteriormente. Conceitualmente, o produto deve cobrir:

| Área | Intenção do usuário |
|---|---|
| Sessões | Iniciar, continuar, listar e retomar trabalhos |
| Execução | Enviar um objetivo para planejamento ou execução |
| Tarefas | Inspecionar grafo, estado, dependências e responsáveis |
| Agentes | Ver agentes disponíveis, ativos e suas capacidades |
| Provedores | Conectar, desconectar e diagnosticar integrações |
| Modelos | Ver modelos disponíveis, perfis e regras de roteamento |
| Orçamento | Definir limites de tokens, custo, tempo e paralelismo |
| Evidências | Inspecionar testes, diffs, verificações e resultados |
| Diagnóstico | Validar ambiente e requisitos locais |
| Benchmark | Comparar qualidade, eficiência e desempenho |

## 6.3 Um fluxo de trabalho representativo

1. O usuário fornece um objetivo e suas restrições.
2. O Grill-Me conduz uma rodada de perguntas para expor ambiguidades, premissas frágeis, restrições e critérios ausentes.
3. O EvolveLoop cria um Goal Contract com metas, escopo, critérios de aceitação e verificações.
4. A plataforma investiga o workspace por meio das ferramentas e agentes disponíveis.
5. Um plano estruturado é criado, com tarefas, dependências, critérios de aceitação e estimativas.
6. O usuário pode revisar o Goal Contract e o plano, conforme o modo de autonomia.
7. O orquestrador seleciona agentes, modelos e ferramentas adequados.
8. As tarefas são executadas com limites de autoridade, recursos e contexto.
9. Resultados são integrados, conflitos são resolvidos e verificações são realizadas.
10. Falhas, limites de modelo ou novas descobertas podem gerar recuperação, handoff ou replanejamento.
11. O EvolveLoop apresenta o resultado, as evidências, as limitações e o consumo total.
12. O estado relevante permanece persistido para retomada, delegação e continuidade em background.

---

# 7. Pilares funcionais da V3

## 7.1 Intelligence — compreensão, raciocínio e planejamento

A camada de Intelligence deve transformar objetivos em planos acionáveis, mas o Orquestrador-Mestre não executa esse trabalho. O refinamento inicial ocorre pelo Grill-Me/etapa de esclarecimento; depois, os planners obrigatórios criados pelos líderes elaboram os planos por domínio.

O planejamento produz artefatos estruturados, não apenas texto livre: tarefas, dependências, entradas, saídas esperadas, responsável, riscos, orçamento e evidência exigida.

O fluxo padrão de refinamento será inspirado no Grill-Me: questionar o objetivo antes de criar líderes, identificar ambiguidades e premissas e gerar o Goal Contract. A intensidade do questionamento será proporcional à complexidade e ao risco e poderá ser configurada pelo usuário. O sistema valida estrutura, política e viabilidade antes da execução.

## 7.2 Orchestration — coordenação hierárquica multiagente

A coordenação será hierárquica e orientada por domínio. O número e a especialização dos líderes serão determinados pelo Goal Contract, não por uma quantidade fixa de agentes predefinida. Um trabalho pode exigir líderes de backend, frontend, banco de dados, segurança, testes, infraestrutura/deploy, pesquisa, auditoria ou outros domínios. Marketing, lançamento e atividades adjacentes poderão ser domínios opcionais, sem alterar o foco inicial em engenharia de software.

### 7.2.1 Orquestrador-Mestre

O Orquestrador-Mestre é o coordenador global do trabalho. Seu papel é acompanhar continuamente o estado global por meio do registry, eventos e visões de estado; delegar responsabilidades; selecionar recursos; observar atividade, bloqueios e progresso; redistribuir tarefas; resolver a estrutura de coordenação; e conduzir o trabalho até um estado terminal válido. “Acompanhar continuamente” significa receber eventos estruturados e heartbeats com frescor configurado, não manter todo o histórico de cada agente dentro do prompt do Mestre.

Ele **não** escreve código, não executa comandos de implementação, não elabora planos detalhados dos setores e não decide subjetivamente se uma entrega “ficou boa”. Essas atividades são delegadas. O Mestre mantém uma visão de controle compacta: Goal Contract, TaskGraph, líderes e agentes ativos, relação pai/filho, estados, dependências, bloqueios, orçamentos, última atividade conhecida, último checkpoint e referências para evidências. Ele recebe atualizações estruturadas da memória compartilhada e consulta detalhes sob demanda; não precisa carregar o contexto bruto de todos os agentes.

O requisito de que o Orquestrador-Mestre “não pare” deve ser cumprido pelo **serviço de coordenação persistente e pelo estado durável**, não pela dependência de uma única sessão de LLM. O processo pode reiniciar e o modelo de coordenação pode ser substituído; a tarefa não pode perder sua continuidade. Se nenhum modelo ou agente estiver disponível, o Core preserva o estado e mantém a tarefa pausada/aguardando recurso.

### 7.2.2 Líderes de domínio

O Mestre cria um ou mais líderes de acordo com o escopo. Cada líder é responsável por um setor e tem função de coordenação, não de execução direta. Ele deve:

- compreender o escopo e os critérios de seu domínio;
- criar obrigatoriamente um subagente de planejamento;
- revisar e aprovar o plano antes de iniciar implementação ou outra execução operacional relevante;
- dividir o trabalho em unidades atribuíveis;
- criar, atribuir e acompanhar workers;
- resolver dúvidas e pedidos de autorização dentro da autoridade delegada;
- solicitar decisão ao Mestre ou ao usuário quando a questão exceder sua alçada;
- acompanhar critérios, dependências, bloqueios e evidências do setor.

Um líder pode delegar trabalho a vários workers em paralelo quando as tarefas forem independentes e o benefício justificar custo, sincronização e risco. Tarefas densas não devem ser atribuídas automaticamente a um único worker: o planner deve identificar partes separáveis e recomendar múltiplos workers quando isso reduzir risco ou tempo total. Quando as partes não forem independentes — por exemplo, quando disputarem os mesmos arquivos ou decisões — o plano deve prever serialização, worktrees ou uma estratégia explícita de integração.

### 7.2.3 Planejador obrigatório por líder

Todo líder deve criar um subagente de planejamento antes de liberar workers de execução. O planejador analisa o domínio, identifica dependências, riscos, passos, recursos, critérios de aceite, evidências esperadas e possíveis divisões paralelas. Ele não deve iniciar a implementação como parte dessa função.

O líder revisa o plano e registra `PLAN_APPROVED` ou devolve para revisão. **Nenhuma tarefa de implementação daquele domínio começa antes de `PLAN_APPROVED`.** Se o plano for inadequado, contraditório ou inviável, o líder solicita uma nova versão. A aprovação do líder é uma autorização de execução do plano, não uma declaração antecipada de que o resultado final foi aceito. O planner é uma responsabilidade delegada e identificável; a aprovação precisa referenciar a versão exata do plano e os critérios que serão usados para verificar sua execução.

### 7.2.4 Workers e agentes auxiliares

Workers são os agentes que realizam o trabalho: analisar, pesquisar, modificar código, executar testes, preparar deploy, auditar, revisar ou executar outra atividade delimitada. Cada worker recebe metas, escopo, restrições, orçamento e critério de conclusão do líder.

Quando uma tarefa densa exigir apoio, o worker pode criar um agente auxiliar — informalmente, um “estagiário” — para pesquisa arquitetural, descoberta de fontes, inspeção de referências, reprodução de bugs ou análise especializada. O worker principal continua responsável pelo resultado da tarefa; o auxiliar devolve descobertas, referências e evidências, sem alterar silenciosamente o escopo do responsável. Um auxiliar também poderá criar um auxiliar de nível inferior quando isso for necessário e permitido pelo contrato herdado, mantendo a mesma cadeia de responsabilidade e os limites de profundidade, custo e concorrência. O worker pode distribuir pesquisa e análise para auxiliares e concentrar-se no trabalho principal. Ele deve perseguir os critérios recebidos até concluí-los, encontrar bloqueio real, receber cancelamento ou transferir formalmente a continuidade. O encerramento da sessão, do modelo ou do processo não significa que a meta foi atingida. Se o worker pai parar, seus auxiliares não podem ficar órfãos: o líder deve adotá-los, reatribuí-los ou encerrá-los de forma explícita.

Não haverá limite fixo de quantidade de subagentes por líder ou worker. Uma tarefa densa pode ser fragmentada em vários workers; um worker pode criar auxiliares; e um auxiliar poderá criar outro nível de apoio quando isso for necessário, autorizado e justificado. Isso **não** significa criação infinita ou concorrência irrestrita: o Core aplica limites globais e por trabalho de custo, tokens, tempo, processos, concorrência e profundidade, além de prevenir ciclos e delegações redundantes. Quando o orçamento impede nova delegação, a tarefa aguarda, replaneja ou solicita decisão conforme a política.

### 7.2.5 Grill-Me antes da hierarquia

Antes de criar líderes, o pedido passa pelo processo Grill-Me. Uma etapa especializada de esclarecimento interroga o objetivo, expõe premissas, identifica ambiguidades, define exclusões e estabelece critérios que possam comprovar um `TRUE FULL PASS`. O resultado é o Goal Contract. O Orquestrador-Mestre não precisa elaborar o plano: ele recebe o contrato já estruturado e o usa para dimensionar e delegar a hierarquia.

### 7.2.6 Delegação, sincronização e limites

A orquestração deve administrar atribuição, dependências, execução paralela, estados, leases/heartbeats, sincronização, limites de profundidade, prevenção de ciclos, cancelamento, retries, handoff, recuperação e orçamento global/por agente. Não há teto fixo de subagentes por líder ou worker; a expansão é dinâmica e deve ser justificada pelo plano e pelo benefício esperado. Isso não implica concorrência infinita: limites de custo, tokens, tempo, memória, CPU/GPU, processos, profundidade, fan-out e ciclos continuam valendo. O TaskGraph interno é a fonte oficial do estado; sistemas externos podem apoiar especificação e decomposição, mas não criam uma segunda verdade operacional sem reconciliação.

Os líderes podem conceder permissões e resolver dúvidas dos seus workers apenas dentro da autoridade recebida. Um agente não pode aprovar uma ação que ultrapasse a política do projeto, do agente pai ou do usuário. A hierarquia organiza trabalho; não é um mecanismo para contornar controles.

### 7.2.7 Ciclo operacional da hierarquia

O fluxo padrão de responsabilidade será:

1. **Grill-Me / Goal Contract:** esclarecer o pedido e registrar metas, exclusões, restrições e verificadores.
2. **Dimensionamento pelo Mestre:** identificar domínios necessários e criar líderes, sem fixar previamente uma quantidade universal.
3. **Planejamento por domínio:** cada líder cria seu planner, recebe um plano estruturado e decide se ele está pronto para execução.
4. **Aprovação:** o líder registra `PLAN_APPROVED`; se não aprovar, solicita revisão e não libera workers de implementação.
5. **Decomposição e execução:** o líder distribui tarefas a workers; tarefas densas são divididas em partes independentes quando isso reduz risco ou melhora o tempo total.
6. **Apoio sob demanda:** workers podem criar auxiliares para pesquisa/análise, mantendo a responsabilidade pela entrega principal.
7. **Supervisão e sincronização:** líderes atualizam o estado do domínio; o Mestre acompanha o estado global e resolve redistribuições entre domínios.
8. **Verificação:** critérios são avaliados por gates, testes, evidências e revisores designados; falhas geram correção ou replanejamento.
9. **Conclusão:** o trabalho só termina em `TRUE FULL PASS` quando o Goal Contract permite essa conclusão.

A separação de papéis é deliberada: o Mestre coordena; líderes dimensionam e supervisionam; planners elaboram planos; workers executam; auxiliares pesquisam ou analisam; verificadores produzem evidência. Um mesmo agente externo poderá ser usado em papéis diferentes ao longo do tempo, desde que o adaptador suporte o papel e as permissões necessárias. A separação é de responsabilidade e autoridade, não exige um fornecedor/modelo exclusivo por papel.

### 7.2.8 Delegation Contract e responsabilidade por descendentes

Toda criação de líder, planner, worker ou auxiliar deve ser registrada como uma delegação explícita. O agente pai não pode simplesmente iniciar outro agente sem declarar por que ele existe, qual tarefa assume e como seu resultado será avaliado. O **Delegation Contract** deve conter, no mínimo:

- agente pai, agente filho, papel e domínio;
- objetivo, escopo e itens fora de escopo;
- tarefa do TaskGraph e versão do Goal Contract relacionada;
- entradas e referências autorizadas;
- entregáveis esperados e critérios de aceitação;
- permissões herdadas e capacidades habilitadas;
- orçamento de tokens, custo, tempo e recursos;
- dependências, restrições e estratégia de checkpoint;
- evidências exigidas e formato de devolução;
- caminho de escalonamento e condição de encerramento.

O líder é responsável pela árvore de agentes de seu domínio. O worker é responsável por sua tarefa e pelos auxiliares que criou. Se um agente pai parar, o líder responsável reconcilia seus descendentes: adota, reatribui ou cancela cada um. Não pode haver agente ativo sem proprietário, tarefa, contrato, permissões e orçamento conhecidos. A responsabilidade pode ser transferida, mas nunca desaparecer implicitamente.

O planner obrigatório por líder precisa aprovar um plano versionado antes de qualquer worker iniciar implementação no domínio. Auxiliares de pesquisa podem trabalhar em paralelo com atividades não destrutivas de descoberta, desde que não sejam usados para contornar o gate de implementação ou as permissões do pai.

## 7.3 Governed Execution — execução controlada

A execução deve passar por uma autoridade central que compreenda identidade do agente, tarefa, workspace, capacidades autorizadas, política e orçamento.

O runtime deve separar proposta de ação e autorização. Agentes externos podem ter controles próprios, mas o EvolveLoop precisa declarar o que consegue e o que não consegue governar em cada integração.

Capacidades esperadas incluem isolamento, limites de filesystem e rede, controle de processos, gestão de segredos, aprovação de ações sensíveis, cancelamento e trilha de auditoria.

## 7.4 Context Intelligence — memória compartilhada e eficiência contextual

A Context Intelligence fornece uma memória de trabalho comum e persistente, com acesso seletivo por papel. “Compartilhada” significa que todos os níveis conseguem consultar o mesmo estado canônico e publicar atualizações estruturadas; não significa inserir toda a conversa de todos os agentes no contexto de cada modelo.

A memória de trabalho deverá combinar pelo menos sete componentes:

1. **Goal Contract versionado:** objetivo, escopo, restrições e critérios de aceitação.
2. **TaskGraph canônico:** tarefas, dependências, responsáveis, estados, orçamento, bloqueios e resultados.
3. **Event Log:** sequência persistente e auditável de atribuições, decisões, transições, permissões, handoffs e eventos de execução.
4. **Artifacts & Evidence Store:** diffs, arquivos, relatórios, logs resumidos, testes, referências, resultados de ferramentas e evidências verificáveis.
5. **Semantic Index:** índice para recuperar decisões, descobertas, documentos, símbolos e trechos relevantes. `nomic-embed-text` é o modelo de embeddings preferencial inicial para gerar vetores de texto e apoiar recuperação semântica.
6. **Context Views:** projeções filtradas do estado para o Orquestrador-Mestre, líderes, planejadores, workers, auxiliares e revisores.
7. **Agent Registry & Live Status:** inventário canônico de agentes e subagentes, com identidade, papel, agente pai, tarefa atribuída, status, última atividade, heartbeat, checkpoint, orçamento, permissões e descendentes ativos.

O Mestre recebe uma visão compacta: Goal Contract, TaskGraph, agentes ativos, eventos recentes, bloqueios, orçamentos e referências. O líder recebe o estado de seu domínio e de seus workers. O planejador recebe o contrato e o contexto necessário para elaborar o plano. O worker recebe sua meta, tarefa aprovada, critérios, restrições, arquivos/símbolos relevantes e evidências anteriores. O auxiliar recebe uma solicitação estreita de pesquisa/análise e devolve resultado referenciado.

O registry permite que o Mestre e os líderes saibam o que cada agente está fazendo sem polling conversacional constante. Agentes e adaptadores publicam eventos de início, progresso, espera, bloqueio, conclusão, falha e handoff; heartbeats sinalizam que a sessão/processo continua responsivo. A frequência de atualização deve equilibrar frescor e custo. Ausência de heartbeat torna o status `STALE` ou `UNRESPONSIVE`, não autoriza assumir que o trabalho foi concluído.

O Mestre deve conseguir consultar, para qualquer agente ou descendente, ao menos: tarefa atual, objetivo delegado, etapa conhecida, última ação registrada, próximo marco esperado, último checkpoint, bloqueios, orçamento consumido e estado dos auxiliares. Essa visibilidade deve vir do registry, do Event Log e dos checkpoints, não de uma chamada contínua ao LLM nem da replicação de todo o contexto em seu prompt.

A camada deverá combinar:

- recuperação semântica e estrutural, com Nomic Embed Text como opção inicial de embeddings;
- navegação por símbolos, referências e relações de código quando disponível;
- contexto incremental baseado em mudanças;
- filtragem por tarefa, papel e fase;
- orçamento de tokens com reserva para instruções, restrições, evidências e saída;
- memória de sessão, tarefa e projeto com escopos distintos;
- compactação com preservação de decisões, estado e evidências;
- reinjeção seletiva após compactação;
- resumos de ferramentas e logs com referências à fonte;
- cache quando suportado pelo provedor;
- registro do contexto usado, omitido, repetido e recuperado.

O estado canônico deve ser versionado e protegido contra atualizações concorrentes indevidas. Mudanças importantes são registradas como eventos; agentes não devem sobrescrever o progresso uns dos outros com resumos livres. A compactação nunca apaga a fonte original de evidências. Quando houver incerteza, o sistema consulta o artefato original.

**Distinção obrigatória:** `nomic-embed-text` gera embeddings; não é um modelo conversacional nem um seletor de modelos. A seleção estruturada pertence ao decision model e às regras do Core.

## 7.5 Intelligent Model & Agent Routing — seleção de recursos

O EvolveLoop utilizará um decision model no estilo Jev para classificar tarefas e selecionar o modelo, agente ou provedor mais adequado. A direção aceita é oferecer **Jev via OpenRouter** e uma alternativa local compatível com o padrão de decisões Jev, por meio do Ollama. A seleção poderá ser acionada ao criar líderes, planners, workers/auxiliares, reatribuir tarefas, selecionar ferramentas ou escolher entre rotas elegíveis. Não se deve invocar um decision model para toda microdecisão interna de um agente: decisões de fluxo simples, validações e estados previsíveis pertencem ao Core determinístico ou ao próprio agente. O decision model é reservado a escolhas discretas entre alternativas relevantes, quando a classificação estruturada puder melhorar a seleção.

O roteador considera:

- descrição e tipo da tarefa;
- papel do agente (líder, planner, worker, auxiliar ou reviewer);
- capacidades exigidas e formatos/protocolos suportados;
- contexto e janela disponível;
- limites de tokens, quotas, latência e disponibilidade;
- qualidade observada em tarefas semelhantes;
- custo financeiro e consumo esperado;
- hardware local disponível;
- privacidade, localização dos dados e consentimento;
- permissões, limites e orçamento da execução.

O registry de recursos fornece fatos e metadados dos candidatos — janela de contexto, capacidade de ferramenta/MCP, suporte a terminal, limites, preço, disponibilidade, latência, modalidade, memória exigida e histórico de desempenho. O decision model recebe a tarefa e a lista de candidatos elegíveis e retorna uma escolha estruturada ou uma recomendação de que nenhum candidato atende. A decisão passa por validação determinística: políticas, permissões, orçamento, disponibilidade e compatibilidade são hard constraints; o decision model não pode escolher um recurso que falhe nessas condições.

### 7.5.1 Jev remoto e modelos Jev-style locais

Jev é um decision model estruturado de TypeSafe, acessível via OpenRouter. Ollama suporta modelos de decisão no estilo Jev por uma API própria (`/v1/systemone`), incluindo opções como Nimble e Tev1. Esses modelos locais são alternativas inspiradas/compatíveis com o padrão de decisão; não devem ser chamados de “Jev local” como se fossem o mesmo modelo. A família e o modelo local preferencial serão escolhidos por benchmark de precisão, latência, consumo de memória e qualidade de roteamento.

### 7.5.2 Papel de cada componente

- **Jev / decision model local:** classificar, comparar candidatos e recomendar uma rota em formato estruturado.
- **OmniRoute:** disponibilizar/rotear provedores de inferência locais, gratuitos e pagos, conforme catálogo, chaves e disponibilidade. Modelos gratuitos podem ter quotas, rate limits, indisponibilidade ou restrições; não são capacidade garantida.
- **Nomic Embed Text:** gerar embeddings para recuperar memória e contexto semanticamente relevante.
- **Core determinístico:** validar candidatos, aplicar políticas, impor limites, manter estados, gerir retry/fallback e impedir decisões incompatíveis.

O decision model não é a autoridade de segurança, não aprova ações de alto risco e não substitui as máquinas de estado do runtime. Decisões abertas de engenharia pertencem aos planners e workers; escolhas discretas de recursos/rotas podem ser encaminhadas ao decision model. Em caso de baixa confiança, ausência de candidatos ou indisponibilidade, o sistema usa fallback determinístico, tenta outra rota permitida ou pausa a tarefa com motivo claro. O uso de Jev remoto ou qualquer modelo remoto deve respeitar a política de privacidade e o consentimento do usuário.

## 7.6 Verification & Evidence — verificação do resultado

A conclusão deverá ser baseada em evidências como:

- diff e arquivos alterados;
- execução de testes e seus resultados;
- lint, typecheck, build e outras verificações pertinentes;
- revisão independente;
- análise de segurança quando aplicável;
- critérios de aceitação satisfeitos;
- limitações, falhas e verificações não executadas.

Uma tarefa poderá terminar como concluída, parcialmente concluída, bloqueada ou falha. O sistema não deve mascarar ausência de evidência como sucesso. Para um trabalho com Goal Contract, o status global `TRUE FULL PASS` exige que todos os critérios obrigatórios aplicáveis estejam em `PASS`, com evidências suficientes; nenhum `FAIL` ou `BLOCKED` pode ser tratado como conclusão.

## 7.7 Memory, Persistence & Recovery — continuidade

A V3 deve preservar sessões, tarefas, decisões, tentativas, checkpoints, evidências, estado dos processos e metadados de execução. Memória de conversa, memória semântica do projeto, estado canônico do trabalho, contexto compartilhado e checkpoint de execução são conceitos distintos, com garantias e ciclos de vida próprios.

A fonte de verdade é o estado persistido do EvolveLoop — Goal Contract, TaskGraph, Event Log e artefatos —, não a janela de contexto de um modelo. A recuperação precisa restaurar o que é necessário sem reenviar todo o histórico. O Orquestrador-Mestre deve conseguir consultar a situação de cada agente e subagente por atualizações estruturadas e eventos, inclusive quando o agente original não estiver mais disponível.

### 7.7.1 Shared Work Memory / Project Blackboard

A memória compartilhada é o espaço de estado comum onde os agentes publicam progresso, resultados, artefatos, decisões e bloqueios. Deve ser estruturada, consultável e versionada; não é um chat coletivo sem controle. Cada registro precisa indicar origem (agente/ferramenta), tarefa, timestamp, versão e relação com critérios do Goal Contract.

O Core combina um registro de eventos append-only com projeções atuais de estado. Isso permite reconstruir o estado após crash, comparar atualizações e evitar que um resumo novo apague fatos ou evidências anteriores. A memória semântica acelera a recuperação, mas não substitui registros canônicos e artefatos originais.

### 7.7.2 Coordinator Service e modelo sempre substituível

A exigência de um Orquestrador-Mestre sempre disponível não pode depender de uma única conversa ou de um único modelo carregado. O serviço de coordenação persistente é responsável por manter scheduler, estado, eventos, registry, leases, checkpoints e fila de trabalho. O modelo que auxilia o Mestre a interpretar situações pode ser local ou remoto e substituível. Se o modelo atingir limites ou falhar, o serviço mantém a tarefa e seleciona outro recurso quando permitido. “O Mestre não pode parar” significa que o controle e o estado não podem desaparecer com uma sessão de LLM; não significa manter um modelo específico ativo, infinito ou imune a falhas.

A continuidade prometida cobre o encerramento da TUI e dos terminais visíveis. Continuidade durante logout, suspensão, reboot ou desligamento depende do comportamento do sistema operacional e da política configurada; uma máquina desligada não executa trabalho. O estado deve sobreviver a reinicializações para retomada posterior.

### 7.8 Continuidade, handoff e recuperação de agentes

Atingir limite de contexto, quota, saldo, rate limit, timeout, desconexão, expiração de sessão ou falha de processo não deverá encerrar automaticamente a tarefa. O sistema deve detectar sinais de limite quando possível, persistir checkpoints antes da interrupção, classificar a causa e permitir que o líder ou o Mestre entregue a continuidade a outro agente elegível. Se não houver substituto, a tarefa permanece persistida e pausada, aguardando recurso ou decisão; não é descartada nem marcada como concluída.

O limite de um modelo é um evento do **agente/sessão**, não um estado terminal do trabalho. Quando houver telemetria suficiente, a troca deve ser preventiva, antes de esgotar contexto ou quota; quando o limite for inesperado, a recuperação ocorre a partir do último checkpoint durável. O worker original passa a `LIMIT_REACHED`, `FAILED` ou `YIELDING`, conforme a causa; a tarefa mantém seu próprio estado e pode receber outro worker. O líder valida o Handoff Package e atribui a continuidade. O Mestre só intervém quando a troca atravessa domínios, excede autoridade ou requer redistribuição global.

Estados de agente propostos, separados dos estados de tarefa: `INITIALIZING`, `ACTIVE`, `WAITING`, `YIELDING`, `LIMIT_REACHED`, `FAILED`, `STALE`, `ORPHANED`, `REPLACED`, `COMPLETED` e `CANCELLED`. `STALE` indica ausência de atualização/heartbeat dentro da janela definida; `ORPHANED` indica que o agente perdeu o responsável pai e precisa ser adotado, reatribuído ou encerrado. Uma transição de agente não deve, por si só, mudar uma tarefa de `IN_PROGRESS` para `COMPLETED`. O histórico de cada transição deve permanecer auditável.

O ciclo de handoff deverá seguir esta sequência: (1) detectar ou receber o evento de interrupção; (2) registrar evento e checkpoint; (3) identificar o último limite de progresso verificado; (4) reunir plano aprovado, decisões, artefatos, evidências e estado de dependências; (5) procurar agente substituto compatível com tarefa, orçamento e permissões herdadas; (6) entregar uma visão contextual compacta ao substituto; (7) reconciliar o estado e continuar do último ponto seguro; (8) verificar qualquer resultado cuja integridade não possa ser garantida. O sistema não deve reenviar todo o histórico nem repetir etapas já comprovadas apenas porque mudou o agente.

O **Handoff Package** deve permitir que o substituto continue sem reconstruir todo o histórico. Deve conter:

- Goal Contract e critério de aceitação da tarefa;
- identificadores, estado e dependências da tarefa;
- linhagem de delegação, agente pai, filhos e auxiliares ativos, seus proprietários e estados;
- plano aprovado e tarefas/subtarefas concluídas, em andamento e pendentes;
- resumo do progresso e decisões registradas;
- arquivos, símbolos, diffs, branches ou worktrees envolvidos;
- comandos executados e resultados relevantes;
- testes, evidências e falhas conhecidas;
- bloqueios, riscos, hipóteses e perguntas não resolvidas;
- permissões, orçamento e limites herdados;
- estado de sessões, terminais e processos quando o adaptador permitir reanexação;
- versão do checkpoint, timestamp e proveniência dos dados.

O substituto deve partir do progresso verificado. Não deve repetir trabalho concluído sem justificativa. Se uma ação estava em andamento e seu resultado é incerto, o sistema deve reconciliar o estado do workspace/serviço antes de repeti-la; progresso não verificado pode precisar ser reexecutado, mas isso deve ser explícito. O sistema deve prevenir escrita concorrente na mesma área de trabalho sem coordenação, usando leases, locks, fencing tokens, worktrees ou mecanismo equivalente. Operações repetíveis devem ser idempotentes sempre que possível. O handoff transfere decisões registradas, estado, artefatos e evidências — não depende de copiar todo o raciocínio privado ou o histórico bruto do modelo.

**Invariante de continuidade:** o estado de vida de um agente e o estado de uma tarefa são máquinas de estado distintas. Um agente pode terminar, falhar, atingir limite ou ser substituído enquanto a tarefa continua `IN_PROGRESS`. A tarefa só muda de estado conforme seus critérios, bloqueios, cancelamento explícito ou resultado verificado; nunca apenas porque uma sessão terminou.

#### 7.8.1 Recuperação de subárvores e agentes auxiliares

A hierarquia pode conter auxiliares em mais de um nível. A falha ou o limite de um agente pai deve disparar a reconciliação de todos os descendentes registrados. Cada descendente deverá ser adotado pelo líder responsável, reatribuído a outro worker ou cancelado com estado e motivo registrados. Um descendente só poderá continuar executando enquanto sua tarefa, autoridade, orçamento e responsável substituto estiverem válidos. Não se permite agente ativo sem proprietário, contrato de delegação, tarefa associada e orçamento. Se um auxiliar já concluiu uma pesquisa útil, seu artefato permanece disponível mesmo que o worker pai tenha sido substituído.

### 7.8.2 Contrato de delegação

Toda delegação cria um **Delegation Contract** associado ao Goal Contract e ao TaskGraph. O contrato identifica quem delega e quem recebe, o objetivo delimitado, entradas e referências autorizadas, entregáveis esperados, critérios de aceitação, prazo/limite de tempo, orçamento, permissões herdadas, dependências, estratégia de checkpoint, restrições e caminho de escalonamento. A conclusão do subagente deve devolver status, artefatos e evidências; não basta uma mensagem textual dizendo que terminou. Agentes auxiliares recebem escopo menor e não podem assumir silenciosamente a responsabilidade do worker principal.

O contrato também registra a linhagem de delegação (`parent_agent_id`, `child_agent_id`, tarefa e domínio), os agentes auxiliares criados, os recursos consumidos e o estado de cada descendente. Isso permite ao líder recuperar a árvore de agentes quando um processo pai falha, sem perder o trabalho concluído por seus filhos.

## 7.9 Goal Contract e True Full Pass

O documento de metas do trabalho será chamado **Goal Contract**. Ele consolida objetivo, escopo, itens fora de escopo, requisitos funcionais e não funcionais, restrições, dependências, riscos e critérios verificáveis de aceitação. O Grill-Me é o processo padrão para refinar o pedido antes da criação dos líderes, com profundidade configurável conforme complexidade e risco.

Os estados devem existir em níveis diferentes, para não confundir progresso parcial com sucesso:

| Nível | Estado | Significado |
|---|---|---|
| Critério | `NOT_STARTED` | Ainda não avaliado. |
| Critério | `IN_PROGRESS` | Em execução ou verificação. |
| Critério | `PASS` | Critério verificado com evidência suficiente. |
| Critério | `FAIL` / `NOT_PASS` | Critério não foi atendido. |
| Critério | `BLOCKED` | Não pode ser concluído/verificado por impedimento registrado. |
| Critério | `NOT_APPLICABLE` | Não se aplica, com justificativa registrada e permitida pelo contrato. |
| Tarefa | `PARTIAL_PASS` | Parte dos critérios passou; ainda não é conclusão. |
| Tarefa | `TRUE_PASS` | Todos os critérios obrigatórios da tarefa passaram. |
| Trabalho | `TRUE_FULL_PASS` | Todos os critérios obrigatórios aplicáveis do Goal Contract passaram com evidências suficientes. |

`PARTIAL_PASS` nunca deve ser apresentado como conclusão. `BLOCKED` não é sucesso. `NOT_APPLICABLE` requer justificativa e não pode ser usado apenas para remover um critério difícil. O estado global `TRUE_FULL_PASS` só pode ser emitido quando todos os critérios obrigatórios aplicáveis tiverem status `PASS` ou uma condição `NOT_APPLICABLE` válida, e não houver `FAIL`, `BLOCKED` ou pendências.

O Orquestrador-Mestre não avalia subjetivamente se a entrega ficou boa. Ele consulta estados de verificação e evidências emitidos por gates determinísticos, testes e agentes revisores designados. A aprovação de um líder libera a execução de um plano; não substitui a verificação independente do resultado.

---

# 8. Ecossistema de agentes, modelos e ferramentas

## 8.1 Três categorias de integração

A V3 não deve tratar todo recurso externo como a mesma coisa.

**Agentes / harnesses:** ambientes que podem possuir seu próprio loop, ferramentas, sessões, contexto, permissões e execução. Exemplos desejados: Claude Code, Codex, Cursor e Antigravity.

**Modelos / backends de inferência:** serviços ou runtimes que oferecem inferência diretamente. Exemplo prioritário: Ollama para modelos locais; outros provedores poderão ser conectados pelo usuário.

**Ferramentas especializadas:** capacidades de pesquisa, compreensão de código, especificação, decomposição, segurança, edição ou validação. Exemplos discutidos: Ponytail, GitHub Spec Kit, Task Master, Serena, Understand e recursos da Trail of Bits.

## 8.2 Agentes e provedores desejados

As quatro integrações de agentes priorizadas para a primeira janela de compatibilidade são **Cursor, Claude Code, Antigravity e Codex**. O EvolveLoop deverá conseguir atribuir papéis de líder, planner, worker, auxiliar e reviewer a agentes adequados, conforme suas capacidades. O suporte será descrito por capacidades reais — sessões, streaming, ferramentas, terminal, MCP, criação de subagentes, cancelamento, retomada, permissões e telemetria — porque nenhum adaptador deve presumir que todos os agentes externos oferecem os mesmos controles.

| Recurso | Categoria | Papel pretendido | Estado nesta definição |
|---|---|---|---|
| Cursor | Agente/harness | Execução e coordenação de tarefas de engenharia | Prioridade inicial; capacidades a validar |
| Claude Code | Agente/harness | Execução de tarefas de engenharia | Prioridade inicial; capacidades a validar |
| Antigravity | Agente/harness | Execução e delegação de tarefas | Prioridade inicial; capacidades a validar |
| Codex | Agente/harness | Implementação, análise e execução | Prioridade inicial; capacidades a validar |
| Ollama | Runtime de modelos | Inferência local, embeddings e decision models Jev-style | Caminho local prioritário; perfil de modelo depende do hardware |
| Jev via OpenRouter | Decision model | Classificação e seleção estruturada de recursos | Opção remota explícita, sujeita à política de privacidade e custo |
| Nimble / Tev1 via Ollama | Decision models Jev-style | Seleção e classificação local | Candidatos locais a comparar; não são o Jev original |
| Nomic Embed Text | Modelo de embeddings | Recuperação semântica de memória e contexto | Opção de embeddings preferencial inicial; não faz roteamento |
| OmniRoute | Gateway/agregador de provedores | Acesso unificado a provedores locais, gratuitos e pagos, com roteamento/fallback | Integração candidata; disponibilidade, limites e termos dependem dos upstreams |
| Outros provedores | Backend de inferência | Alternativas configuráveis pelo usuário | Extensibilidade requerida |

## 8.3 Ferramentas especializadas consideradas

| Ferramenta | Papel candidato | Questão de integração a resolver |
|---|---|---|
| Ponytail | Apoio à qualidade e eficiência do trabalho de engenharia | Delimitar exatamente quais capacidades serão consumidas e como medir benefício |
| GitHub Spec Kit | Especificação e artefatos de planejamento | Evitar duplicação com planejamento e TaskGraph internos |
| Task Master | Decomposição, organização e acompanhamento de tarefas | Definir como sincronizar sem criar uma segunda fonte de verdade |
| Serena | Navegação e interação semântica com código | Identificar capacidades, protocolo e limites por linguagem |
| Understand | Análise estrutural de código e relações | Validar disponibilidade, licença, ambiente e valor sobre alternativas |
| Trail of Bits | Práticas e ferramentas especializadas de segurança | Selecionar recursos aplicáveis, licenças e critérios de acionamento |

Essas ferramentas são capacidades desejadas para o ecossistema, integradas conforme necessidade por adaptadores e sem se tornarem dependências obrigatórias do Core. A seleção deverá considerar qualidade, custo, segurança, licença, compatibilidade e manutenção.

## 8.4 Estratégia de compatibilidade

A proposta é aceitar diferentes mecanismos de integração conforme as capacidades reais do recurso: protocolos padronizados, SDKs/APIs oficiais, MCP, CLI e adaptadores específicos.

Uma integração não deve ser considerada equivalente a outra só porque ambas aceitam uma instrução. O contrato de cada adaptador deverá declarar suporte a capacidades como:

- envio de instruções e contexto;
- streaming de eventos;
- sessões e retomada;
- execução de ferramentas;
- controle de permissões e aprovações;
- cancelamento;
- execução paralela;
- leitura de uso, custo e tokens;
- acesso ao workspace;
- obtenção de resultados e evidências.

### Níveis de compatibilidade propostos

| Nível | Significado |
|---|---|
| Certificado | Integração testada com matriz de capacidades, falhas e versões suportadas |
| Compatível | Integração funcional via protocolo ou interface conhecida, com limitações publicadas |
| Experimental | Integração em avaliação; comportamento e estabilidade não garantidos |
| Não suportado | Sem contrato ou validação suficiente |

“Suportar tudo” deve significar uma arquitetura aberta e uma expansão contínua do catálogo, não uma promessa de integração perfeita com todo agente existente ou futuro.

---

# 9. Local-first e disponibilidade sem conexão externa

## 9.1 Princípio

Nenhuma conta externa ou chave de API deverá ser requisito para iniciar o EvolveLoop e utilizar o caminho local. O EvolveLoop deverá também oferecer descoberta de opções gratuitas via provedores/gateways como OmniRoute, incluindo modelos de fornecedores como DeepSeek e Kimi quando estiverem disponíveis no catálogo escolhido, sem prometer disponibilidade permanente, ausência de rate limits ou ausência de cadastro. O OmniRoute será uma opção de agregação/roteamento, não uma garantia de quota gratuita própria: autenticação, limites, termos e disponibilidade continuam vinculados a cada provedor upstream.

## 9.2 Experiência sem provedores conectados

Quando o usuário não conectar agentes ou provedores remotos, o EvolveLoop deverá:

1. detectar os runtimes locais disponíveis;
2. informar os requisitos de hardware e os modelos encontrados;
3. apresentar opções locais adequadas ao perfil da máquina;
4. permitir baixar modelos somente com consentimento e informação de tamanho;
5. configurar um perfil local mínimo para classificação, planejamento e execução dentro das capacidades disponíveis;
6. informar claramente limitações, latência estimada e qualidade esperada;
7. continuar funcional sem enviar código ou contexto para terceiros.

## 9.3 O que “gratuito” significa

A V3 poderá oferecer um caminho sem cobrança por API ao utilizar recursos locais. Isso não significa custo zero: há consumo de hardware, energia, armazenamento e tempo. Modelos e serviços remotos gratuitos podem existir como opções, mas limites, privacidade e disponibilidade variam e não devem ser prometidos como garantia do produto.

## 9.4 Privacidade e consentimento

Por padrão, código, prompts, arquivos, logs, histórico e telemetria permanecem locais. Nada será compartilhado automaticamente. Exceções: operações externas explicitamente solicitadas pelo usuário, como ações no GitHub, e chamadas a provedores remotos que o próprio usuário habilitou. A habilitação de um provedor remoto constitui autorização para enviar a esse provedor os dados estritamente necessários àquela inferência; a interface deverá identificar o destino e oferecer preferência de contexto local/remoção de dados sensíveis quando possível. Não haverá telemetria de produto enviada por padrão.

## 9.5 Perfil local de referência

O perfil de hardware de referência para orientar recomendações locais será uma máquina com aproximadamente **8 GB de VRAM**. Para o modelo de coordenação, a janela de contexto desejada como ponto de partida é **32k tokens**, configurável pelo usuário e limitada pelo modelo escolhido. A preferência é manter o modelo integralmente na VRAM quando viável, para reduzir latência; quando houver offload para RAM/CPU, o EvolveLoop deve informar esse estado e suas implicações.

Esses valores são um perfil de referência para experimentação, não requisito mínimo universal nem garantia de que qualquer modelo caiba na memória. Modelos, quantização, contexto, RAM e offload alteram o consumo. O usuário poderá selecionar outro perfil, modelo e janela conforme a própria máquina. O serviço de coordenação persistente continua funcionando mesmo quando o modelo de coordenação é trocado, descarregado ou fica indisponível.

---

# 10. Eficiência extrema de tokens e recursos

## 10.1 Objetivo

Reduzir o consumo total necessário para concluir uma tarefa verificada, mantendo qualidade, segurança e confiabilidade. O foco não é minimizar tokens isoladamente, mas reduzir desperdício e custo total por resultado útil.

## 10.2 Estratégias de produto

| Estratégia | Resultado esperado |
|---|---|
| Recuperação sob demanda | Evitar carregar o repositório ou histórico inteiro |
| Contexto por tarefa | Evitar transferir informações irrelevantes entre agentes |
| Navegação semântica/estrutural | Localizar símbolos, referências e relações com menos leitura bruta |
| Context budgeting | Reservar espaço para instruções, evidências e saída útil |
| Memória estruturada | Reutilizar decisões e descobertas sem repetir conversas |
| Compactação verificável | Reduzir histórico preservando fatos e decisões necessários |
| Saídas estruturadas e concisas | Evitar logs e resultados extensos quando um resumo com referências basta |
| Cache | Reutilizar prefixos e contexto quando o backend permitir |
| Roteamento de modelos | Usar o recurso menos custoso que atenda aos requisitos de qualidade |
| Delegação criteriosa | Evitar agentes redundantes, paralelismo improdutivo e duplicação de contexto |
| Encerramento antecipado | Interromper ciclos sem progresso ou sem benefício esperado |

## 10.3 Métrica principal

**Tokens totais por tarefa verificada**, discriminados por tokens de entrada, saída, cache, modelo, agente e etapa do workflow.

A métrica deverá ser acompanhada de custo financeiro, tempo, número de chamadas, taxa de retrabalho, qualidade e intervenção humana. Quando um provedor não expuser uso real, o valor deve ser marcado como estimado ou desconhecido — nunca apresentado como medição exata.

## 10.4 Regra de não regressão

Uma otimização só será aceita se reduzir custo ou consumo sem degradar materialmente a qualidade, a segurança ou a taxa de conclusão verificada. Compressão que remove restrições importantes, cache que reutiliza contexto obsoleto ou roteamento que escolhe um modelo inadequado não são otimizações válidas.

## 10.5 Benchmark controlado

As comparações deverão usar tarefas equivalentes, mesmo workspace, mesmas condições relevantes e critérios de avaliação constantes. Resultados serão separados por classe de tarefa e perfil de hardware/provedor. Não se deve comparar simplesmente o número bruto de tokens entre modelos com qualidade ou formatos de contabilização diferentes.

---

# 11. Segurança, governança e confiança

A autonomia da plataforma depende de limites verificáveis. Segurança não é uma configuração avançada opcional.

## 11.1 Requisitos de governança

- princípio do menor privilégio;
- autorização explícita para operações sensíveis;
- isolamento de workspace e de projetos;
- contenção de caminhos com atenção a links simbólicos e condições de corrida;
- sandbox ou isolamento de processo para execução de código não confiável;
- limites de CPU, memória, tempo, rede e processos quando aplicável;
- gestão de segredos fora do contexto dos modelos sempre que possível;
- registro de ações, aprovações, erros e identidades;
- cancelamento e encerramento efetivos;
- comportamento fail-closed quando autoridade ou política estiver ausente;
- transparência sobre controles que um agente externo não permite ao EvolveLoop impor.

## 11.2 Baseline de autonomia e capacidades configuráveis

Leitura, criação e edição de arquivos dentro do workspace autorizado são capacidades básicas permanentes dos agentes; não serão opções desativáveis no perfil comum. Os limites do workspace e a proteção de arquivos externos ao projeto continuam obrigatórios.

A plataforma deve disponibilizar aos agentes, conforme configuração e suporte do adaptador, terminal/processos, MCPs, ferramentas, acesso a provedores, pesquisa, criação de subagentes e outras capacidades. O usuário poderá habilitar ou restringir essas capacidades por projeto, agente, domínio e tarefa. O modo de autonomia poderá ser amplo, mas não permite a um agente ou subagente ampliar sua autoridade por conta própria.

Os líderes podem responder a dúvidas e pedidos de permissão dos workers sem interromper o usuário quando a ação estiver dentro da autoridade delegada. Questões que excedam essa autoridade sobem ao Mestre ou ao usuário, conforme a política. Operações sensíveis, externas, destrutivas ou irreversíveis seguem os gates definidos, mesmo em modo autônomo.

## 11.3 Limites de responsabilidade

O EvolveLoop não deve afirmar que controla completamente uma ferramenta externa quando ela executa ações fora do alcance de suas políticas. Essas limitações devem aparecer na matriz de capacidades e na interface antes da execução.

---

# 12. Observabilidade e transparência operacional

A plataforma deve oferecer uma visão unificada de:

- objetivo e estado geral do trabalho;
- tarefas, dependências e bloqueios;
- agentes e modelos selecionados;
- justificativa do roteamento;
- chamadas e uso de tokens;
- custo estimado ou real;
- tempo de execução e espera;
- ferramentas utilizadas;
- permissões solicitadas e concedidas;
- alterações no workspace;
- testes e evidências;
- tentativas, falhas, retries e replanejamentos.

A observabilidade precisa ser útil sem gerar mais contexto e custo do que o trabalho observado. Logs detalhados podem ser persistidos localmente, enquanto o contexto enviado aos agentes deve receber apenas resumos e referências relevantes.

---

# 13. Metas e critérios de sucesso

As metas abaixo são propostas iniciais. Onde não existe baseline confiável, a V3 deverá medir primeiro e calibrar metas sem esconder os resultados. Os valores de desempenho não substituem os gates de segurança e qualidade.

## 13.1 North Star Metric

**Custo total por tarefa concluída e verificada.**

O custo total deve combinar tokens/custo financeiro quando disponível, tempo de execução e esforço humano. A métrica será reportada em conjunto com taxa de sucesso e qualidade, para evitar otimizações que apenas transferem o trabalho de volta ao usuário.

## 13.2 Métricas principais

| Dimensão | Métrica | Critério proposto |
|---|---|---|
| Resultado | Taxa de conclusão verificada | Não inferior ao baseline de referência; evolução positiva por classe de tarefa |
| Qualidade | Regressões introduzidas e critérios de aceitação satisfeitos | Nenhuma redução de qualidade aceita como contrapartida automática de menor custo |
| Eficiência | Tokens por tarefa verificada | Meta inicial: redução mediana de pelo menos 30% frente ao baseline ingênuo, sem regressão material de qualidade |
| Custo | Custo financeiro por tarefa verificada | Medir por provedor e classe; buscar redução sem deslocar custo oculto ao usuário |
| Contexto | Contexto repetido entre etapas | Queda mensurável após ativação de memória, retrieval e compaction |
| Roteamento | Seleção adequada do recurso | Medir qualidade da escolha contra avaliação de referência; registrar fallback e erro de roteamento |
| Orquestração | Tarefas concluídas sem intervenção desnecessária | Aumentar sem permitir que autonomia ultrapasse políticas |
| Continuidade | Handoff Recovery Rate | Percentual de tarefas recuperadas após limite/falha de agente sem perda de progresso verificado |
| Continuidade | Duplicated Work Ratio | Reduzir repetição de etapas já concluídas sem justificativa |
| Continuidade | Lost Verified Work | Zero perda de progresso previamente verificado em falhas recuperáveis |
| Recuperação | Retomada após interrupção | Restaurar estado de trabalho e evitar repetição indevida de tarefas concluídas |
| Segurança | Violações de política | Zero violações conhecidas nos testes de conformidade; bloqueio de ações não autorizadas |
| Transparência | Uso e limitações reportados | Métricas identificadas como reais, estimadas ou indisponíveis; nenhuma precisão inventada |
| Interoperabilidade | Integrações validadas | Matriz de capacidades publicada e testada para cada integração certificada |

**Nota sobre a meta de 30%:** é uma meta inicial de produto para experimentação, não um resultado já obtido nem uma garantia. Deve ser validada em benchmark pareado. O benchmark precisa estabelecer uma referência ingênua e uma referência otimizada manualmente, para não premiar uma linha de base artificialmente ruim.

## 13.3 Critérios de sucesso por pilar

### CLI e experiência

- O usuário consegue iniciar, planejar, executar, inspecionar e retomar um trabalho sem depender de interface web.
- O estado de tarefas e agentes é compreensível sem exigir leitura de logs brutos.
- Aprovações, bloqueios e falhas são visíveis e acionáveis.

### Inteligência e planejamento

- O Grill-Me refina o objetivo antes da execução, em intensidade proporcional à complexidade.
- O Goal Contract define critérios verificáveis e exclusões.
- O trabalho só recebe TRUE FULL PASS quando todos os critérios obrigatórios aplicáveis passam com evidências.
- Objetivos são convertidos em tarefas estruturadas com dependências e critérios de aceitação.
- Planos inválidos, contraditórios ou sem recursos elegíveis são identificados antes da execução.
- O sistema distingue fatos observados, suposições e informações ausentes.

### Hierarquia e separação de responsabilidades

- O Orquestrador-Mestre coordena e delega, sem executar diretamente código ou tarefas de worker.
- Cada líder possui um planner obrigatório e nenhum worker de implementação começa antes da aprovação do plano.
- Workers podem criar auxiliares de pesquisa/análise conforme necessidade e orçamento.
- O número de agentes é dinâmico, sem teto fixo por líder ou worker, mas respeita limites globais de recursos, profundidade, fan-out e concorrência.
- Estados compartilhados e o Agent Registry mantêm papel, proprietário, tarefa, status, última atividade/heartbeat e checkpoint de todos os agentes ativos, sem copiar todo o histórico para cada contexto.
- O status exibido distingue agente ativo, aguardando, com atualização atrasada, limite atingido, falha e substituição; não infere conclusão a partir do silêncio.
- Toda delegação possui Delegation Contract, critérios, orçamento, autoridade herdada e uma relação pai/filho rastreável.
- A perda de um worker pai ou líder não deixa descendentes ativos sem proprietário; a hierarquia é reconciliada, adotada, reatribuída ou encerrada explicitamente.
- Líderes não aprovam o próprio resultado final sem evidências independentes exigidas pelo Goal Contract.

### Orquestração e continuidade

- Tarefas podem ser delegadas e retomadas com estado consistente.
- Limites de contexto, quotas, rate limits, desconexões e falhas de agentes não descartam o trabalho.
- O supervisor consegue reconstruir onde um agente parou e entregar um Handoff Package a outro agente elegível, incluindo sua linhagem e auxiliares ativos.
- Limite de tokens/quota muda o estado do agente, não encerra o estado da tarefa.
- Um agente substituto continua do último checkpoint durável e respeita o progresso verificado.
- Dependências, falhas e cancelamentos não deixam o grafo em estado ambíguo.
- Não há perda de trabalho previamente verificado em cenários recuperáveis.
- Paralelismo é limitado por orçamento e não causa conflito não tratado no workspace.

### Interoperabilidade

- O usuário consegue operar com pelo menos um caminho local e integrar provedores externos opcionais.
- Cada integração certificada tem matriz de capacidades, versões e limitações documentadas.
- A indisponibilidade de uma integração não derruba o Core nem invalida o estado da tarefa.

### Local-first

- É possível iniciar sem chave de API ou conta externa.
- O usuário sabe quais operações são locais e quais enviam dados externamente.
- Requisitos de hardware e limitações dos modelos locais são informados com clareza.

### Eficiência

- O benchmark mede tokens, custo, tempo e qualidade por tarefa.
- A compactação e a memória preservam restrições e decisões necessárias para continuidade.
- Roteamento e delegação reduzem custo total sem piorar a taxa de conclusão verificada.

### Segurança

- A ausência de política não concede autoridade irrestrita.
- Ações sensíveis são bloqueadas ou aprovadas conforme política.
- O sistema declara limitações de controle sobre agentes externos.
- Execuções de código não confiável não dependem apenas de instruções de prompt para contenção.

## 13.4 Critérios de lançamento de uma versão estável

Uma versão estável da V3 não deverá ser declarada apenas porque os comandos principais funcionam. Ela deverá cumprir, no mínimo:

1. fluxo completo objetivo → plano → execução → evidência → resultado;
2. persistência e retomada de sessões;
3. caminho local utilizável sem provedor remoto;
4. políticas e permissões aplicadas de forma consistente;
5. matriz de capacidades para cada agente/provedor certificado;
6. benchmark reproduzível de qualidade e eficiência;
7. métricas de consumo e limitações claramente identificadas;
8. documentação de riscos, limitações e recuperação;
9. ausência de falhas críticas conhecidas nos gates de segurança definidos;
10. continuidade hierárquica testada: interrupção de um worker e de um líder com descendentes ativos não produz agentes órfãos nem perde progresso verificado;
11. processo de atualização e compatibilidade documentado.

---

# 14. Não objetivos e limites explícitos

Para preservar foco, a V3 não pretende:

- substituir Claude Code, Codex, Cursor, Antigravity ou todos os agentes externos;
- criar um modelo fundacional próprio;
- garantir que um modelo local tenha a qualidade de um modelo remoto de ponta;
- oferecer recursos computacionais gratuitos;
- prometer integração perfeita com qualquer agente, ferramenta ou protocolo;
- executar qualquer ação sem limites ou supervisão;
- tratar a resposta de um LLM como evidência de sucesso;
- paralelizar tarefas apenas para aumentar a quantidade de agentes;
- reimplementar obrigatoriamente recursos maduros de ferramentas especializadas;
- expandir inicialmente para uma plataforma universal de automação fora do foco de engenharia de software.

---

# 15. Roadmap conceitual por resultados

O roadmap define capacidades e resultados, não tarefas de código. A ordem poderá ser refinada após a auditoria da V2, mas a hierarquia e a continuidade são parte da identidade da V3, não melhorias periféricas.

## V3.0 — Fundação persistente e Goal Contract

**Objetivo:** estabelecer CLI/TUI interativa e não interativa, Core em background, estado durável, Grill-Me, Goal Contract, TaskGraph, Event Log, orçamento e fluxo de execução verificável.

**Resultado esperado:** fechar a TUI/terminais não mata o trabalho; o usuário consegue consultar e retomar o estado; a conclusão é baseada em critérios e evidências.

**Gate:** persistência após falha recuperável, políticas aplicadas e um fluxo de ponta a ponta funcional.

## V3.1 — Hierarquia e interoperabilidade

**Objetivo:** introduzir Orquestrador-Mestre, líderes de domínio, planner obrigatório, workers, agentes auxiliares e adaptadores para Cursor, Claude Code, Antigravity e Codex.

**Resultado esperado:** o Mestre apenas coordena; cada líder aprova um plano antes de executar; workers realizam trabalho; estado compartilhado permite handoff.

**Gate:** provar a hierarquia em um projeto real e demonstrar substituição de um worker sem perda de progresso verificado.

## V3.2 — Context Intelligence e roteamento

**Objetivo:** coordenar memória compartilhada, retrieval semântico, Nomic Embed Text, decision model Jev/estilo Jev, OmniRoute, context budget, compaction e cache.

**Resultado esperado:** contexto seletivo por papel, seleção explicável de modelos/agentes e redução mensurável de desperdício.

**Gate:** benchmark pareado sem regressão material de qualidade; privacidade e uso externo respeitados.

## V3.3 — Orquestração resiliente em escala

**Objetivo:** ampliar delegação dinâmica, paralelismo, agentes auxiliares, recuperação, locks/leases, cancelamento e controle de recursos.

**Resultado esperado:** tarefas densas podem ser quebradas em múltiplos workers e recuperadas após limite/falha, sem duplicar trabalho validado.

**Gate:** testes de falha, concorrência, limites e handoff em tarefas multiagente complexas.

## V3.4 — Engineering Loop avançado

**Objetivo:** fechar o ciclo de investigação, especificação, implementação, testes, revisão, segurança e replanejamento com `TRUE FULL PASS`.

**Resultado esperado:** trabalhos de engenharia são concluídos com menos intervenção sem reduzir qualidade e segurança.

**Gate:** benchmark com tarefas não vistas, avaliação independente e relatório transparente de limitações.

---

# 16. Riscos estratégicos e respostas

| Risco | Consequência | Resposta proposta |
|---|---|---|
| Escopo excessivo | V3 vira um conjunto de integrações sem produto coerente | Priorizar engenharia de software e resultados de ponta a ponta |
| Duplicação de responsabilidades | TaskGraph, Spec Kit e Task Master divergem | Definir fonte oficial de estado e contratos de sincronização |
| Integrações frágeis | Mudanças externas quebram workflows | Adaptadores versionados, testes de contrato e níveis de compatibilidade |
| Limite/quota de agente | Um agente para ao atingir contexto, quota ou rate limit e o trabalho morre com ele | Estado de tarefa persistente, checkpoints, memória compartilhada, Handoff Package e roteamento para agente substituto |
| Orquestrador preso a uma sessão | Falha do modelo coordenador interrompe toda a operação | Coordenador como serviço durável; modelo de raciocínio substituível; estado e fila persistentes |
| Hierarquia excessiva | Muitos líderes, planners e workers aumentam custo e coordenação | Dimensionar por Goal Contract, budgets globais, métricas de benefício e limites de profundidade |
| Conflito de contexto/artefatos | Agentes sobrescrevem atualizações ou editam a mesma área simultaneamente | Event Log, registros versionados, leases/locks, worktrees e proveniência |
| Controle insuficiente de agentes externos | Ações escapam da governança anunciada | Declarar limites e não certificar capacidades que não podem ser verificadas |
| Local-first de baixa qualidade | Usuário instala, mas não consegue concluir tarefas úteis | Perfis por hardware, expectativas transparentes e benchmark local |
| Falsa economia de tokens | Menor consumo, mais falhas e retrabalho | Medir custo por tarefa verificada e qualidade pareada |
| Roteamento incorreto | Agente/modelo inadequado recebe a tarefa | Hard constraints, histórico de desempenho, explicabilidade e fallback |
| Delegação excessiva | Mais tokens, conflitos e latência | Análise de custo-benefício antes de criar agentes adicionais |
| Compactação destrutiva | Perda de decisões ou restrições | Estado estruturado, evidências e recuperação da fonte original |
| Dependência de ferramenta específica | Mudanças de licença/API comprometem o produto | Adaptadores substituíveis e avaliação periódica de dependências |
| Complexidade operacional | CLI difícil de configurar ou diagnosticar | Experiência de descoberta, doctor, defaults seguros e documentação clara |
| CLI de execução simulada | O caminho padrão pode registrar providers como mocks e produzir resultados que não representam execução real | Separar explicitamente modos `mock`, `real` e `discovery`; impedir fallback silencioso para mock em execução apresentada como real |
| Autoridade inconsistente | A autorização por capability não representa necessariamente as operações internas de um agente externo | Aplicar autorização no limite de ferramenta/processo quando tecnicamente possível; documentar limites não controláveis do harness |
| Memória confundida com estado | MemoryStore/KnowledgeStore existentes podem ser confundidos com o futuro Work Ledger | Definir ownership explícito e manter stores semanticamente separados |
| Documentação histórica conflitante | Relatórios antigos afirmam ausência de `src/jobs/`, embora o snapshot atual contenha os quatro módulos | Marcar auditorias por snapshot/data e manter uma fonte de reconciliação atualizada |

# 17. Decisões ainda abertas

As diretrizes abaixo estão alinhadas em nível de produto. Os itens marcados como pendentes exigem uma decisão adicional antes de congelar a versão 1.0 deste documento.

1. **Licença não comercial:** a intenção alinhada é permitir estudo, modificação e redistribuição do código para usos permitidos, mas impedir que terceiros lucrem com o projeto, revendam o EvolveLoop ou ofereçam uma versão comercial sem autorização. Isso deve ser descrito como **source-available**, não como open source no sentido da Open Source Definition da OSI, pois uma restrição de uso comercial não atende à definição. `PolyForm Noncommercial 1.0.0` é uma candidata se a intenção for proibir todo uso comercial; ela também pode impedir uso empresarial interno, não apenas revenda. É necessário delimitar se a proibição alcança (a) revender/distribuir como produto pago, (b) oferecer SaaS/serviço hospedado pago, (c) usar internamente em trabalho comercial/empresa, e (d) prestar consultoria/serviços com o EvolveLoop. A licença exata deve ser revisada juridicamente e também precisa ser compatível com dependências e contribuições.
2. **Plataformas:** Linux será o ambiente de desenvolvimento e validação de referência. Windows e macOS são os alvos de usuário desejados para a primeira janela de distribuição; o nível de suporte oficial, empacotamento e CI ainda deve ser delimitado. Ports para distribuições Linux específicas podem ser desenvolvidos pela comunidade, sem promessa automática de suporte oficial.
3. **Perfil de hardware e modelo de coordenação:** 8 GB de VRAM e janela de contexto de 32k, configurável, são referências desejadas para respostas rápidas e para manter o modelo de coordenação inteiramente na GPU quando viável. Ainda falta definir os perfis oficialmente testados, modelos recomendados, quantizações e requisitos mínimos. Não se presume que qualquer modelo caiba em 8 GB.
4. **Decision model local preferencial:** Jev via OpenRouter e modelos locais Jev-style via Ollama estão alinhados como opções. Ainda falta selecionar o padrão local após comparar Nimble, Tev1 e alternativas por qualidade, latência, memória e comportamento em português/inglês. A decisão local versus remota deve respeitar a privacidade configurada.
5. **Ponytail:** confirmar o projeto exato e a função que deverá cumprir no fluxo; integração e obrigatoriedade permanecem sujeitas à avaliação.
6. **Benchmark quantitativo:** o método pareado está aceito em princípio. Permanecem pendentes o conjunto final de tarefas, baseline formal, número de repetições, tolerância de regressão de qualidade e meta final de tokens/custo.
7. **Política de execução após eventos do sistema operacional:** está alinhado que fechar TUI/terminais não encerra trabalhos. É necessário definir separadamente o comportamento em logout, suspensão, reboot, desligamento e falta de energia. Estado deve sobreviver para retomada posterior.
8. **Certificação de integrações:** Cursor, Claude Code, Antigravity e Codex são prioridades. A matriz final de capacidades, limites e nível de certificação dependerá de testes por versão/adaptador.
9. **Limites de concorrência e profundidade:** não haverá teto fixo de subagentes por líder ou worker. Permanecem pendentes os valores padrão de orçamento, concorrência, fan-out, profundidade, CPU/GPU, memória, processos e tempo, além da política de backpressure quando os limites forem alcançados.
10. **Defaults de capacidades externas:** está alinhado que leitura/criação/edição de arquivos no workspace autorizado é baseline permanente e não configurável como toggle comum; terminal/processos, MCPs, rede, integrações, GitHub, instalação, deploy, criação de subagentes e operações destrutivas são capacidades configuráveis. Permanecem pendentes os defaults recomendados por perfil, projeto e categoria de risco.

---

# 18. Glossário

| Termo | Significado neste documento |
|---|---|
| Agente / harness | Ambiente que conduz um ciclo de trabalho com modelo, ferramentas, contexto, sessão e políticas próprias |
| Modelo | Backend de inferência usado para produzir respostas ou decisões |
| Provedor | Serviço, runtime ou integração que disponibiliza um modelo ou agente |
| Adaptador | Componente que traduz o contrato do EvolveLoop para a interface de um recurso externo |
| TaskGraph | Representação oficial de tarefas, dependências, estados e resultados de um trabalho |
| Agent Registry | Inventário de agentes e subagentes, suas relações pai/filho, tarefas, estados, última atividade e recursos |
| Delegation Contract | Contrato de objetivo, escopo, critérios, permissões, orçamento e responsabilidade de cada delegação |
| Orquestrador-Mestre | Coordenador global que delega e acompanha o estado; não executa trabalho de worker |
| Líder de domínio | Agente coordenador responsável por um setor e por aprovar o plano criado por seu planner |
| Planner | Subagente obrigatório de cada líder, responsável por elaborar o plano antes da execução |
| Worker | Agente que executa uma tarefa delimitada |
| Agente auxiliar / intern | Subagente temporário para pesquisa, análise ou coleta de fontes |
| Shared Work Memory | Estado persistente compartilhado, com registros, eventos, artefatos e visões por papel |
| Event Log | Histórico append-only de eventos de coordenação e execução |
| Decision model | Modelo que escolhe entre opções estruturadas; não substitui regras determinísticas |
| Runtime | Camada que aplica políticas e executa operações autorizadas |
| Context Intelligence | Camada que seleciona, recupera, limita, compacta e mede contexto |
| Evidência | Artefato observável que sustenta uma conclusão sobre o trabalho |
| Goal Contract | Documento estruturado de objetivo, escopo, requisitos e critérios de aceitação |
| Handoff Package | Pacote estruturado de estado e evidências que permite outro agente continuar a mesma tarefa |
| Estado do agente | Ciclo de vida de uma sessão/agente, separado do estado durável da tarefa |
| PLAN_APPROVED | Registro de aprovação do plano de um domínio pelo respectivo líder |
| TRUE FULL PASS | Estado global no qual todos os critérios obrigatórios aplicáveis passaram com evidência |
| Local-first | Funcionamento inicial e preferencial no ambiente local, sem obrigar conexão externa |
| Tarefa verificada | Tarefa cujos critérios de aceitação aplicáveis foram avaliados com evidências registradas |

# 19. Critério final de identidade da V3

A V3 estará cumprindo sua proposta quando um desenvolvedor puder entregar um objetivo complexo ao EvolveLoop, refiná-lo por meio do Grill-Me, receber um Goal Contract, permitir que o Orquestrador-Mestre monte uma hierarquia de líderes e workers, exigir que cada líder aprove seu plano antes da execução, fechar todos os terminais sem matar o trabalho, transferir uma tarefa quando um agente atingir limites, manter contexto compartilhado sem enviar todo o histórico a cada modelo e receber um resultado `TRUE FULL PASS` sustentado por evidências.

O Orquestrador-Mestre coordena; os líderes planejam e supervisionam por meio de planners e workers; os workers executam; auxiliares pesquisam; verificadores produzem evidências. Nenhum agente individual é a fonte da verdade sobre o estado do trabalho. A fonte da verdade é o estado persistente, versionado e compartilhado do EvolveLoop.

O sucesso não será medido pela quantidade de agentes integrados, pelo número de modelos disponíveis, pela quantidade de subagentes criados ou pelos tokens economizados isoladamente. Será medido pela capacidade de **concluir mais trabalho útil e verificável, com continuidade entre agentes, menos desperdício e controle sobre segurança e qualidade**.

---

## Encerramento

Este documento versão 0.5 consolida a visão de produto da V3 e incorpora explicitamente o canvas `Evolve-V3.canvas`: Orquestrador-Mestre como coordenador não executor, líderes de domínio, planner obrigatório por líder, workers, auxiliares em múltiplos níveis, memória compartilhada, rastreabilidade de relações pai/filho e continuidade por handoff. A revisão também formaliza o Agent Registry, o Delegation Contract, o tratamento de descendentes quando um agente pai falha e o critério de que nenhum agente pode ficar ativo sem proprietário, tarefa, autoridade e orçamento registrados.

O documento continua sendo uma definição de produto e princípios arquiteturais, não uma especificação técnica de implementação. A licença exata e o alcance da restrição comercial, o suporte formal a plataformas, os perfis de hardware, os valores padrão de concorrência e os parâmetros finais de benchmark permanecem pendentes. A operação em background é garantida em relação ao fechamento da TUI/terminais; persistência de estado após reboot não equivale a execução enquanto a máquina está desligada. Alterações em hierarquia, autoridade, critérios de conclusão, privacidade ou objetivos de sucesso devem ser registradas como decisões explícitas.

## Referências externas para decisões de produto

- Open Source Initiative — Open Source Definition: https://opensource.org/osd. A definição exige redistribuição sem restrição de venda e não permite discriminar campos de atuação; uma proibição de uso comercial, portanto, caracteriza uma licença source-available, não open source no sentido da OSI.
- PolyForm Noncommercial 1.0.0: https://polyformproject.org/licenses/noncommercial/1.0.0. Candidata para permitir modificação e distribuição para fins não comerciais; precisa ser comparada com a intenção exata sobre uso interno por empresas e prestação de serviços.
- OpenRouter — Jev Lab: https://openrouter.ai/labs/jev. Jev é apresentado como modelo de decisões estruturadas/tipadas, voltado a classificação e roteamento.
- Ollama — Jev-style decision models: https://ollama.com/blog/ollama-now-supports-jev-style-decision-models. Documenta o endpoint `/v1/systemone` e modelos locais como Nimble e Tev1; são Jev-style, não o Jev original.
- Ollama — Nomic Embed Text: https://ollama.com/library/nomic-embed-text. O modelo gera embeddings e não realiza seleção/roteamento de modelos.
- OmniRoute — referência de provedores: https://omniroute.hagicode.com/en-US/reference/provider-reference/. Catálogo agregado de provedores locais, gratuitos e pagos; quotas, termos e disponibilidade dependem dos upstreams.


---

# 20. Reconciliação da visão V3 com o baseline atual do repositório

Esta seção conecta a definição de produto às capacidades encontradas no snapshot de código recebido em 9 de novembro de 2026. Ela não muda o escopo da V3 nem autoriza implementação. Seu propósito é impedir duas falhas: descartar código útil por desconhecimento e declarar como pronto algo que existe apenas como conceito, skill, fixture ou documentação.

## 20.1 Identificação do baseline e limites da inspeção

| Campo | Valor observado |
|---|---|
| Arquivo recebido | `langostino-evolveloop-20261109.zip` |
| SHA-256 do arquivo | `874ab986f90ad02269a930edcad65208039d89430431f211b48a87c9afcc5041` |
| Conteúdo do arquivo | 1.422 arquivos; aproximadamente 8,23 MB descompactados, sem contar dependências instaladas posteriormente no ambiente de inspeção |
| Package principal | `@agents/orchestrator`, versão `2.0.0` |
| Runtime declarado | Node.js `>=20`, TypeScript, ESM |
| Código do orchestrator | 89 arquivos TypeScript em `orchestrator/src/`, aproximadamente 12,2 mil linhas |
| Testes | 42 arquivos `*.test.ts` no snapshot |
| Providers declarados | 15 manifests: 9 `cursor-skill` e 6 `deterministic` |
| Skills | 411 arquivos combinados em `.cursor/skills/` e `global-skills/` |
| Agent mirrors | 23 arquivos Markdown em `Agents/` |
| Data de referência do ZIP | Entradas do arquivo indicam 4 nov 2026; o arquivo foi enviado nesta conversa em 9 nov 2026 |

### Limites de proveniência

O arquivo `.git` do ZIP é um arquivo de worktree que aponta para metadados Git externos não incluídos no pacote. Esse destino não está disponível no ambiente de inspeção. Portanto, não foi possível confirmar branch, commit, remote, tags ou alterações não commitadas. A identificação `20261109` é o nome do snapshot recebido, não uma afirmação sobre o commit.

A inspeção foi estática sobre a árvore extraída, seus manifests, documentação e testes. Nenhum arquivo de código do repositório foi modificado. A instalação de dependências não foi concluída: `npm ci` excedeu o tempo disponível e `npm ci --offline` falhou porque o tarball `yaml@2.9.0` não estava no cache. Consequentemente, `npm test` não encontrou `vitest`, e `npm run build` não pôde resolver tipos de Node e `yaml`. **Não há veredito atual de build ou testes nesta revisão.**

O repositório contém um relatório de sincronização histórico (`docs/reconciliation/runtime-sync/RUNTIME-SYNC-REPORT.md`) que registra `103/103` testes, `5/5` em `full-cycle` e `2/2` em `job-resume`, medidos em 18 set 2026 após restaurar `src/jobs/`. Esses números são evidência histórica documentada, não uma execução reproduzida sobre o ZIP de novembro.

## 20.2 Fotografia factual da arquitetura existente

A V2 não é apenas um conjunto de prompts. Existe um núcleo de execução em TypeScript, mas seu modelo operacional é baseado em Capability IR e providers, não em uma hierarquia dinâmica de agentes com Goal Contract e Work Ledger.

| Componente existente | Localização principal | O que existe no snapshot | Classificação para V3 |
|---|---|---|---|
| Capability IR e validação | `orchestrator/src/ir/`, `types/`, `schemas/` | Contratos de entrada, nós, dependências, DoD e validação estrutural | **Preservar e evoluir** |
| Grafo de execução | `orchestrator/src/graph/graph-store.ts` | `GraphStore`, estados de nós, dependências e snapshots | **Preservar como motor de execução**, alinhando com TaskGraph superior |
| Scheduler | `orchestrator/src/scheduler/` | Seleção de nós prontos, paralelismo, retries, timeouts e dispatch | **Preservar e evoluir** |
| Registry de capabilities/providers | `orchestrator/src/registry/registry-client.ts`, `manifest-loader.ts` | Declarações de providers, seleção por estratégia e evidência da seleção | **Preservar**; não confundir com Agent Registry |
| ProviderRouter | `orchestrator/src/providers/mock-provider.ts` | Mapa de runtimes por `provider_id` | **Preservar e generalizar** para adaptadores reais |
| PluginLoader | `orchestrator/src/plugins/plugin-loader.ts` | Carrega `cursor-skill`, `shell`, `mock` e `deterministic` | **Preservar e ampliar** |
| Provider determinístico | `orchestrator/src/providers/deterministic/` | Filesystem, Git, shell, system, project e knowledge handlers | **Preservar após hardening** |
| CursorSkillProvider / JobFileExecutor | `orchestrator/src/plugins/cursor-skill-provider.ts` | Lê skill e cria jobs para execução externa por host | **Preservar como adaptador**, não como integração universal de agentes |
| Policies | `orchestrator/src/policies/` | Gating, retries, ordem, estratégia de provider, timeouts e limites de nós | **Preservar e separar da autoridade** |
| CapabilityAuthority | `orchestrator/src/authority/` | Decisões `allow`, `deny`, `confirm` com flags de shell/write/network e workspace | **Evoluir antes de autonomia ampla** |
| Evidence | `orchestrator/src/evidence/` | Builders e validadores de evidência de execução/gates | **Preservar como base dos verificadores** |
| EventBus / JSONL | `orchestrator/src/events/`, `persistence/jsonl-event-persister.ts` | Eventos em memória por run e persistência opcional em JSONL | **Preservar e ampliar** para eventos de coordenação duráveis |
| JobStore / Pickup / Resume | `orchestrator/src/jobs/` | Jobs externos, resultado, pickup e conversão em resultado do engine | **Preservar e evoluir** para handoff multiagente |
| Checkpoint | `orchestrator/src/jobs/checkpoint.ts` | Snapshot do GraphStore com IDs de feature, IR e policy | **Preservar e ampliar**; não cobre a hierarquia V3 |
| MemoryStore | `orchestrator/src/memory/` | Memória por feature com preferências, decisões e contexto em YAML | **Preservar e evoluir**; não é Shared Work Ledger |
| KnowledgeStore / Wiki backend | `orchestrator/src/knowledge/` | Conhecimento persistente com tags/capabilities e backend Wiki externo | **Preservar e ampliar** com retrieval semântico opcional |
| EvolveLoop V1 de evolução | `orchestrator/src/evolveloop/` | Observação, sinais, padrões, necessidades, RCA, candidatos e handoff por gates | **Preservar como subsistema distinto** |
| Telemetria e métricas | `orchestrator/src/telemetry/` | Acumuladores, traces e skill telemetry | **Preservar e conectar ao caminho quente** |
| Agent Skills / Rules / Agents | `.cursor/skills/`, `global-skills/`, `Rules/`, `Agents/` | Pacotes Markdown e configurações de host | **Preservar como assets/adapters**, não confundir com objetos Agent runtime |
| MCP host configuration | `mcp/` | Configuração de ferramentas para hosts | **Preservar como integração externa**; o transporte MCP não está implementado no Core |
| Agent Setup | `agent-setup/` | Instalador Python declarativo com profiles, manifest e hooks | **Preservar fora do núcleo de execução**, sujeito a revisão de portabilidade |
| CLI atual | `orchestrator/src/cli/` | `run-engine`, `run-jobs` e `registry-builder` | **Evoluir significativamente** para produto CLI/TUI e operação persistente |

## 20.3 O que o caminho de execução atual realmente faz

O entrypoint `orchestrator/src/cli/run-engine.ts` exige `--ir <arquivo.yaml>`. Ele carrega um Capability IR, resolve policy, monta registry/providers, instancia `ExecutionEngine`, executa um run e imprime um resumo JSON. Isso é útil como runner do motor, mas ainda não é a experiência CLI-first da V3: não recebe diretamente um objetivo em linguagem natural, não conduz o Grill-Me dentro do produto, não cria Goal Contract, não dimensiona líderes ou mantém um serviço de coordenação persistente.

`run-jobs` oferece comandos para listar, fazer pickup, invocar e concluir jobs externos. O fluxo é uma integração de pickup/retorno de trabalho, não um daemon que monitora provedores, detecta limites e transfere automaticamente uma tarefa de Codex para Claude Code ou Cursor.

### 20.3.1 Fallback para mocks no bootstrap do CLI

Em `run-engine.ts`, `setupProviders()` carrega um `PluginLoader`, mas registra providers reais somente quando o manifest é `cursor-skill` **e** existe `jobsDir`. Nos demais casos, registra `createMockProvider(id)`. Assim:

- no caminho sem `--discovery`, manifests `deterministic`/`shell` não são carregados como handlers reais por esse bootstrap; são substituídos por mocks;
- `cursor-skill` sem `jobsDir` também cai em mock;
- com `jobsDir`, os `cursor-skill` podem gerar jobs externos, mas providers determinísticos continuam no fallback mock nesse caminho;
- o caminho de `--discovery` é diferente: quando um provider é descoberto durante a execução, o engine usa `PluginLoader` para carregar o manifest descoberto, com `jobsDir` disponível.

Isso não torna `MockProvider` inútil: mocks são necessários para testes. O problema é a ausência de separação explícita entre modo de simulação e modo de execução real no entrypoint. A V3 deve ter modos inequívocos (`mock`, `real`, `discovery` ou equivalentes) e nunca apresentar um provider mockado como execução real.

### 20.3.2 Provider registry não é Agent Registry

`RegistryClient` seleciona providers associados a capabilities. `ProviderRouter` resolve um `ProviderRuntime` pelo ID do provider. Isso não representa instâncias de agentes em execução. Não há, no Core atual, um registry dinâmico que mantenha `agent_id`, `parent_agent_id`, papel, contrato de delegação, tarefa atual, heartbeat, lease, checkpoint, filhos e estado vivo.

O tipo `ExecutorCapabilities` e heartbeats existentes em helpers de mock não equivalem a um Agent Registry operacional para agentes externos.

### 20.3.3 Orchestrator atual não é o Orquestrador-Mestre V3

`orchestrator/src/orchestrator/orchestrator.ts` contém uma classe pequena que escolhe `continuar`, `corrigir` ou `replan` a partir de um `blocked_reason` e emite o evento correspondente. Ela é uma política de decisão de recuperação do run, não um agente coordenador global, não cria líderes, não administra descendentes e não mantém uma sessão de coordenação.

A V3 deverá preservar essa lógica útil sob uma responsabilidade mais estreita (por exemplo, recuperação/decisão de run) e introduzir o serviço de coordenação mestre como capacidade nova. Não se deve reaproveitar o nome como prova de que o Mestre já existe.

## 20.4 Estado, memória, conhecimento, evidência e checkpoint: ownership recomendado

O baseline contém stores complementares, não uma memória global unificada. A V3 precisa preservar essa separação e adicionar o Work Ledger como estado operacional canônico.

| Conceito | Fonte existente | Ownership recomendado na V3 | O que não deve ser confundido |
|---|---|---|---|
| Goal Contract | Não existe como artefato canônico do Core | Objetivo, escopo, exclusões e critérios versionados | Prompt ou resumo de conversa |
| Orchestration TaskGraph / Work Ledger | Não existe como sistema hierárquico | Estado canônico de tarefas, dependências, donos, delegações e progressão | GraphStore de execução de capabilities |
| Capability IR / GraphStore | Existe | Plano de execução de baixo nível dentro de uma tarefa/run; nodes, dispatch e resultados | Status global de aceitação do projeto |
| Event Log | EventBus e JSONL por run existem | Histórico append-only de transições, decisões, handoffs, permissões e eventos | Memória semântica ou prova de sucesso |
| Evidence Store | Evidence[] e builders existem; persistência depende do fluxo | Provas associadas a critérios, tarefas e runs | Telemetria, texto livre ou mensagem final do agente |
| Memory | MemoryStore por feature existe | Preferências e memória episódica/contextual, com proveniência e escopo | Estado canônico da tarefa |
| Knowledge | KnowledgeStore/Wiki existem | Conhecimento curado e reutilizável: padrões, pitfall, decisões e documentação | Histórico vivo de execução |
| Semantic Index | Busca por tags/capabilities/texto e Wiki externa existem; embeddings locais não existem no Core | Índice derivado/reconstruível sobre fontes autorizadas, usando Nomic Embed Text como opção | Fonte de verdade ou substituto de arquivo original |
| Checkpoint | Snapshot JSON do grafo existe | Snapshot mínimo suficiente para recuperar execução, versão e identidade de estado | Memória, evidência ou histórico completo de conversa |
| Context Projection / Compaction | Não existe no pipeline do engine | Visão temporária e compactada, recriada a partir de fontes canônicas e validada | Store canônico ou fonte única de fatos |
| Agent Registry | Não existe como registry de instâncias | Agentes, papéis, linhagem, tarefa, estado, lease/heartbeat, orçamento e capacidades | Registry de capabilities/providers |

### Regras de integridade desse modelo

1. Goal Contract define o que precisa ser verdadeiro; TaskGraph define quem faz o quê e em que estado; Capability IR define operações de execução; Evidence sustenta se critérios passaram.
2. Um node do GraphStore pode terminar sem que o projeto esteja `TRUE_FULL_PASS`. O resultado global só muda após avaliação dos critérios no Goal Contract.
3. Event Log registra o que ocorreu; projeções atuais podem ser reconstruídas. Uma projeção nunca substitui o evento original.
4. Memory e Knowledge permanecem semanticamente separados. O Work Ledger não deve absorver preferências ou todo o conteúdo da Wiki.
5. O índice vetorial é derivado e pode ser reconstruído; fonte original e proveniência permanecem acessíveis.
6. Compactação produz contexto de trabalho descartável e regenerável. Não apaga artefatos, eventos, checkpoints nem evidências.
7. Checkpoint guarda estado suficiente para retomar a operação, mas não se torna o lugar onde todos os fatos do projeto são armazenados.

Esta proposta resolve em nível conceitual a pergunta de ownership que motivou o ADR `ADR-DR-0005`. Ela não autoriza implementar compaction/reinject sem critérios de perda de informação, validação de reconstrução e testes de recuperação.

## 20.5 Classificação de componentes: preservar, evoluir, substituir ou retirar

A classificação abaixo é uma decisão de direção para o planejamento da V3. “Substituir” não significa apagar imediatamente: significa que uma nova responsabilidade deverá assumir o papel quando existir equivalência testada.

| Componente | Decisão | Justificativa e destino |
|---|---|---|
| Capability IR | **PRESERVAR** | Contrato de execução claro; pode ser produzido a partir das tarefas aprovadas e não de prompts livres diretamente enviados a providers |
| GraphStore | **PRESERVAR / EVOLUIR** | Mantém DAG de execução; definir vínculo explícito com TaskGraph de coordenação |
| Scheduler | **PRESERVAR / EVOLUIR** | Reaproveitar dispatch, retry e concorrência; ampliar para orçamento e leases sem misturar com planejamento LLM |
| RegistryClient | **PRESERVAR** | Continua como registry de capability/provider; não deve virar Agent Registry |
| ProviderRouter | **PRESERVAR / EVOLUIR** | Adicionar abstrações de agente/modelo e capacidades declaradas, evitando um provider genérico que esconda diferenças |
| PluginLoader | **PRESERVAR / EVOLUIR** | Reutilizar manifests e loading, adicionando adapters nativos/protocolos verificados |
| MockProvider | **PRESERVAR** | Exclusivo para testes, fixtures e modo de simulação explicitamente identificado |
| DeterministicProvider | **PRESERVAR APÓS HARDENING** | Base útil para filesystem/Git/shell; corrigir contenção, env, process management e sandbox antes de autonomia maior |
| CursorSkillProvider / JobFileExecutor | **PRESERVAR COMO ADAPTADOR** | Útil para bridge de execução externa; não generalizar sua semântica para Cursor/Claude/Codex/Antigravity |
| PolicyEngine | **PRESERVAR** | Políticas de retries, gates, timeouts e estratégia continuam relevantes |
| CapabilityAuthority | **EVOLUIR** | Precisa aplicar política por operação real e suportar baseline V3 de read/create/edit dentro do workspace |
| Evidence builders/validator | **PRESERVAR / EVOLUIR** | Base para critérios do Goal Contract, com rastreabilidade entre critério, execução e evidência |
| EventBus / JSONL | **PRESERVAR / EVOLUIR** | Aumentar durabilidade e cobertura de eventos; considerar outbox/append-only e projeções reconstruíveis |
| JobStore / job pickup / job resume | **PRESERVAR / EVOLUIR** | Manter compatibilidade com jobs externos; adicionar lease, ownership, retries e handoff multi-provider |
| Checkpoint de GraphStore | **PRESERVAR / EVOLUIR** | Ampliar para versão do estado, contexto de execução e referências à hierarquia sem guardar tudo em um JSON monolítico |
| MemoryStore | **PRESERVAR / EVOLUIR** | Continua sendo memória contextual; não é substituto do Work Ledger |
| KnowledgeStore / Wiki backend | **PRESERVAR / EVOLUIR** | Aproveitar a separação backend e conhecimento curado; adicionar índice semântico como camada derivada |
| `Orchestrator` atual | **REPOSICIONAR** | Manter como recuperação/decisão do run; não tratá-lo como Orquestrador-Mestre |
| EvolveLoop V1 longitudinal | **PRESERVAR COMO SUBSISTEMA** | Evolução observacional e gated é distinta da orquestração diária de projetos; não deve ganhar autonomia de mutação do Core por associação de nome |
| Agent Skills / Rules / Agents | **PRESERVAR / ADAPTAR** | Conteúdo e especialização reutilizáveis; carregar sob demanda e conectar com contracts/skills registry |
| MCP host config | **PRESERVAR COMO CONFIGURAÇÃO** | O host pode prover MCP; o Core deverá integrar por adaptadores e declarar quais controles são realmente aplicáveis |
| CLI `run-engine` / `run-jobs` | **EVOLUIR / SUBSTITUIR COMO UX PRINCIPAL** | Permanecem ferramentas internas de execução; a experiência final será CLI/TUI e comandos não interativos apoiados por Core persistente |
| Agent Setup Python | **PRESERVAR FORA DO CORE** | Instalador/setup é preocupação de distribuição; não deve ser acoplado ao loop de coordenação |
| Relatórios históricos de auditoria | **ATUALIZAR / ARQUIVAR COMO HISTÓRICO** | Manter evidência com data/snapshot; marcar claramente achados superados pelo sync |

## 20.6 Lacunas concretas entre o baseline e a V3

| Capacidade V3 | Evidência no baseline | Lacuna que permanece |
|---|---|---|
| CLI/TUI como produto | Três CLIs operacionais internos (`run-engine`, `run-jobs`, `registry-builder`) | Não há TUI interativa nem fluxo unificado de produto |
| Core em background | `ExecutionEngine.run()` e jobs externos são processos invocados | Não há Coordinator Service independente da TUI/terminal |
| Intake em linguagem natural | Skills e comandos do host descrevem pipelines | `run-engine` exige Capability IR YAML; não há planner LLM integrado ao Core |
| Goal Contract / Grill-Me | Skills e gates Grill-Me existem no host; tipos de DoD existem no IR | Não existe Goal Contract versionado e reconciliado com TaskGraph como artefato canônico do Core |
| Orquestrador-Mestre | Classe `Orchestrator` decide `continue/correct/replan` após bloqueio | Não existe coordenação global contínua nem agente supervisor com estado persistente |
| Hierarquia | Agent Markdown e provider manifests descrevem especializações | Não existe criação/gestão runtime de líderes, planners obrigatórios, workers e auxiliares com linhagem |
| Agent Registry | Registry de providers/capabilities existe | Falta registry de instâncias, heartbeat, leases, pais/filhos e ownership de descendentes |
| Delegation Contract | Provider manifests e IR têm inputs/outputs/DoD | Falta contrato formal por delegação, budget herdado, escopo e handoff |
| Shared Work Ledger | EventBus, job/checkpoint e stores existem separados | Falta estado global e versionado que reconcilie tarefas, agentes, tentativas, artefatos e evidências |
| Continuidade cross-provider | `JobStore`, `JobFileExecutor` e checkpoint de grafo existem | Não há substituição automática de um agente/provedor por outro com Handoff Package completo |
| RAG semântico local | Wiki externa e stores de Markdown/YAML existem | Não há Nomic Embed Text, índice vetorial local ou retrieval semântico unificado no Core |
| Compaction/reinject | Não encontrado no pipeline de execução | Precisa ser desenhado sobre ownership definido; ADR histórico o adiou |
| Model routing | `RegistryClient` seleciona providers de capabilities por estratégia | Não há catálogo de modelos, Jev/decision model, OmniRoute ou avaliação por tarefa |
| Agent adapters | CursorSkillProvider e plugins deterministic/shell existem | Não há adapters nativos/validados para Claude Code, Codex, Cursor e Antigravity como harnesses independentes |
| MCP | Arquivos de configuração host existem | Core não contém transporte/gerenciador MCP próprio no snapshot; deve-se decidir host-mediated vs Core-managed |
| Segurança de execução | CapabilityAuthority e path checks existem | Falta sandbox OS, isolamento efetivo, containment symlink-safe e controle completo de operações de harness externo |
| Aprovação humana | `confirm` e jobs pendentes existem | Não há workflow de aprovação interativa persistente integrado à TUI/Coordinator |
| Stuck detection | Limite de iterações e motivos de bloqueio existem | Não há detector semântico operacional; regras de falso positivo/negativo ainda precisam ser definidas |
| Observabilidade | EventBus, JSONL e acumuladores de métricas existem | Falta visão unificada de toda a hierarquia e ligação a custo real por agent/model/task |

## 20.7 Findings de risco que afetam a transição

Os pontos abaixo foram observados no código ou nos documentos do snapshot. São achados estáticos; não representam exploração de vulnerabilidade em ambiente real.

### R1 — Bootstrap de provider pode simular execução

**Severidade: alta para validade dos resultados.** O `setupProviders()` de `run-engine.ts` registra mocks para a maior parte dos providers no caminho padrão. Isso pode fazer um run parecer bem-sucedido sem exercitar handlers reais. O comportamento deve ser explicitamente classificado e o modo real deve falhar fechado quando faltar adapter.

### R2 — Autoridade atual não implementa ainda o baseline de autonomia V3

`ExecutionEngine` usa `authorityContext ?? {}`. O Scheduler faz uma checagem de capability; para capabilities reconhecidas como write/shell sem flags concedidas, a autorização pode retornar `CONFIRMATION_REQUIRED`, mas o Scheduler converte isso em resultado de falha, não em uma solicitação pendente de aprovação que a TUI possa retomar. O `run-engine` não passa um contexto que permita write por padrão. Para capabilities de skill externas, o Core vê a capability ampla, não cada leitura/edição/processo interno do harness; por isso, não consegue afirmar que controla todas as operações do agente externo.

**Implicação V3:** o requisito de leitura/criação/edição dentro do workspace autorizado exigirá política explícita de workspace e enforcement por ferramenta quando possível. Terminal, rede, MCPs, credenciais, ações destrutivas e externos devem continuar como capacidades separadas e configuráveis. Um harness que não permite controle granular deve ser marcado com essa limitação.

### R3 — Path confinement é lexical, não symlink-safe

`pathEscapesWorkspace()` e `resolveWorkspacePath()` usam `resolve()` e comparação de prefixo textual. `filesystemRead/Write/List/Search` usam chamadas que seguem links simbólicos (`statSync`, `readFileSync`, `writeFileSync`). Não há, nesses helpers, validação por `realpath` nem mecanismo visível de proteção contra race/TOCTOU. O achado justifica investigação e hardening; a exploração não foi demonstrada nesta auditoria.

### R4 — Shell herda ambiente e usa shell de sistema

`shellExecute()` usa `spawn(..., { shell: true, env: { ...process.env } })`, com timeout e limites de captura de saída. Não há sandbox de processo/OS nesse caminho. O ambiente herdado pode conter segredos, e timeout de um filho shell não é prova de encerramento de todos os descendentes. A V3 precisa de política de env, process groups, limites e contenção verificável antes de prometer autonomia irrestrita.

### R5 — Checkpoint é mais estreito que continuidade V3

`EngineCheckpoint` contém `feature_id`, `policy_id`, `ir_id`, `GraphSnapshot` e timestamp. O `JobStore` grava jobs/resultados JSON e usa escrita atômica em passos separados. Isso é uma base real de persistência, mas não registra Agent Registry, linhagem, delegações, leases, orçamento agregado, Handoff Package nem estado semântico completo de projeto. O histórico E-005 do repositório explicitamente limita a evidência a fixtures e mesma execução/processo, sem provar exatamente-uma-vez global ou recuperação por OS kill.

### R6 — Memória e conhecimento não são memória global semântica

`MemoryStore` é escopado por feature e trata preferências/decisões; `FilesystemMemoryStore` persiste YAML. `KnowledgeStore` pesquisa em entradas carregadas por capability, tags e correspondência textual; `FilesystemKnowledgeStore` mantém Markdown e index YAML. O `WikiKnowledgeBackend` delega busca a uma ferramenta CLI externa. Não há no Core atual índice local Nomic/vector nem memória de trabalho compartilhada por agentes.

### R7 — EventBus e Evidence não são o Work Ledger

O `EventBus` é instanciado por run; o `JsonlEventPersister` pode persistir eventos em JSONL quando `dataPaths` está ativo. Evidence é acumulada no resultado do run. Essas são bases úteis, mas não há ainda uma projeção global reconstruível de tarefas/agentes/descendentes. Também não se deve confundir a Evidence[] do engine com convenções de arquivos `memory/.../evidence` usadas por skills do host.

### R8 — Stuck detector, sandbox e compaction foram adiados historicamente

Os ADRs `ADR-DR-0003`, `ADR-DR-0004` e `ADR-DR-0005` registram decisões de definir primeiro o modelo de segurança, a semântica de stuck e o ownership do contexto antes de implementar sandbox, detector ou compaction/reinject. O `PROTOTYPE-HARDENING-REPORT.md` declara PT-001/PT-002 prontos para gate, mas não executados. Essas decisões históricas devem permanecer visíveis; não transformar `READY_FOR_GATE` em `IMPLEMENTED`.

## 20.8 Reconciliação dos documentos históricos do próprio repositório

O snapshot contém documentos de auditoria que descrevem estados diferentes da árvore. A leitura correta deve respeitar data e escopo:

| Documento interno | Declaração histórica | Situação no snapshot atual |
|---|---|---|
| `docs/audit/IMPLEMENTATION-GAPS.md` e `FINAL-STATE-MODEL.md` | `orchestrator/src/jobs/` ausente | **Superado:** os quatro módulos estão presentes no ZIP atual |
| `docs/reconciliation/STRUCTURAL-DIFF.md` e `JOBS-RECONCILIATION.md` | CursorSKILLS sem `jobs/`; AGENTS como runtime SSOT | **Histórico de divergência pré-sync:** não descreve a árvore atual do ZIP |
| `docs/reconciliation/runtime-sync/RUNTIME-SYNC-REPORT.md` | Sincronização de `jobs/` concluída; reporta 103/103 e suites de integração verdes em 18 set 2026 | **Compatível quanto à presença atual de `jobs/`; resultados de teste permanecem históricos** |
| `docs/architecture/decision-review/ARCHITECTURE-DECISION-REVIEW.md` | Sandbox, stuck detector, compaction e algumas experiências adiados | **Ainda relevante como histórico de decisões; implementação continua ausente no source atual** |
| `README.md` e `docs/architecture/public/OVERVIEW.md` | Produto centrado em skills/host Cursor + orchestrator opcional | **Descrição V2/V1, não visão de produto V3** |
| `docs/architecture/public/LIMITATIONS.md` | EvolveLoop V1 `V1_READY_WITH_LIMITATIONS` | **Continua válida para o subsistema evolutivo V1; não representa status da futura plataforma V3** |
| `docs/architecture/publication/LICENSE-DECISION.md` e `LICENSE` | MIT | **Estado legal atual do snapshot; conflita com intenção de proibir exploração comercial** |

A presença de `src/jobs/` no ZIP atual corrige a afirmação anterior de que o snapshot recebido não tinha esses módulos. A reconciliação de setembro registra que eles foram restaurados. Não se deve continuar usando a afirmação “jobs ausentes” como status atual.

Os relatórios históricos devem ser preservados como trilha de auditoria, mas marcados como snapshot histórico em eventual revisão futura do repositório. Não sobrescrever evidência antiga para fazê-la parecer que descreve a árvore atual.

## 20.9 Relação entre arquitetura atual e arquitetura-alvo V3

A migração deve preservar os contratos úteis sem criar fontes paralelas de verdade.

```text
V3 PRODUCT / COORDINATION PLANE
  Goal Contract
      ↓
  Orchestration TaskGraph + Agent Registry + Delegation Contracts
      ↓
  Coordinator Service / Master / Domain Leaders / Planners / Workers
      ↓
  Context Intelligence + Decision & Model/Agent Routing
      ↓
V2 EXECUTION KERNEL (evoluído)
  Capability IR → Policy/Authority → Scheduler → Registry → Provider
      ↓
  Deterministic handlers / external agent adapters / tools
      ↓
  Evidence + Events + Artifacts
      ↓
  Verification → Task state → TRUE FULL PASS
```

### Limites de propriedade

- **Coordinator Service** mantém a continuidade global; o modelo que ajuda o Mestre é substituível.
- **Orchestration TaskGraph** mantém tarefa de produto/engenharia, atribuição, estado, dependências e árvore de delegação.
- **GraphStore** continua controlando o DAG de capabilities executado pelo Execution Engine. A relação entre `task_id` e `feature_id/run_id/IR node` deve ser explícita.
- **Capability Registry** continua descrevendo providers/capabilities; **Agent Registry** descreve instâncias e sessões de agentes. São registries de naturezas distintas.
- **Model Catalog/Router** descreve modelos e endpoints; não deve ser confundido com ProviderRouter de execução de capabilities.
- **ExecutionPolicy** determina estratégia operacional (retries, gates, timeouts); **CapabilityAuthority** determina autorização. Uma não substitui a outra.
- **Event Log** registra fatos de mudança; **Evidence** prova critérios; **Telemetry** mede comportamento; **Memory** retém contexto; **Knowledge** retém conhecimento; **Checkpoint** permite recuperar execução.
- **Evolution V1** continua opcional e gated; não é o serviço de coordenação da V3 nem uma autorização para modificar runtime/policy sem gate.

## 20.10 Sequência de reconciliação antes de implementação

A ordem recomendada para transformar o baseline em um plano técnico é:

1. **Congelar o snapshot de referência:** registrar ZIP/hash, obter branch/commit real a partir do ambiente Git do usuário e definir qual cópia passa a ser a referência oficial.
2. **Atualizar a documentação de estado:** marcar relatórios que declaram ausência de `src/jobs/` como pré-sync; preservar os registros históricos e apontar para o estado atual.
3. **Reproduzir a base de qualidade:** instalar dependências em ambiente limpo, executar `npm ci`, `npm run build`, `npm test` e os fluxos de job-resume/full-cycle; guardar logs e versões.
4. **Fechar provider bootstrap:** demonstrar claramente o modo mock vs real vs discovery e impedir fallback silencioso que possa gerar evidência de execução simulada.
5. **Fechar o mapa de ownership:** aprovar formalmente Goal Contract, TaskGraph, GraphStore, Event Log, Evidence, Memory, Knowledge, Semantic Index e Checkpoint.
6. **Fechar modelo de autoridade:** definir workspace padrão, permissões permanentes de arquivo, capacidades configuráveis, interação de aprovação e cobertura real de adapters externos.
7. **Definir contratos de adapter e agent registry:** declarar capacidades observáveis e limitações de Cursor, Claude Code, Antigravity e Codex.
8. **Definir continuidade cross-provider:** contratos de checkpoint/handoff, leases, idempotência, locks/worktrees, recuperação de descendentes e comportamento sem provider substituto.
9. **Definir benchmark e critérios de aceite da V3:** estabelecer baseline atual, tarefas, qualidade, custo, tokens, latência e falhas de recuperação.
10. **Somente então** autorizar plano de implementação e mudanças de código, com ADRs e critérios verificáveis por marco.

## 20.11 Gate de prontidão do baseline para servir de fundação

O repositório poderá ser considerado baseline confiável para iniciar a implementação V3 quando todos os itens abaixo estiverem satisfeitos:

- [ ] Branch, commit, remotes e estado de trabalho verificados no repositório Git original.
- [ ] Build reproduzido em ambiente limpo, com problemas classificados como dependência, configuração ou código.
- [ ] Suíte de testes completa reproduzida e número de testes rastreável ao commit.
- [ ] `run-engine` testado em modo mock e em modo real, sem fallback ambíguo.
- [ ] Fluxos `jobs`, `checkpoint`, `resume` e `full-cycle` reproduzidos no snapshot atual.
- [ ] Limites exatos do job checkpoint documentados; OS-kill e exatamente-uma-vez continuam não alegados até serem testados.
- [ ] Hardening/ADR de autoridade, workspace, symlink e shell concluídos antes de autonomia operacional ampliada.
- [ ] Knowledge, Memory, Evidence, Event Log e Checkpoint mantidos em owners separados.
- [ ] Capability Registry/ProviderRouter mapeados sem duplicação; Agent Registry e Model Catalog especificados como conceitos separados.
- [ ] Contratos de adapter e capacidades reais dos agentes prioritários testados.
- [ ] Inconsistências documentais históricas marcadas sem apagar evidência anterior.

**Status no momento desta revisão:** a base arquitetural existe e `src/jobs/` está presente; o gate ainda não está aprovado, principalmente porque build/testes do snapshot não foram reproduzidos nesta sessão, provider bootstrap tem fallback de mock ambíguo e hardening de segurança continua necessário.

---

# 21. Decisões adicionais abertas após a reconciliação

Além das decisões de produto da seção 17, a inspeção do baseline exige resolver os seguintes pontos antes de congelar contratos técnicos:

1. **Modo de execução real:** qual CLI/flag/profile declara modo `mock`, `real` e `discovery`, e qual comportamento deve ocorrer quando nenhum provider real compatível estiver disponível? Recomendação: `real` deve falhar fechado, nunca cair silenciosamente em mock.
2. **Relação TaskGraph ↔ GraphStore:** confirmar que TaskGraph é o estado canônico de coordenação e GraphStore é o DAG de capabilities dentro de uma tarefa/run; definir IDs e reconciliação de estado sem duplicar conclusão.
3. **Agent Registry ↔ Capability Registry:** confirmar contratos separados para instância de agente e oferta de capability/provider, com vínculo explícito entre agente, provider, sessão e tarefa.
4. **Modo de aprovação:** `confirm` hoje pode virar falha imediata no Scheduler; a V3 precisa decidir como uma ação aguardando aprovação é persistida, notificada e retomada.
5. **Cobertura de autoridade em agentes externos:** definir níveis de controle por adapter e como a UI comunica ferramenta/ação que não pode ser mediada pelo Core.
6. **Modelo de isolamento:** decidir boundaries de filesystem, symlinks, process tree, env/segredos, rede e sandbox por plataforma. A decisão deve preceder qualquer promessa de autonomia irrestrita.
7. **Recovery guarantee:** delimitar quais falhas terão recuperação automática, quais exigem reconciliação do workspace e quais podem resultar em replay; não prometer exatamente-uma-vez sem prova.
8. **Fonte dos agentes especializados:** decidir quais Agent Markdown/Skills atuais serão convertidos em contratos de papel, quais continuarão sendo assets host-specific e quais devem ser substituídos por adapters nativos.
9. **Fronteira do subsistema EvolveLoop V1:** decidir se seu nome interno permanece `evolveloop` ou recebe novo namespace para evitar confusão com a plataforma V3.
10. **Licença e dependências:** resolver a incompatibilidade entre MIT no snapshot, a intenção não comercial e os direitos já concedidos; verificar proveniência/licenças de skills, agentes, MCPs e bibliotecas.

---

# 22. Conclusão da reconciliação

O baseline atual contém um núcleo real e reutilizável de execução: Capability IR, GraphStore, Scheduler, Capability/Provider Registry, ProviderRouter, PluginLoader, policies, authority, providers determinísticos, Evidence, EventBus, jobs/checkpoints, MemoryStore, KnowledgeStore, telemetry e um subsistema longitudinal de evolução. O `src/jobs/` está presente no ZIP atual; os relatórios que afirmam sua ausência descrevem uma cópia anterior e devem ser tratados como histórico, não como status do snapshot recebido.

O que ainda falta não é “mais um framework de agentes” dentro do mesmo engine. É um plano de coordenação durável acima do kernel existente: Goal Contract, TaskGraph de trabalho, Orquestrador-Mestre como serviço, hierarquia de líderes/planners/workers, Agent Registry, Delegation Contracts, Shared Work Ledger, Context Intelligence, Model/Agent Routing e Agent Continuity cross-provider. Esses componentes não devem duplicar as responsabilidades já cobertas pela V2.

A direção de migração fica definida assim:

- **Preservar:** IR, GraphStore, Scheduler, Capability/Provider Registry, providers, policies, Evidence, EventBus, jobs/checkpoints, Knowledge/Memory separados, skills/assets e Evolution V1 gated.
- **Evoluir:** ExecutionEngine, bootstrap de providers, Authority, checkpoints/jobs, EventBus/persistência, Evidence, Memory/Knowledge retrieval, telemetry e CLI.
- **Adicionar:** Coordinator Service, Goal Contract, Orchestration TaskGraph, Agent Registry, Delegation Contracts, Shared Work Ledger, Context Intelligence, decision/model routing e adapters para os agentes prioritários.
- **Não assumir pronto:** sandbox, compaction/reinject, RAG semântico local, roteamento Jev/OmniRoute, handoff cross-provider, TUI, background service, autonomia integrada e `TRUE FULL PASS` global.

**Decisão de transição:** a V2 será tratada como kernel de execução da V3, não como produto final nem como legado a ser descartado. A implementação da V3 só deve começar depois que o baseline for reproduzido, o ownership dos estados for aprovado e os gaps críticos de bootstrap/autoridade/continuidade estiverem representados em ADRs e critérios de aceitação.

---

## Atualização do encerramento

A versão 0.6 mantém a definição de produto da V3 e acrescenta uma reconciliação factual com o snapshot `langostino-evolveloop-20261109.zip`. Ela distingue código existente, integrações host-side, mecanismos parciais, decisões históricas, protótipos não executados e capacidades ainda ausentes. Nenhuma implementação foi realizada nesta etapa. A presença de código ou de testes no repositório não equivale, por si só, a uma validação reproduzida; onde a execução não foi possível, o documento registra a limitação explicitamente.
