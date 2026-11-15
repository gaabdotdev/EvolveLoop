EVOLVELOOP V4
Product & Architectural Constitution
The Operating System for Autonomous Work

VISÃO DE PRODUTO, PRINCÍPIOS, ARQUITETURA-ALVO E ROADMAP

Versão do documento: 0.1 | Data: 14 de novembro de 2026

Status: proposta estratégica para orientar o desenho e a execução da V4

“O trabalho pertence ao sistema — não ao agente, ao modelo, ao provedor ou à máquina que o executa.”

Documento-base para alinhamento de produto e arquitetura. Os módulos, contratos e fases descritos são propostas; não significam que já estejam implementados.
Como interpretar este documento
PREMISSA DE PLANEJAMENTO

Este documento parte do cenário hipotético em que a V3.7 foi aprovada e certificada. Essa premissa serve exclusivamente para planejar a V4; não altera nem substitui o estado real de certificação da V3.7.

Esta constituição consolida a visão discutida para a V4 do EvolveLoop. Seu propósito é manter uma tese de produto clara enquanto a arquitetura evolui, evitando que a versão se transforme em uma coleção desconexa de funcionalidades.

O texto distingue três categorias:
- Visão e princípios: propriedades que devem orientar decisões futuras.
- Capacidades propostas: mecanismos que a V4 deverá projetar, implementar e validar.
- Decisões em aberto: escolhas técnicas que dependem de investigação, protótipos e ADRs; não devem ser tratadas como definidas por este documento.
Este documento não é uma especificação final de APIs, banco de dados, protocolo ou cronograma. É a constituição de produto e arquitetura a partir da qual essas especificações deverão ser derivadas.
Índice
- 1. Visão e tese do produto
- 2. O problema que a V4 pretende resolver
- 3. Princípios inegociáveis
- 4. Objetivos e capacidades da V4
- 5. Modelo conceitual de trabalho
- 6. Arquitetura-alvo
- 7. Fluxos fundamentais
- 8. Proof-Carrying Work e WorkProof
- 9. Autonomia, segurança e governança
- 10. Experiência de desenvolvimento e operação
- 11. Roadmap proposto: V4.0 a V4.5
- 12. Demonstração de referência: The Impossible Handoff Test
- 13. Métricas e critérios de sucesso
- 14. Não objetivos e armadilhas a evitar
- 15. Riscos, premissas e decisões em aberto
- 16. Critérios de excelência e prontidão
- 17. Glossário
1. Visão e tese do produto
1.1. Visão
NORTH STAR

EvolveLoop — The Operating System for Autonomous Work. Uma infraestrutura na qual trabalhos complexos podem ser planejados, executados, inspecionados, transferidos, recuperados e comprovados, independentemente dos agentes, modelos, provedores, runtimes ou máquinas que os executam.

A V4 deve deslocar o centro de gravidade do produto. O EvolveLoop deixa de ser definido principalmente pela capacidade de coordenar agentes e passa a ser definido pela capacidade de gerenciar a continuidade e a integridade de trabalhos autônomos.
1.2. Tese central
O agente não é o proprietário do trabalho. O EvolveLoop é o proprietário do estado, dos objetivos, das restrições, dos efeitos registrados, dos artefatos e das evidências. Agentes são executores substituíveis, escolhidos conforme capacidade, disponibilidade, custo, política e contexto.

A plataforma deve permitir que um trabalho seja iniciado por um executor, continuado por outro e verificado por um terceiro, sem depender da memória interna de qualquer agente.
1.3. Promessa do produto
- Qualquer executor compatível pode iniciar ou assumir um trabalho com contexto operacional suficiente.
- Falhas de agentes, modelos, provedores, processos ou workers não destroem o trabalho já confirmado.
- Toda ação relevante e todo efeito externo têm origem, estado e resultado rastreáveis.
- Todo resultado final é acompanhado de evidências e limitações explícitas.
- O sistema escolhe e adapta estratégias com base em resultados observados, não em alegações dos executores.
- O usuário administra objetivos, políticas e resultados; o EvolveLoop administra a execução.
1.4. Posicionamento
O EvolveLoop não deve se posicionar como “mais um framework de agentes”, “um swarm maior” ou apenas “um roteador de modelos”. A posição pretendida é uma plataforma de execução autônoma durável, heterogênea, verificável e governável.
2. O problema que a V4 pretende resolver
Sistemas orientados a agentes frequentemente tratam o processo de execução como algo pertencente à sessão ou ao contexto do agente. Isso torna o trabalho vulnerável a limites de contexto, falhas de processo, indisponibilidade de provider, perda de worker, execução duplicada e transferência incompleta.
Problema  Consequência  Resposta pretendida da V4
Estado preso à conversa ou ao agente  A troca de executor perde contexto ou exige reconstrução manual.  Work State explícito e Execution Capsule portátil.
Retomada baseada em resumo textual  O próximo agente não sabe o que foi realmente concluído.  Estado estruturado, checkpoints, artefatos e evidências.
Efeitos externos pouco rastreados  Retries podem repetir operações ou criar inconsistência.  Effect Ledger, idempotência e reconciliação.
Conclusão declarada pelo próprio executor  “Terminei” pode não corresponder a um resultado correto.  Critérios de aceitação e verificação independente.
Seleção estática de executores  Custo, qualidade e confiabilidade variam por tarefa.  Capability Intelligence e Adaptive Execution.
Falhas tratadas como retry genérico  A estratégia pode repetir o mesmo erro ou ampliar o dano.  Self-Healing Execution orientado ao estado e à causa.
Baixa rastreabilidade de decisões  Difícil auditar, depurar ou explicar resultados.  Event Ledger, Provenance Graph e Time Travel.

PONTO DE DIFERENCIAÇÃO

A vantagem não está em ter mais agentes trabalhando ao mesmo tempo. Está em preservar a integridade do trabalho e entregar resultados comprováveis mesmo quando os executores mudam ou falham.

3. Princípios inegociáveis
O trabalho pertence à plataforma
O estado do trabalho não pode depender da memória privada de uma sessão, modelo ou processo.
Executores são substituíveis
Agentes, modelos, providers e máquinas podem mudar desde que cumpram contratos e políticas.
Estado explícito supera memória implícita
Progresso, decisões, dependências, efeitos e evidências precisam ser representados de forma consultável.
Evidência supera afirmação
Um executor não pode aprovar o próprio resultado apenas declarando que terminou.
Recuperação preserva integridade
Continuar não significa simplesmente repetir. O sistema deve reconciliar o que ocorreu antes de agir.
Autonomia é limitada por política
A capacidade de raciocinar não implica autorização para executar qualquer ação.
Otimizar resultado, não chamadas
A unidade econômica é o custo total por resultado verificado, não o preço isolado de uma chamada de LLM.
Falhas são estados de primeira classe
Timeout, incerteza, indisponibilidade, revogação e resultado parcial precisam ser modelados, não escondidos.
Interoperabilidade sem acoplamento cego
O EvolveLoop deve integrar agentes e ferramentas externas por contratos claros, preservando suas próprias garantias.
Complexidade deve ter justificativa
Agentes, camadas e serviços só entram quando melhoram uma propriedade mensurável do sistema.
4. Objetivos e capacidades da V4
As capacidades abaixo formam o escopo conceitual da V4. Elas se complementam; não devem ser implementadas como módulos isolados sem contratos de integração.
4.1. Work Continuity Engine
Núcleo da proposta: preservar o trabalho e permitir que ele continue apesar da substituição ou falha do executor.
- Persistir objetivo, critérios de aceitação, grafo de tarefas, dependências, decisões, artefatos e estado de execução.
- Separar progresso confirmado de hipóteses, tentativas, resultados não verificados e operações em estado desconhecido.
- Criar checkpoints suficientes para recuperar o trabalho sem depender de reconstrução a partir de conversas.
- Permitir retomada, replanejamento e transferência entre executores heterogêneos.
4.2. Goal Compiler
Transformar intenção do usuário em um contrato executável antes de iniciar consumo significativo de recursos. O contrato deve conter objetivo, escopo, restrições, critérios de aceitação, riscos, dependências, orçamento, prazo quando informado, nível de autonomia e condições de parada.

O Goal Compiler deve detectar ambiguidades e contradições. Quando a definição do objetivo for insuficiente, deve perguntar o mínimo necessário ou declarar as premissas assumidas. Não deve converter uma instrução vaga em critérios inventados sem torná-los visíveis.

Exemplo conceitual de contrato:
goal:
  description: "Build a financial management SaaS"
  constraints:
    budget: 50.00
    security: strict
    deployment: local
  acceptance:
    - authentication works
    - transactions persist
    - automated tests pass
    - no critical vulnerabilities
  execution:
    autonomy: supervised
    verification: independent
    recovery: enabled
4.3. Execution Capsule e Universal Handoff
Execution Capsule é a representação portátil do estado necessário para outro executor continuar um trabalho. Deve carregar referências verificáveis a objetivos, tarefas, estado, decisões, contexto relevante, artefatos, restrições, permissões delegáveis e pendências.
- Transferir trabalhos entre modelos e providers.
- Transferir entre frameworks e runtimes compatíveis.
- Transferir entre workers e hosts.
- Declarar explicitamente o que não foi preservado ou não pode ser transferido.
- Excluir segredos e credenciais permanentes; fornecer acesso temporário por mecanismos de autorização próprios.
- Validar a integridade e a versão da cápsula antes do handoff.
4.4. Effect Ledger
Registro de efeitos internos e externos produzidos durante o trabalho: criação de branches, commits, migrações, pull requests, notificações, publicações, deployments e demais ações relevantes.

Cada efeito deve registrar identificador, executor, intenção, autorização, referência do recurso, estado de confirmação, evidência observada e política de repetição ou compensação. Estados como COMMITTED, REJECTED, UNKNOWN e NOT_EXECUTED devem ter semântica precisa.
REGRA DE INTEGRIDADE

Não prometer exactly-once universal. Para efeitos externos, combinar idempotency keys quando disponíveis, deduplicação, reconciliação e compensação explícita. Quando o resultado for incerto, bloquear repetição cega e investigar o estado real.

4.5. Self-Healing Execution
O sistema deve classificar falhas e escolher estratégias diferentes. Exemplos: limite de contexto exige handoff; rate limit pode exigir espera ou provider alternativo; processo encerrado exige checkpoint; worker indisponível pode exigir realocação; resultado inválido exige revisão ou correção; dependência externa indisponível pode exigir suspensão; falha de segurança exige bloqueio e eventual intervenção humana.

A recuperação deve considerar estado, efeitos já realizados, permissões, risco de duplicação, custo restante e critérios de aceitação. Retry é uma opção, não a política universal.
4.6. Time Travel Execution
Oferecer inspeção temporal de uma execução e capacidade de criar forks a partir de estados anteriores. O usuário deve poder entender decisões, entradas, ferramentas, resultados, traces, artefatos e mudanças de estado em uma linha do tempo.

Um fork deve preservar o estado-base e permitir variar modelo, executor, estratégia ou plano sem destruir a execução original. “Replay” precisa distinguir reprodução determinística de reexecução sujeita à variabilidade de modelos e serviços externos. Efeitos colaterais não devem ser reaplicados automaticamente durante replay.
4.7. Dynamic Planning Engine
O plano deve ser reavaliado quando surgirem novas evidências, dependências falharem, recursos mudarem ou uma estratégia deixar de progredir. O sistema deve identificar caminho crítico, tarefas independentes, riscos, bloqueios, custo restante e impacto de mudanças.
4.8. Capability Intelligence
Manter perfis de capacidade de modelos, agentes, tools, runtimes e workers com base em evidências observadas. Avaliar desempenho por categoria de trabalho, taxa de sucesso, qualidade validada, latência, custo, estabilidade e taxa de recuperação.

Scores precisam conter proveniência, amostragem, incerteza e recência. Não aceitar autoavaliação de agente como fonte suficiente. Evitar rankings absolutos sem controle de contexto e benchmark comparável.
4.9. Adaptive Execution Intelligence
Escolher e adaptar executores, modelos, ferramentas, workers, contexto e estratégia ao longo da execução. A otimização deve equilibrar qualidade, custo, latência, risco, disponibilidade e probabilidade de conclusão. A métrica principal é custo total por resultado comprovadamente correto.
4.10. Autonomous Policy Engine
Aplicar autorizações granulares e contextuais. O nível de autonomia é definido por trabalho, executor, recurso, ação e risco; não é uma permissão global do agente.
Nível conceitual  Comportamento  Exemplo
L0 — Observe  Leitura, análise e recomendação; sem efeitos de escrita.  Inspecionar repositório e propor alterações.
L1 — Execute  Ações previamente autorizadas e de baixo risco.  Editar workspace isolado e executar testes.
L2 — Supervised  Ações sensíveis exigem aprovação humana.  Criar pull request ou alterar configuração compartilhada.
L3 — Autonomous  Autonomia ampliada dentro de políticas, limites e auditoria explícitos.  Executar rollout limitado com rollback e limites aprovados.

A política deve considerar escopo de arquivos, ferramentas, rede, credenciais temporárias, limites financeiros, quantidade de chamadas, recursos computacionais, duração, ambiente e capacidade de revogação imediata.
4.11. Proof-Carrying Work e WorkProof
Cada entrega importante deve carregar um pacote de evidências ligado ao objetivo e aos critérios de aceitação: artefatos, testes, resultados de validação, origem dos dados, execuções, permissões, efeitos externos e limitações conhecidas.

O status de uma entrega não pode ser reduzido a “concluído” sem qualificação. Deve distinguir o que foi provado, parcialmente provado, falhou ou permanece sem verificação.
4.12. Trust and Provenance Graph
Representar relações entre objetivos, requisitos, decisões, fontes, agentes, permissões, ferramentas, artefatos, execuções e evidências. Permitir responder: de onde veio esta decisão? Qual executor alterou este artefato? Qual teste comprova este requisito? Qual permissão autorizou esta ação?
4.13. Predictive Observability e Continuous Evaluation
Evoluir o Measurement Plane para detectar loops improdutivos, estagnação, custo anormal, degradação de qualidade, mudanças de comportamento de providers e risco de falha. Avaliações contínuas devem usar conjuntos de testes e benchmarks versionados, comparáveis e com proveniência explícita.
4.14. Elastic Compute Fabric
Expandir a execução além de máquinas permanentes: workers locais, servidores próprios, cloud e recursos temporários, respeitando localização de dados, confiança, custo, compatibilidade de runtime e políticas de segurança.
4.15. Agent and Runtime Ecosystem
Oferecer contratos de integração, SDKs, manifests e testes de conformidade para executores, runtimes, agentes e ferramentas de terceiros. Interoperabilidade deve ser pragmática: reutilizar padrões e protocolos adequados, mantendo as garantias centrais do EvolveLoop.
4.16. Unified Control Center
Criar uma interface operacional para inspecionar e controlar trabalhos, agentes, executores, máquinas, custos, decisões, aprovações, falhas, efeitos e recuperação. O centro de controle deve permitir intervir e depurar, não apenas visualizar métricas.
5. Modelo conceitual de trabalho
Os nomes abaixo são conceitos de domínio, não schemas finais. Cada um deverá ganhar contrato versionado, invariantes, migração e testes quando o desenho técnico for iniciado.
Conceito  Responsabilidade  Invariantes esperadas
Goal Contract  Representar intenção, restrições e aceitação.  Versionado; critérios explícitos; premissas visíveis.
Work  Unidade durável que mantém o objetivo e o estado global.  Identidade estável; histórico preservado; proprietário é a plataforma.
Task  Unidade de trabalho com dependências e resultado esperado.  Estados válidos; critérios de conclusão; dependências rastreáveis.
Execution  Tentativa concreta realizada por um executor.  Executor, versão, contexto, custo e resultado rastreáveis.
Executor  Agente, modelo, provider, runtime ou worker que executa.  Identidade, capabilities, versão, confiança e permissões definidas.
Execution Capsule  Pacote para transferência de trabalho.  Integridade verificável; sem segredos permanentes; compatibilidade declarada.
Checkpoint  Estado recuperável em um ponto da execução.  Consistência entre estado, eventos, artefatos e efeitos.
Effect Record  Registro de efeito colateral ou operação externa.  Estado de confirmação explícito; política de retry/compensação.
Artifact  Arquivo, pacote, output ou referência produzida.  Hash, origem, integridade, acesso e retenção definidos.
Evidence  Prova associada a requisito ou resultado.  Fonte, timestamp, executor, método e limite de validade conhecidos.
WorkProof  Síntese verificável da conformidade do trabalho.  Rastreável ao Goal Contract e aos artefatos testados.
Policy  Regras de permissão e autonomia.  Negação por padrão; escopo mínimo; auditoria e revogação.
Capability Profile  Histórico observado de competência do executor.  Proveniência, amostra, incerteza e validade temporal.
Work Event  Evento imutável ou append-only que descreve transição/ação.  Identidade, ordenação, deduplicação e versão de schema.

6. Arquitetura-alvo
A arquitetura deverá separar intenção, continuidade, inteligência, execução e prova. As camadas não devem se tornar silos: os contratos entre elas precisam ser explícitos e atravessados por identidade, políticas, persistência e observabilidade.
Camada  Responsabilidade  Componentes conceituais
Intent & Goal Layer  Traduzir intenção em compromisso executável.  Goal Compiler, Goal Contract, ambiguity resolution, acceptance criteria.
Work Continuity Layer  Ser a fonte de verdade do trabalho.  Work State, Execution Capsule, checkpoints, Effect Ledger, recovery.
Intelligence Layer  Planejar e otimizar a execução.  Dynamic Planning, Capability Intelligence, routing, strategy adaptation.
Distributed Execution Layer  Executar em recursos heterogêneos.  Control Plane, Worker Runtime, agents, providers, tools, compute fabric.
Proof & Governance Layer  Controlar autoridade e verificar resultados.  Policy Engine, WorkProof, independent verification, audit, approval.

6.1. Capacidades horizontais
- Event Ledger e contratos de eventos versionados.
- Measurement Plane e telemetria com proveniência.
- Identity, authentication, authorization e secrets management.
- Persistência, snapshots, retenção, backup e recuperação.
- Artifact store e integridade criptográfica.
- SDK, CLI, APIs, integrações e interface operacional.
- Auditoria e governança de mudanças.
6.2. Fronteiras arquiteturais
O Control Plane deve manter coordenação e autoridade; Worker Runtime deve executar sob contratos e permissões limitadas. O armazenamento de estado do trabalho não deve ser confundido com memória de modelo. O registro de eventos não substitui a semântica de domínio. O Measurement Plane observa e mede, mas não deve inventar fatos nem controlar estado de negócio sem contrato explícito.
6.3. Relação com a V3.7
A V3.7, assumida aqui como baseline certificada, fornece a base distribuída: registry/trust, protocolo, workers, placement, leases/fencing, artifacts e coordenação multi-host. A V4 deve reutilizar essas garantias e evoluir a camada acima delas. Não reimplementar funcionalidades existentes sem razão arquitetural e plano de migração.
7. Fluxos fundamentais
7.1. De intenção a resultado comprovado
01. Usuário envia objetivo e contexto.

02. Goal Compiler produz o Goal Contract e expõe ambiguidades.

03. Planner constrói grafo de tarefas, dependências, riscos e critérios.

04. Policy Engine determina permissões e nível de autonomia.

05. Scheduler seleciona executores com base em capacidade, custo e política.

06. Executores produzem eventos, artefatos e Effect Records.

07. Work Continuity persiste checkpoints e estado confirmado.

08. Verifier valida critérios por evidências independentes.

09. WorkProof consolida provas, limitações e resultado final.

7.2. Recuperação após falha
01. Detectar e classificar a falha.

02. Congelar ou isolar a execução afetada quando houver risco de inconsistência.

03. Carregar o último estado recuperável e reconciliar eventos e efeitos externos.

04. Identificar tarefas confirmadas, incompletas, desconhecidas e obsoletas.

05. Decidir entre retry, handoff, replanejamento, compensação ou intervenção humana.

06. Emitir nova Execution Capsule e transferir para executor compatível.

07. Validar a retomada e impedir commits obsoletos por fencing.

08. Registrar a recuperação e atualizar métricas de confiabilidade.

7.3. Efeito externo incerto
Se um executor cair após enviar uma operação a um serviço externo, mas antes de receber confirmação, o sistema deve registrar UNKNOWN. Antes de repetir, deve consultar o destino, usar uma chave de idempotência ou aplicar procedimento de reconciliação. Se não houver forma segura de determinar o estado, suspender e solicitar intervenção apropriada.
7.4. Time travel e fork
O usuário escolhe um checkpoint, inspeciona o estado que o compõe e cria um fork isolado. O fork recebe identidade própria, referencia o estado-base e declara quais entradas são reproduzidas, quais são reexecutadas e quais efeitos externos estão desabilitados ou exigem nova autorização.
8. Proof-Carrying Work e WorkProof
Proof-Carrying Work é a tese de que o resultado deve ser acompanhado de evidências suficientes para uma pessoa ou sistema independente avaliar o que foi feito e o quanto os critérios foram satisfeitos.
8.1. Estrutura conceitual
interface WorkProof {
  workId: string;
  goalContractRef: string;
  requirements: RequirementProof[];
  artifacts: ArtifactProof[];
  executions: ExecutionEvidence[];
  validations: ValidationResult[];
  externalEffects: EffectRecord[];
  provenance: ProvenanceRecord[];
  limitations: string[];
  finalStatus: "PROVEN" | "PARTIAL" | "FAILED" | "UNVERIFIED";
}
A estrutura acima é ilustrativa e deverá ser refinada. O princípio obrigatório é manter vínculo entre requisito, evidência, método de validação, artefato e versão de código testada.
8.2. Requisitos mínimos de evidência
- Identidade do trabalho e versão do Goal Contract.
- Requisito avaliado e critério de aceitação correspondente.
- Artefato e hash ou referência imutável.
- Executor, runtime, ambiente e versão relevantes.
- Teste ou método de validação, incluindo resultado e logs suficientes.
- Proveniência e timestamp.
- Limites do que a evidência não comprova.
- Identificação de verificadores independentes quando aplicável.
8.3. Estados de prova
Estado  Significado
PROVEN  Os critérios definidos foram comprovados pelas evidências exigidas.
PARTIAL  Parte dos critérios foi comprovada; há lacunas explicitadas.
FAILED  A validação demonstrou que um ou mais critérios não foram atendidos.
UNVERIFIED  Não há evidência suficiente para concluir sobre o critério.

REGRA DE HONESTIDADE

Nenhum componente pode promover PARTIAL ou UNVERIFIED para PROVEN com base em opinião, ausência de erro ou declaração do próprio agente. Evidências podem ser insuficientes, vencidas ou incompatíveis com o artefato atual.

9. Autonomia, segurança e governança
9.1. Autonomia por capacidade e contexto
Os níveis L0–L3 são um vocabulário inicial, não uma política completa. A autorização efetiva deve ser definida pela combinação de identidade do executor, trabalho, ação, recurso, ambiente, risco e limites. A autonomia não deve escalar automaticamente apenas porque um agente concluiu tarefas anteriores.
9.2. Segurança por padrão
- Least privilege para agentes, tools e workers.
- Credenciais temporárias, delimitadas e revogáveis.
- Segredos fora de Execution Capsules, logs e WorkProof.
- Sandbox e isolamento por tarefa conforme risco.
- Controle de rede, filesystem, processos e recursos.
- Aprovação humana para efeitos sensíveis quando exigido.
- Proteção contra prompt injection e instruções não confiáveis em artefatos/fontes.
- Auditoria de quem autorizou, executou e confirmou cada efeito.
- Separação entre dados observados e instruções de controle.
9.3. Falhas de segurança
Uma violação ou incerteza de segurança deve interromper o caminho perigoso, preservar evidências, revogar capacidades quando necessário e exigir recuperação segura. A plataforma deve preferir falhar fechada em operações privilegiadas, sem tornar tarefas comuns inutilizáveis por controles excessivamente amplos.
9.4. Governança de políticas
Políticas devem ser versionadas, testáveis, auditáveis e vinculadas à execução. Uma alteração de política durante um trabalho deve ter semântica explícita: afetar novas ações, interromper ações em curso ou exigir reavaliação. Não se deve presumir que uma permissão concedida no início continue válida indefinidamente.
10. Experiência de desenvolvimento e operação
10.1. Interface principal por objetivos e trabalhos
O usuário deve interagir principalmente com objetivos, trabalhos e resultados. Agentes, modelos, workers e traces continuam visíveis para inspeção, mas não devem ser o principal modelo mental para usuários comuns.
10.2. Control Center
- Visão de trabalhos ativos, suspensos, bloqueados e concluídos.
- Linha do tempo de decisões, tarefas, eventos e efeitos.
- Mapa de executores e recursos disponíveis.
- Custo, latência, qualidade e risco por trabalho.
- Fila de aprovações e permissões temporárias.
- Comparação de forks e execuções alternativas.
- Inspeção do WorkProof e gaps de evidência.
- Ações de pause, resume, cancel, handoff, fork e retry com semântica clara.
10.3. CLI, SDK e APIs
A CLI deve ser excelente para automação e diagnóstico; o SDK deve permitir integrar aplicações e runtimes; APIs devem expor contratos estáveis e versionados. A experiência visual não deve ser pré-requisito para operar a plataforma.
10.4. Debugar sem lutar contra a plataforma
Cada trabalho deve permitir responder rapidamente: o que está acontecendo, por que está parado, o que foi confirmado, o que pode ser repetido com segurança, quem possui autoridade e quais evidências sustentam o estado atual.
11. Roadmap proposto: V4.0 a V4.5
O roadmap organiza dependências e valor incremental. As fases são marcos conceituais, não compromissos de calendário. A ordem pode ser ajustada por evidências técnicas, desde que a tese central seja preservada.
Marco  Foco  Entregáveis centrais  Critério de saída
V4.0 — Work Substrate  Fundação durável do trabalho.  Goal Contract, Work State, Work Events, checkpoints, Execution Capsule inicial, Effect Ledger inicial e WorkProof mínimo.  Trabalhos podem ser descritos em estado estruturado, persistidos, recuperados e auditados em fluxo vertical simples.
V4.1 — Continuity & Time Travel  Transferência e recuperação.  Universal Handoff, recovery engine, replay controlado, snapshots, forks e reconciliação de efeitos.  Um trabalho real sobrevive a falhas e muda de executor sem perder estado confirmado nem repetir efeitos indevidos.
V4.2 — Adaptive Intelligence  Planejamento e otimização.  Dynamic Planning, Capability Intelligence, routing adaptativo, análise de progresso e otimização por resultado.  Decisões adaptativas demonstram melhoria mensurável em qualidade, custo ou conclusão contra baseline.
V4.3 — Trust & Governance  Autonomia segura.  Policy Engine, permissões granulares, credenciais temporárias, aprovação, revogação e Trust/Provenance Graph.  Ações sensíveis são autorizadas, limitadas, auditadas e revogáveis em cenários adversariais.
V4.4 — Autonomous Engineering  Primeiro domínio de excelência.  Workflows de engenharia: planejamento, implementação, testes, revisão, correção, entrega e operação.  Workloads de software reais são concluídos com WorkProof e comparações reprodutíveis.
V4.5 — Ecosystem & Control Center  Abertura e operação em escala.  SDK, manifests, conformidade de runtimes, integrações externas, Elastic Compute Fabric e Control Center.  Terceiros integram executores sem quebrar segurança, rastreabilidade ou continuidade.

11.1. Dependências críticas
- V4.0 precisa definir os contratos do Work, eventos, checkpoints e efeitos antes de ampliar a inteligência adaptativa.
- Time Travel depende de histórico consistente, snapshots e semântica clara de efeitos externos.
- Capability Intelligence depende de benchmarks confiáveis, resultados observados e proveniência.
- Autonomia ampliada depende de identidade, políticas, sandbox, revogação e auditabilidade maduros.
- Marketplace/ecossistema depende de contratos versionados e testes de conformidade.
- O Control Center deve acompanhar as capacidades operacionais reais; não inventar visualizações que o backend não consegue sustentar.
12. Demonstração de referência: The Impossible Handoff Test
Esta demonstração deve ser o teste emblemático da tese da V4. O objetivo não é mostrar muitos agentes em paralelo; é demonstrar que um trabalho complexo permanece íntegro apesar de falhas deliberadas e mudanças de executor.
12.1. Cenário
O usuário solicita a construção de um serviço de software real. O EvolveLoop compila o objetivo, planeja o trabalho, distribui tarefas e mantém estado, efeitos e evidências. Durante a execução, o ambiente introduz falhas controladas:
01. O modelo atinge o limite de contexto.

02. Um agente é encerrado à força.

03. Um worker fica indisponível.

04. O provider original torna-se indisponível.

05. Um resultado duplicado é entregue.

06. Um agente anterior produz uma alteração incorreta.

12.2. Comportamento esperado
- Preservar o progresso confirmado e identificar o estado não confirmado.
- Determinar quais efeitos externos já ocorreram, quais não ocorreram e quais estão incertos.
- Impedir commits obsoletos ou duplicações indevidas.
- Criar Execution Capsule e transferir o trabalho para executores compatíveis.
- Replanejar tarefas afetadas sem reiniciar trabalho saudável desnecessariamente.
- Detectar e rejeitar a alteração inválida ou encaminhá-la para correção.
- Executar novamente as validações relevantes.
- Entregar o resultado final com WorkProof, limitações e custo de recuperação.
12.3. Métricas da demonstração
A demonstração deve usar workloads, provedores, workers e serviços externos reais. Mocks podem cobrir componentes isolados, mas não podem ser apresentados como prova de continuidade ponta a ponta.
Métrica  O que mede  Critério desejado
Perda de progresso confirmado  Trabalho confirmado que se perde durante falhas.  Zero perda de estado/artefatos confirmados dentro do modelo de durabilidade declarado.
Efeitos duplicados indevidos  Ações externas repetidas sem autorização ou idempotência.  Zero duplicação em operações cobertas por idempotência; casos ambíguos devem ser reconciliados ou bloqueados.
Handoff success rate  Transferências que retomam corretamente.  Meta definida por workload e ambiente, com amostra estatística.
Recovery time  Tempo entre falha detectada e retomada válida.  Medido por classe de falha; metas SLO definidas após baseline.
Verified completion  Trabalhos que atendem critérios após recuperação.  Todos os critérios obrigatórios verificados ou explicitamente reportados como não atendidos.
Recovery cost  Custo incremental da recuperação.  Medido e comparado ao baseline sem recuperação automatizada.

13. Métricas e critérios de sucesso
A V4 precisa medir propriedades do produto, não apenas atividade interna. Contagem de agentes, chamadas, tokens ou tarefas não é, isoladamente, prova de valor.
Dimensão  Métricas candidatas  Cuidados
Continuidade  Taxa de handoff bem-sucedido; perda de estado confirmado; tempo de recuperação.  Separar classes de falha e tipos de executor.
Qualidade  Taxa de aceitação independente; defeitos pós-entrega; regressões.  Benchmark e critérios precisam ser versionados.
Economia  Custo por resultado verificado; custo de recuperação; desperdício em tarefas sem progresso.  Incluir retries, verificação e overhead da plataforma.
Eficiência  Latência total; tempo em fila; utilização; tempo até primeiro resultado útil.  Não otimizar latência sacrificando qualidade ou segurança.
Segurança  Violações de política; ações não autorizadas; tempo de revogação; exposição de segredo.  Testar adversarialmente e auditar falsos negativos.
Verificabilidade  Cobertura de requisitos por evidência; provas vencidas; gaps de proveniência.  Uma evidência não deve provar além do seu escopo.
Interoperabilidade  Executores compatíveis; sucesso de integração; falhas de contrato.  Compatibilidade deve ter matriz e conformidade.
Experiência  Intervenções humanas por trabalho; tempo para entender bloqueio; esforço operacional.  A autonomia não pode esconder incerteza do usuário.

13.1. Baselines e comparações
Toda alegação de melhoria deve comparar a V4 com um baseline explícito: execução manual, pipeline tradicional ou outra plataforma equivalente, conforme o caso. Usar workload, critérios, ambiente, modelo, configuração e amostra comparáveis. Reportar dispersão e limitações; evitar benchmarks escolhidos apenas por favorecer o EvolveLoop.
13.2. Unidade principal de otimização
MÉTRICA NORTE

Custo total para entregar um resultado comprovadamente correto, respeitando prazo, risco e restrições. O cálculo deve incluir execução, retries, coordenação, verificação, recuperação e operação da plataforma.

14. Não objetivos e armadilhas a evitar
Não objetivo  Por que evitar  Alternativa
Treinar um LLM próprio como centro da V4.  Desvia foco para competição de modelos e infraestrutura de treinamento.  Integrar os melhores executores disponíveis e manter portabilidade.
Maximizar quantidade de agentes.  Mais agentes podem aumentar custo, latência, conflito e dificuldade de depuração.  Selecionar o menor conjunto de executores capaz de cumprir o objetivo.
Criar marketplace cedo demais.  Ecossistema sem contratos e segurança aumenta risco operacional.  Primeiro estabilizar manifests, SDK, identidade e conformidade.
Construir um dashboard gigante antes do motor.  Uma interface não compensa estado, recuperação e provas frágeis.  Control Center evolui junto com capacidades reais do backend.
Substituir padrões úteis por protocolos proprietários sem motivo.  Aumenta custo de integração e lock-in.  Adotar padrões adequados e manter diferenciais nos contratos de trabalho.
Prometer autonomia irrestrita.  Aumenta risco de efeitos não autorizados.  Autonomia contextual, limites explícitos e revogação.
Prometer exactly-once universal.  Sistemas externos podem não fornecer confirmação transacional.  Idempotência, reconciliação, deduplicação e compensação.
Confundir replay com determinismo absoluto.  Modelos e serviços externos podem variar.  Capturar entradas/resultados e declarar o que é reproduzível.

15. Riscos, premissas e decisões em aberto
15.1. Riscos principais
- Complexidade excessiva: o escopo pode crescer além da capacidade de manter contratos coerentes. Mitigação: V4.0 vertical slice, ADRs e critérios de saída por marco.
- Estado inconsistente: eventos, snapshots, artifacts e efeitos podem divergir. Mitigação: invariantes, reconciliação e testes de crash/fault injection.
- Falsa confiança em evidências: testes podem passar sem provar o requisito real. Mitigação: rastreabilidade requisito-evidência e revisão independente.
- Autonomia perigosa: permissões podem ser mais amplas do que o necessário. Mitigação: least privilege, credenciais efêmeras e políticas versionadas.
- Capability scoring enviesado: avaliações podem não generalizar para todos os workloads. Mitigação: amostras contextualizadas, incerteza e testes contínuos.
- Overhead da plataforma: continuidade e provas podem custar mais do que o valor gerado. Mitigação: medir overhead e otimizar por resultado verificado.
- Interoperabilidade superficial: aceitar muitos frameworks pode criar uma matriz impossível de manter. Mitigação: contratos mínimos e níveis explícitos de conformidade.
15.2. Decisões técnicas ainda abertas
As decisões abaixo devem ser tratadas por investigação, protótipos e ADRs durante o desenho da V4. Este documento não fixa respostas prematuras.
Tema  Pergunta a resolver
Event Ledger  Append-only puro, event sourcing seletivo ou abordagem híbrida? Qual a política de retenção e compactação?
Persistência  Quais garantias transacionais são necessárias entre estado, eventos, checkpoints e artifacts?
Checkpoint  Qual é o limite entre checkpoint de workflow, snapshot de workspace e estado de conversa/contexto?
Execution Capsule  Como versionar, assinar, compatibilizar e validar cápsulas entre versões e runtimes?
Fork e replay  Quais dados são copiados, referenciados ou reexecutados? Como neutralizar efeitos colaterais?
Effect Ledger  Como representar confirmação parcial, UNKNOWN, compensação e reconciliação por tipo de integração?
Verificação independente  Como separar executor e verificador? Quando usar regras determinísticas, testes, outro modelo ou humano?
Capability Intelligence  Qual metodologia de avaliação e como controlar recência, amostra, variância e mudança de provider?
Policy Engine  Qual linguagem de policy, modelo de decisão, cache e semântica de alteração/revogação?
Elastic Compute  Como modelar custos, confiança, residência de dados, provisionamento e descarte de workers temporários?
Interoperabilidade  Quais protocolos e frameworks serão suportados oficialmente e em quais níveis de conformidade?
Multi-tenancy  Quais garantias de isolamento, quotas e governança são necessárias para uso por múltiplos usuários/equipes?

15.3. Hipóteses que precisam ser provadas
- A continuidade estruturada reduz perdas e esforço de recuperação em workloads reais.
- Universal Handoff entre executores heterogêneos é confiável sem depender de resumos frágeis.
- O WorkProof aumenta a confiança e reduz o esforço de revisão humana.
- O roteamento adaptativo reduz custo por resultado correto sem degradar a qualidade.
- A plataforma consegue manter overhead aceitável em relação ao valor da recuperação e verificação.
- Desenvolvimento de software é um domínio inicial forte para provar a tese antes de ampliar para outros tipos de trabalho.
16. Critérios de excelência e prontidão
“Perfeição” não é um estado técnico mensurável. Para a V4, o objetivo deve ser excelência operacional demonstrável: propriedades explícitas, métricas, testes adversariais, evidências e limitações transparentes.
Propriedade  Pergunta de aceitação
Continuidade  O trabalho confirmado sobrevive a falhas sem depender da memória de um agente?
Portabilidade  Um executor compatível consegue assumir o trabalho sem reconstrução manual?
Integridade  O sistema evita efeitos duplicados indevidos e commits obsoletos?
Segurança  Cada executor só consegue realizar ações autorizadas e revogáveis?
Adaptabilidade  O sistema muda estratégia com base em evidências e não em heurísticas ocultas?
Verificabilidade  Cada resultado importante possui evidências rastreáveis aos critérios?
Economia  O custo por resultado verificado melhora contra um baseline justo?
Interoperabilidade  Executores externos podem integrar-se sem quebrar as garantias centrais?
Operabilidade  Desenvolvedores conseguem diagnosticar, pausar, recuperar e auditar trabalhos?
Experiência  O usuário administra objetivos e resultados sem precisar operar manualmente cada agente?

16.1. Definição de V4 pronta para lançamento
- Os contratos centrais estão documentados, versionados e testados.
- Os fluxos verticais de objetivo a WorkProof funcionam em workloads reais.
- O Impossible Handoff Test passa com falhas deliberadas e resultados reproduzíveis.
- Os limites de segurança e autonomia foram testados adversarialmente.
- A recuperação e o Effect Ledger foram validados com serviços externos reais relevantes.
- Os resultados são comparados com baseline transparente.
- A auditoria independente não encontra falhas críticas ou altas abertas no escopo.
- As limitações conhecidas estão documentadas e não são mascaradas como capacidades.
- Existe plano de migração e compatibilidade com a base certificada da V3.7.
16.2. A alegação que a plataforma deve conseguir sustentar
PROMESSA VERIFICÁVEL

O EvolveLoop consegue assumir responsabilidade operacional por um trabalho complexo: entender o objetivo, organizar a execução, sobreviver a falhas, mudar de executor, controlar efeitos, respeitar permissões e apresentar provas do resultado — dentro de limites declarados e testados.

17. Glossário
Termo  Definição neste documento
Autonomous Work  Trabalho complexo cuja execução é administrada pela plataforma, sob objetivo e políticas explícitos.
Work Continuity  Preservação do estado e capacidade de retomar um trabalho apesar de falhas ou troca de executor.
Goal Contract  Representação estruturada do objetivo, restrições e critérios de aceitação.
Execution Capsule  Pacote portátil e verificável do estado necessário para um executor assumir o trabalho.
Effect Ledger  Registro dos efeitos e operações externas, incluindo confirmação, incerteza e compensação.
WorkProof  Conjunto estruturado de evidências que sustenta o status de um trabalho.
Proof-Carrying Work  Princípio de entregar resultado acompanhado de evidências rastreáveis.
Time Travel Execution  Inspeção histórica, replay controlado e criação de forks a partir de checkpoints.
Capability Intelligence  Perfil de capacidade de executores com base em resultados observados e contextualizados.
Adaptive Execution  Seleção e alteração dinâmica de executores, estratégia e recursos para otimizar o resultado.
Control Plane  Componente que coordena, aplica políticas e mantém autoridade sobre a execução distribuída.
Worker Runtime  Ambiente que executa tarefas sob contratos, isolamento e permissões definidos.
Measurement Plane  Camada de observação e medição com proveniência explícita dos dados.
Provenance  Origem e cadeia de responsabilidade de dados, decisões, artefatos e evidências.
UNKNOWN effect  Operação cujo resultado externo não pôde ser confirmado nem negado com segurança.

Encerramento
A V4 deve ser avaliada por uma pergunta simples: o EvolveLoop consegue garantir continuidade, integridade e prova de um trabalho complexo, mesmo quando os executores mudam ou falham?

Se a resposta for demonstrada em workloads reais — com custos, limites e evidências transparentes — o EvolveLoop terá uma identidade mais forte do que a de um orquestrador convencional. Terá se tornado uma plataforma para execução autônoma confiável.
PRINCÍPIO FINAL

Qualquer executor pode começar. Qualquer executor compatível pode continuar. Todo efeito é rastreável. Todo resultado importante precisa de evidências.
