# Avaliação de Observabilidade e Telemetria do Conhecimento

> **Objetivo:** Determinar o que pode ser efetivamente medido e conhecido sobre a operação do ecossistema de conhecimento no EvolveLoop no estado atual, identificando métricas existentes, lacunas de instrumentação e propostas mínimas para observabilidade futura.

---

## 1. Classificação Rigorosa do Estado dos Componentes

Para evitar conclusões baseadas em mera presença de arquivos, a tabela abaixo classifica cada componente em 5 níveis crescentes de comprovação operacional:

| Componente | 1. Presente no Repo? | 2. Referenciado? | 3. Rota Alcançável? | 4. Executado Comprovadamente? | 5. Frequência Medida? |
|---|---|---|---|---|---|
| **`WikiKnowledgeBackend`** | Sim | Sim | Sim | Sim (em testes e harnesses V2.2) | `NOT_MEASURED` |
| **`ProjectKnowledgeRuntime` (Truth Fence)** | Sim | Sim | Sim | Sim (testes unitários e wire) | `NOT_MEASURED` |
| **`FilesystemKnowledgeStore`** | Sim | Sim | Sim (via engine) | Não no disco real (pasta ausente) | Inativo em runtime real |
| **`FilesystemMemoryStore`** | Sim | Sim | Sim (via engine) | Não no disco real (YAMLs ausentes) | Inativo em runtime real |
| **`EvidenceBus`** | Sim | Sim | Sim | Sim (dezenas de JSONs em `memory/`) | `NOT_MEASURED` contínuo |
| **`WorkingContext` / `ContextBudget`** | Sim | Sim | Sim | Sim (testes e benchmarks B1/B3) | Medido em benchmarks |
| **`GraphifyAdapter` / `graphify`** | Sim | Sim | Sim (via flag) | Sim (`graphify-out/graph.json` gerado) | Medido em bench B3 |
| **`Wiki Carpaccio` (`carpaccio.py`)** | Sim | Sim | Sim | Sim (executado via CLI nesta auditoria) | `NOT_MEASURED` contínuo |
| **`gaabwiki` (Vault Engine)** | Sim | Sim | Sim | Sim (testado via CLI e fixture) | `NOT_MEASURED` contínuo |
| **Skill `wiki` (Context Engineer)** | Sim | Sim | Sim | Sim (evidências `grounding.json` reais) | `NOT_MEASURED` contínuo |
| **`wiki-mem` (`mem.py`)** | Sim | Sim | Condicional | Não (hooks desligados em `hooks.json`) | Inativo no checkout atual |
| **`PatternAggregator`** | Sim | Sim | Sim | Sim (testes unitários do engine) | `NOT_MEASURED` contínuo |
| **`EvolveLoopStore` / `SignalStore`** | Sim | Sim | Sim | Sim (testes longitudinais) | `NOT_MEASURED` contínuo |
| **MCP `server-memory`** | Sim (`mcp.json`) | Não pelo core | Não pelo core | Não | Zero |

---

## 2. Diagnóstico da Telemetria Existente

### O que PODE ser conhecido hoje:
1. **Contagem e Tamanho de Corpus:**  
   O arquivo `$WIKI_ROOT/.data/manifest.json` e a saída de `gaabwiki rebuild` informam com precisão o número de chunks e documentos indexados (`corpus_size`). No checkout da fixture, o tamanho do corpus é conhecido e verificável (`VERIFIED_IN_CODE`).
2. **Hashes de Arquivos de Origem:**  
   Tanto `.ai/manifest.yaml` quanto `.data/manifest.json` gravam os hashes SHA-256 de cada arquivo de código monitorado, permitindo auditoria pontual de integridade criptográfica (`VERIFIED_IN_CODE`).
3. **Consumo de Tokens por Fatia de Contexto:**  
   O módulo `orchestrator/src/context/budget.ts` calcula e emite a telemetria `ContextBudgetTelemetry`, registrando `tokens_measured`, `tokenizer`, `paths_count` e `pages_count` (`VERIFIED_IN_CODE`).
4. **Identificadores de Execução e Nós:**  
   Todas as evidências geradas pelo `EvidenceBus` contêm identificadores rastreáveis (`node_id`, `run_id`, `capability`, `provider_id`, `timestamp`) e são sanitizadas contra segredos (`VERIFIED_IN_CODE`).
5. **Padrões de Falha Reincidentes:**  
   O `PatternAggregator` mantém a contagem de falhas agrupadas por `${capability}:${provider_id}:${reason}` durante a sessão de execução do motor (`VERIFIED_IN_CODE`).
6. **Métricas Estáticas do Benchmark B3 (ADR-0014):**  
   O repositório possui dados medidos e congelados de recall, tokens e latência comparando B0 (grep), B1 (híbrido wiki) e B3 (Graphify) em `docs/adr/0014-graphify-b3-benchmark-decision.md` (`VERIFIED_IN_CODE`).

---

## 3. O que NÃO PODE ser conhecido hoje (Lacunas Críticas)

1. **Taxa de Utilização Real do RAG em Tempo de Desenvolvimento:**  
   Não existem contadores de chamadas persistentes que meçam quantas vezes um desenvolvedor ou agente rodou `/wiki` ou `ground.sh` durante o desenvolvimento de uma feature.
2. **Latência Real da Ponte TypeScript → Python Subprocess:**  
   Não há instrumentação de tempo de resposta para a chamada `runWikiSearch()` no orquestrador; logs de tempo só existiram dentro dos harnesses temporários de benchmark.
3. **Métricas de Relevância / Hit Rate dos Prompts:**  
   Não é possível saber se os trechos recuperados pelo `WikiKnowledgeBackend` foram efetivamente aproveitados pelo modelo de linguagem ou se foram descartados na atenção do LLM como ruído.
4. **Taxa de Staleness Histórica:**  
   Não há registro histórico de quantas vezes uma nota foi consultada contendo a flag `stale: true` antes que alguém atualizasse o código ou o documento.
5. **Atribuição de Custo / Tokens de Inferência por Consulta de Conhecimento:**  
   As consultas locais da Wiki e Carpaccio rodam em CPU local (BM25), não gerando custos diretos de API; no entanto, o tamanho dos context packs gerados e seu impacto no custo das janelas dos LLMs comerciais não é monitorado continuamente (exceto no teste pontual registrado em `memory/v22-close-100/evidence/openrouter-usage.json`).

---

## 4. Instrumentação Mínima Recomendada para Decisões Futuras

Para que a equipe possa decidir tecnicamente entre unificar, manter ou substituir os motores de conhecimento sem especulações, as seguintes instrumentações mínimas (não implementadas nesta missão) seriam necessárias:

1. **Structured Logging no `WikiKnowledgeBackend`:**  
   Emitir uma linha JSONL local em `telemetry/events/knowledge-queries.jsonl` a cada busca, registrando:
   ```json
   {
     "timestamp": "ISO-8601",
     "query": "termo",
     "hits_count": 8,
     "stale_hits_count": 0,
     "latency_ms": 142,
     "error_code": null,
     "caller_role": "context-engineer"
   }
   ```
2. **Contador de Frescor no CI (`carpaccio.py lint --metric`):**  
   Adicionar ao fluxo de integração contínua a exportação do percentual de páginas de arquitetura que estão em conformidade de hash com o código (`frescor = páginas_atuais / total_páginas`).
3. **Registro de Custo de Tokens no `spawn-pickup-context`:**  
   Salvar o objeto `telemetry` gerado por `applyContextBudget()` dentro do arquivo `run-summary.json` de cada feature para rastrear o crescimento do tamanho de contexto ao longo dos ciclos.
