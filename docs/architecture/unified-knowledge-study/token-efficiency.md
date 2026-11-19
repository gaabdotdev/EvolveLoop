# Otimização de Tokens: Hipóteses, Instrumentação e Métricas

> **Status:** Estudo de Eficiência e Hipóteses Verificáveis (Fase D)  
> **Data:** 2026-10-24  
> **Escopo:** Formalização das hipóteses de redução de tokens de entrada e saída, distinção de conceitos econômicos e plano de instrumentação sem métricas arbitrárias.

---

## 1. Distinção Rigorosa dos Conceitos de Eficiência

Para evitar conclusões distorcidas e otimizações superficiais, o EvolveLoop estabelece uma separação categórica entre as diferentes dimensões de economia e desempenho:

| Dimensão | O que Realmente Mede | Exemplo Típico | Não Confundir Com |
|---|---|---|---|
| **Tokens Efetivamente Enviados (Input Tokens)** | Quantidade exata de tokens contidos nas mensagens e contexto submetidos à API do modelo na requisição. | Redução de arquivos inteiros no prompt para apenas trechos citados. | Redução de custo (um token de cache ainda é um token enviado). |
| **Tokens Gerados (Output Tokens)** | Quantidade de tokens produzidos pelo LLM na resposta. | Respostas concisas e estruturadas em JSON em vez de dissertações explicativas longas. | Redução de latência de rede. |
| **Context Caching (Prompt Cache)** | Reutilização de blocos idênticos de prefixo de prompt pelo provedor LLM (ex.: Anthropic Prompt Caching), cobrando fração do custo normal. | Fixação estática das instruções de sistema e catálogo de tools nas primeiras mensagens. | **Não reduz tokens enviados**; reduz apenas custo financeiro e latência de processamento no provedor. |
| **Redução do Custo Financeiro ($)** | Valor monetário faturado ao final da execução. | Utilização de modelo mais barato (ex.: Flash em vez de Pro) ou cache de prefixo. | Redução de tokens (trocar de modelo com o mesmo prompt não poupa nenhum token). |
| **Uso de Modelos Locais (Ollama)** | Execução de inferência em GPU/CPU local sem faturamento de API. | Ranquear nós de dependências ou gerar embeddings via Ollama. | **Não reduz tokens**; consome ciclos locais de hardware e energia em vez de dólares de API. |
| **Redução de Leituras e Chamadas de I/O** | Quantidade de vezes que ferramentas como `read_file` ou `search_files` são invocadas pelo agente. | Agente recebe o trecho exato no grounding e não precisa rodar 15 comandos `grep` e `read_file`. | Redução direta de tokens (poupa chamadas, o que como consequência evita injeção repetida de conteúdo no contexto). |
| **Tempo de Execução (Latência Total)** | Duração em segundos entre o início e o fim da tarefa. | Execução de busca lexical em 10ms em vez de subprocesso de 1.800ms. | Não tem correlação direta obrigatória com tokens (um prompt pequeno pode ter alta latência se o modelo pensar muito). |

> [!CAUTION]
> **Regra de Ouro:** Uma otimização que reduz custo financeiro ou tempo de máquina, mas mantém idêntica a quantidade de tokens processados pelo modelo, **não é e não será contabilizada como redução de tokens**.

---

## 2. Hipóteses Fundamentadas de Redução de Tokens

```mermaid
flowchart TD
    subgraph SemUKS["Cenário Atual sem UKS (Desperdício)"]
        AgentA["Agente sem Grounding"] --> ReadAll["Lê arquivos inteiros via read_file<br/>(15.000 a 40.000 tokens)"]
        ReadAll --> RetryLoop["Erros de contrato e retentativas<br/>(Reinjeta histórico e arquivos repetidos)"]
        RetryLoop --> FatPrompt["Prompt Gigante & Estouro de Contexto"]
    end

    subgraph ComUKS["Cenário com UKS Proposto (Eficiência)"]
        AgentB["Agente com UKS"] --> GroundingPack["Recebe Context Pack cirúrgico<br/>(&lt;2.000 tokens de trechos essenciais)"]
        GroundingPack --> SingleRead["Leitura de apenas 1 arquivo específico<br/>(Se estritamente necessário)"]
        SingleRead --> DirectExecution["Implementação correta na 1ª tentativa<br/>(Zero retentativas de contrato)"]
    end
```

A seguir, são detalhadas as quatro hipóteses principais de economia efetiva de tokens, sua fundamentação, riscos e critérios de teste:

---

### Hipótese H-01: Recuperação Cirúrgica de Trechos em Vez de Leitura Indiscriminada de Arquivos Inteiros

#### Mecanismo de Economia
O agente implementador recebe no Context Pack inicial apenas os trechos específicos das interfaces, contratos e regras pertinentes à sua tarefa (`file:line`), recortados pelo `ContextBudget`. Isso substitui o padrão atual em que o agente invoca sucessivamente `read_file` em 5 a 15 arquivos completos de código para entender o funcionamento do sistema antes de começar a codificar.

#### Evidência de Existência do Problema
Nos benchmarks V2.2 (`docs/v22/baseline/raw/p0-baseline-report.json`), a corrida do braço baseline (B0 — sem grounding) precisou ler e carregar no prompt uma mediana de **19,5 arquivos de código**, consumindo uma mediana de **20.099 a 21.284 tokens de entrada** apenas na montagem inicial de contexto para localizar os pontos de intervenção.

#### Métrica Necessária
- Quantidade média de ferramentas `read_file` executadas por tarefa bem-sucedida.
- Total acumulado de `input_tokens` consumidos em todas as chamadas de inferência de uma feature (`cumulative_prompt_tokens`).

#### Risco de Degradação
Se o trecho recuperado omitir um detalhe crítico de implementação (ex.: uma anotação de tipo ou uma condicional sutil em outra linha do arquivo), o agente pode gerar código incompleto, forçando retentativas.

#### Método de Validação
Comparar duas baterias de 20 tarefas representativas de refatoração no monorepo: Grupo Controle (agente sem grounding prévio, explorando via `read_file`) vs. Grupo Experimental (agente recebendo Context Pack estruturado do UKS). Medir o total de tokens de entrada somados até a conclusão satisfatória do portão de testes.

#### Condição de Invalidação da Hipótese
A hipótese será refutada se o total de tokens somados nas retentativas geradas por "falta de contexto completo" for superior aos tokens poupados ao não ler os arquivos inteiros inicialmente.

---

### Hipótese H-02: Deduplicação Estrita de Arquivos no Histórico do Spawn

#### Mecanismo de Economia
O componente `ContextBudget` e o orquestrador eliminam caminhos de arquivos e conteúdos que já estejam presentes nas evidências do `EvidenceBus` ou no histórico recente da conversa do ciclo atual. Se um arquivo `engine.ts` já foi enviado na etapa de planejamento ou numa chamada imediatamente anterior, ele não é reinjetado no prompt do próximo agente se seu hash não tiver mudado.

#### Evidência de Existência do Problema
O código do orquestrador (`orchestrator/src/context/budget.ts#L45-L60`) implementou uma primeira versão de deduplicação (`evidence_paths`), comprovando em testes unitários (`v22-context-budget.test.ts`) que múltiplos agentes em cadeia reenviavam os mesmos blocos de código repetidamente a cada transição de fase.

#### Métrica Necessária
- Percentual de tokens redundantes detectados por requisição (`redundant_token_ratio`).
- Variação do tamanho do prompt entre spawns consecutivos de um mesmo ciclo de tarefas.

#### Risco de Degradação
Risco de perda de contexto se o agente posterior esquecer partes da instrução anterior por causa de compacidades excessivas (conhecido na literatura como "context fragmentation").

#### Método de Validação
Medição automatizada do payload montado pelo `spawn-pickup-context.ts` com e sem a flag de deduplicação ativa, avaliando se os agentes subsequentes preservam a taxa de sucesso nos testes de PO (`gate.po.json`).

#### Condição de Invalidação da Hipótese
A hipótese será refutada se o índice de reprovação no portão de PO subir mais de 5% devido a alucinações sobre requisitos omitidos na deduplicação.

---

### Hipótese H-03: Restrição de Escopo Impedindo Injeção de Conhecimento Estrangeiro

#### Mecanismo de Economia
Ao restringir nativamente a busca ao escopo `project:<id>`, o motor elimina do espaço de candidatos centenas de notas corporativas irrelevantes, diretrizes de outros projetos do cofre e packs não relacionados que anteriormente disputavam o orçamento de tokens.

#### Evidência de Existência do Problema
Na auditoria dos logs de benchmark (`docs/audit/EXECUTION-TRACES.md` e ADR-0013), identificou-se que consultas genéricas no cofre global traziam trechos de documentação de bibliotecas externas e projetos vizinhos, ocupando até **35% do orçamento máximo de 22.000 tokens** com notas sem relação direta com a tarefa de código.

#### Métrica Necessária
- Percentual de fatias descartadas por irrelevância (`irrelevant_slice_ratio`).
- Tamanho médio em tokens do envelope de evidência gerado (`evidence_set_token_size`).

#### Risco de Degradação
Ocultar um padrão corporativo genuinamente necessário se o agente não souber solicitá-lo com escopo explícito.

#### Método de Validação
Verificar a presença de tokens de projetos estrangeiros no payload do prompt gerado em 50 tarefas de teste, medindo a redução absoluta de tokens no payload do briefing.

#### Condição de Invalidação da Hipótese
A hipótese será invalidada se a restrição de escopo fizer com que tarefas que dependam de contratos organizacionais falhem no portão de segurança por desconhecimento das regras globais.

---

### Hipótese H-04: Respostas Estruturadas em JSON Reduzindo Tokens de Saída em Gates

#### Mecanismo de Economia
Substituir saídas verbosas em linguagem natural em portões de validação (como `testing`, `security` e `po-review`) por envelopes JSON compactos e tipados. Um modelo revisor gera um payload JSON direto (ex.: `{"pass": true, "issues": []}`) em vez de gerar 4 parágrafos de introdução, elogios e considerações estilísticas.

#### Evidência de Existência do Problema
O estudo de otimização de tokens (`docs/research/evolveloop-v2.2/06-token-optimization.md`) documentou que respostas de revisores humanos e agentes em prosa livre geram em média 400 a 800 tokens de saída, dos quais menos de 15% representam dados acionáveis de decisão técnica.

#### Métrica Necessária
- Contagem exata de `output_tokens` por execução de portão de qualidade.

#### Risco de Degradação
Perda de nuances ou justificativas qualitativas que ajudariam um engenheiro humano a entender a razão de uma reprovação complexa.

#### Método de Validação
Contagem de tokens gerados em 30 avaliações de segurança e testes, comparando a saída em prosa contra o schema JSON estrito do `EvidenceBus`.

#### Condição de Invalidação da Hipótese
A hipótese será refutada se o tempo de correção de um bug por um agente subsequente aumentar significativamente por falta de detalhes explicativos na saída do gate.

---

## 3. Matriz de Instrumentação e Observabilidade de Tokens

Para que as hipóteses acima deixem de ser conjecturas e se tornem dados comprováveis por testes e auditoria, o sistema implementará as seguintes métricas na camada do orquestrador:

```mermaid
flowchart LR
    Request["Requisição de Inferência"] --> PreCount["1. Pré-Contagem determinística de Input Tokens<br/>(tiktoken:cl100k_base)"]
    PreCount --> LLMCall["2. Chamada ao Modelo (Host Cursor / API)"]
    LLMCall --> PostCount["3. Pós-Contagem de Output Tokens & Resposta"]
    PostCount --> TelemetryBus["4. Telemetria & Persistência em memory/<feat>/metrics.json"]
    
    TelemetryBus --> Dashboard["Relatório de Eficiência do /evolve"]
```

| Métrica | Unidade | Ponto de Coleta | Mecanismo de Coleta | Status no Checkout Atual |
|---|---|---|---|---|
| `prompt_input_tokens` | Inteiro | Entrada do `spawn-pickup-context.ts` | Tokenizer nativo `tiktoken:cl100k_base` | **IMPLEMENTADO E TESTADO** |
| `context_budget_dropped_tokens` | Inteiro | Função `applyContextBudget()` | Contagem de tokens das fatias descartadas | **IMPLEMENTADO E TESTADO** |
| `read_file_invocations_count` | Inteiro | Hooks de ferramentas do agente | Contador de chamadas de tool na sessão | `NOT_MEASURED` (A instrumentar) |
| `model_output_tokens` | Inteiro | Resposta de inferência | Leitura do campo de uso da API | `NOT_MEASURED` (A instrumentar) |
| `prompt_cache_hit_ratio` | Percentual | Cabeçalho HTTP do provedor | Leitura de `cached_tokens / total_tokens` | `NOT_MEASURED` (Depende do host) |
| `retrieval_overhead_ms` | Milissegundos | Início e fim do `UnifiedRetriever` | `performance.now()` no Node.js | **MEDIDO EM BENCHMARKS** |

---

## 4. Conclusão sobre Eficiência

O sistema de conhecimento unificado não persegue reduções cosméticas de tokens baseadas em reescrita telegráfica destrutiva (como a compressão cega de arquivos rejeitada na pesquisa V2.2). A verdadeira economia decorre da **precisão cirúrgica**: entregar ao agente exatamente as linhas de código e os contratos necessários para a sua tarefa, eliminando leituras cegas de diretório, alucinações de escopo e retentativas de compilação.
