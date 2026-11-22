# Resumo Executivo — Auditoria do Ecossistema de Conhecimento do EvolveLoop

> **Para:** Liderança Técnica e Responsável pelo EvolveLoop  
> **Objetivo:** Apresentar a síntese executiva e factual do ecossistema de conhecimento, memória e recuperação, fornecendo evidências para a futura tomada de decisão arquitetural.

---

## 1. Respostas Diretas às Perguntas da Auditoria

### 1. Quais mecanismos de conhecimento realmente existem no checkout atual?
Existem **16 mecanismos investigados**, divididos em três grupos operacionais:
- **Núcleo de Recuperação e Conhecimento:** `KnowledgeBackend` / `WikiKnowledgeBackend`, `ProjectKnowledgeRuntime` (Truth Fence), Wiki Carpaccio (`.ai/` + `carpaccio.py`), Wiki Vault (`gaabwiki`), e a Skill Cursor `wiki` (Context Engineer).
- **Memória, Contexto e Evidências:** `WorkingContext` / `ContextBudget`, `EvidenceBus`, `MemoryStore` / `FilesystemMemoryStore`, `wiki-mem` (`mem.py`), `PatternAggregator`, e a pasta física raiz `memory/`.
- **Grafos, Aprendizado e Integrações:** `GraphifyAdapter` (grafo AST de código), `EvolveLoopStore` (auto-evolução), `GraphStore` (DAG de tarefas do IR — *esclarecido como não-conhecimento*), e o servidor externo MCP `server-memory` (*descartado pelo core*).

### 2. Qual é a responsabilidade de cada um?
- **`WikiKnowledgeBackend`:** Ponte via subprocesso entre o Node.js e o motor Python da Wiki externa.
- **`TruthFence`:** Juiz determinístico de conflitos que impõe a hierarquia `código > .ai/ > vault > inferência`.
- **Wiki Carpaccio (`.ai/`):** Base documental local no repositório vinculada a hashes criptográficos de código.
- **Wiki Vault (`gaabwiki`):** Motor de busca lexical (BM25) e vetorial sobre um cofre global de notas Markdown.
- **Skill `wiki`:** Portão obrigatório de grounding que gera o Context Pack (Fontes/Contratos/GAPs) antes de codar.
- **`WorkingContext`:** Montador de fatias de contexto para o modelo com blindagem contra cortes em fatias críticas.
- **`EvidenceBus`:** Barramento de auditoria que grava JSONs de validação de portão (`gate.testing.json`, etc.).
- **`Graphify`:** Grafo de dependências estruturais de código gerado a partir da árvore sintática (AST).
- **`FilesystemMemoryStore` & `FilesystemKnowledgeStore`:** Módulos legados do orquestrador V2 em TypeScript para armazenamento de preferências e regras em arquivos locais.
- **`wiki-mem`:** Memória episódica de conversas da IDE Cursor e enfileiramento de promoção (*librarian*).
- **`PatternAggregator`:** Rastreador de falhas de provedores que penaliza ferramentas instáveis.
- **`EvolveLoopStore`:** Gravador do histórico de auto-evolução do próprio framework.

### 3. Como, onde e quando cada um é utilizado?
- **No início do ciclo (`/evolve`):** O Graphify corre como pré-portão de AST (se presente); em seguida, a skill `wiki` corre compulsoriamente (Fase 0), gerando o Context Pack e persistindo `memory/<feature_id>/evidence/grounding.json`.
- **Durante o planejamento (`/planejar`):** O `TruthFence` filtra contradições entre notas e código; o `ContextBudget` restringe o volume de tokens injetado no modelo.
- **Durante a execução de tarefas:** O escalonador consulta o `PatternAggregator` para evitar provedores com histórico de falhas recentes.
- **Na finalização de tarefas:** O `EvidenceBus` valida que todas as evidências dos portões (`testing`, `security`, `po`) existem no disco antes de autorizar o avanço. O agente registra as mudanças no `log.md` da Wiki.

### 4. Quais são as fontes canônicas de informação?
- **Para comportamento em runtime e tipos:** O próprio **código-fonte** (`orchestrator/src/`, arquivos TypeScript/Python). O código é a autoridade máxima absoluta (Tier 0).
- **Para decisões de arquitetura e contratos locais:** A pasta **`.ai/pages/*.md`** (Tier 1), enquanto seu hash de integridade estiver válido.
- **Para conhecimento histórico e cross-project:** O **Wiki Vault** (`$WIKI_ROOT`, Tier 2).

### 5. Quais componentes mantêm dados originais e quais mantêm representações derivadas?
- **Dados Originais:** O código-fonte, as notas em `.ai/pages/*.md`, as notas no cofre `$WIKI_ROOT` e os arquivos de contexto/preferências.
- **Representações Derivadas:** O índice `.ai/manifest.yaml` (hashes), o manifesto `.data/manifest.json` do vault (chunks e tokens BM25), o grafo `graphify-out/graph.json` (extraído da AST), e os relatórios em `memory/<id>/evidence/` (extraídos dos resultados de execução).

### 6. Como os componentes se conectam?
- A conexão entre TypeScript e Python ocorre via **subprocessos CLI** (`spawn` invocando `gaabwiki search` e `execFileSync` invocando `graphify query`).
- A conexão entre a skill `orquestrar` e o orquestrador ocorre via **sistema de arquivos local**: os agentes leem e gravam JSONs na pasta `memory/<feature_id>/evidence/`.
- A sincronização entre `.ai/` e o cofre é manual ou via script bash (`sync-carpaccio-to-vault.sh`).

### 7. Onde existem duplicidade, fragmentação ou inconsistência comprovadas?
- **Duplicidade Comprovada de Notas:** O mesmo documento existe fisicamente em `.ai/pages/` e dentro de `fixtures/evolveloop-wiki-vault/projects/evolveloop/pages/`.
- **Fragmentação da Memória:** Coexistem 3 mecanismos distintos de "memória": o `MemoryStore` do orquestrador (não utilizado no checkout), o `wiki-mem` no cofre (desativado por default), e o `EvidenceBus` na pasta `memory/` (altamente utilizado).
- **Store Fantasma:** O `FilesystemKnowledgeStore` em TypeScript está compilado e testado, mas sua pasta física `knowledge/` não existe no repositório.

### 8. Quais problemas são apenas suspeitas?
- *Suspeita não comprovada:* "O motor de busca híbrida com Ollama falha frequentemente em produção." — Apenas a fixture local BM25 pôde ser testada diretamente; o comportamento do Ollama no cofre do autor depende de medição em runtime.
- *Suspeita não comprovada:* "O Graphify alucina conexões." — O benchmark ADR-0014 comprovou recall idêntico à Wiki em AST local, desmentindo que a ferramenta gere arestas incorretas no modo `--no-cluster`.

### 9. O que está comprovadamente ativo, inativo ou indeterminado?
- **Comprovadamente Ativo:** `WikiKnowledgeBackend`, `TruthFence`, `EvidenceBus`, `WorkingContext`, Wiki Carpaccio (`.ai/`), Skill `wiki`, `gaabwiki` (BM25), `PatternAggregator`, pasta física `memory/`.
- **Comprovadamente Inativo no Core:** MCP `@modelcontextprotocol/server-memory` (rejeitado), `FilesystemKnowledgeStore` (sem pasta física), `FilesystemMemoryStore` (sem arquivos YAML populados).
- **Desativado por Padrão / Opcional:** `wiki-mem` (`memory.enabled: false`), `GraphifyAdapter` (atrás da flag `EVOLVELOOP_GRAPHIFY`).
- **Indeterminado:** Frequência de uso operacional de cada mecanismo por desenvolvedores humanos (`NOT_MEASURED`).

### 10. Quais são os cinco principais problemas demonstrados pelas evidências?
1. **Sobrecarga de Subprocessos e I/O:** Cada busca no `WikiKnowledgeBackend` spawna um interpretador Python novo para rodar `gaabwiki search`, gerando latência cumulativa.
2. **Abandono Silencioso do `KnowledgeStore` em TypeScript:** O orquestrador mantém classes e testes para um store em `knowledge/` que foi abandonado na prática em favor do Carpaccio em `.ai/`.
3. **Ausência de Propagação Automática de Exclusões:** Se um documento for removido em `.ai/`, ele continua existindo no cofre da Wiki e em `.data/manifest.json` até que um sync destrutivo manual seja executado.
4. **Dependência Frágil de Ambiente do Graphify:** O hard-gate da skill Graphify aponta para um executável em `/tmp/`, local volátil sujeito a limpeza periódica pelo sistema operacional.
5. **Ambiguidade Terminológica e Conceitual de "Memória":** O termo *Memory* refere-se simultaneamente a três tecnologias incompatíveis no projeto, gerando atrito para desenvolvedores e agentes.

### 11. Quais informações ainda faltam para escolher uma arquitetura futura?
- Decisão de produto: o conhecimento canônico deve ser mantido local no Git (`.ai/`) ou centralizado em um cofre externo (`$WIKI_ROOT`)?
- Medição de tempo: qual é a latência percebida pelo usuário ao rodar o ciclo `/evolve` com subprocessos Python vs uma biblioteca nativa em TypeScript?
- Definição do papel da memória episódica na V3: os chats do Cursor precisam ser persistidos no cofre ou as evidências em `memory/<id>/evidence/` são suficientes?

---

## 2. Matriz Comparativa Final dos Mecanismos

| Componente | Responsabilidade | Consumidores | Acionamento | Persistência | Evidência de uso | Principal risco |
|---|---|---|---|---|---|---|
| **WikiKnowledgeBackend** | Ponte de busca para a Wiki externa | `DeterministicProvider` | Chamadas `knowledge.search` | Efêmero (sem store próprio) | `VERIFIED_IN_CODE` / `TEST` | Latência de subprocesso Python |
| **TruthFence** | Hierarquia de autoridade e filtro de staleness | Provedor determinístico | Toda busca de conhecimento | Em memória (volátil) | `VERIFIED_IN_CODE` / `TEST` | Falha se `topic_key` divergir |
| **Wiki Carpaccio (.ai/)** | Documentação local com hashes SHA-256 | Agentes `/evolve`, Truth Fence | Manual / Scripts / Gates | Git (`.ai/pages/`, `manifest.yaml`) | `OBSERVED_AT_RUNTIME` | Busca puramente lexical |
| **Wiki Vault (gaabwiki)** | Indexação e busca no cofre global | `WikiKnowledgeBackend`, `ground.sh` | Subprocesso / CLI | Disco (`.data/manifest.json`) | `OBSERVED_AT_RUNTIME` | Exige cofre externo configurado |
| **Skill wiki** | Hard-gate de Context Engineer | Skill `orquestrar`, `/wiki` | Fase 0 de `/evolve` | Transcript e `grounding.json` | `OBSERVED_AT_RUNTIME` | Parada se cofre estiver vazio |
| **WorkingContext / Budget** | Orçamento e proteção de fatias de contexto | Spawns de workers e jobs | Pré-chamada de LLM | Efêmero (descartável) | `VERIFIED_IN_CODE` / `TEST` | Descarte de arquivos inteiros |
| **EvidenceBus** | Persistência higienizada de evidências | Agentes, gates, revisores | Transições de portão | Disco (`memory/<id>/evidence/`) | `OBSERVED_AT_RUNTIME` | Dados locais (no `.gitignore`) |
| **GraphifyAdapter** | Grafo AST de dependências de código | Skill `orquestrar`, bench B3 | Pré-gate / Flag `EVOLVELOOP_GRAPHIFY` | Disco (`graphify-out/graph.json`) | `OBSERVED_AT_RUNTIME` | Executável em `/tmp/`, arquivo de 7.4 MB |
| **FilesystemKnowledgeStore** | Store de regras e padrões categorizados | `ExecutionEngine`, `Scheduler` | Pós-tarefa / Pré-agendamento | Disco (esperado `knowledge/`) | Inativo no disco real | Store fantasma (pasta não existe) |
| **FilesystemMemoryStore** | Memória contextual por feature em YAML | `ExecutionEngine` | Pós-tarefa com aprendizado | Disco (`memory/<id>/*.yaml`) | Inativo no disco real | Desconectado do fluxo de agentes |
| **wiki-mem (mem.py)** | Memória episódica de chats Cursor | Comando `/mem`, Cursor Hooks | Início/fim de sessão na IDE | Disco (`$WIKI_ROOT/.ai/sessions/`) | `DOCUMENTED_ONLY` em hooks | Desativado por default |
| **PatternAggregator** | Penalização de provedores instáveis | `ExecutionEngine`, `Scheduler` | Falhas de nós (`NodeFailed`) | Em memória | `VERIFIED_IN_CODE` / `TEST` | Dados voláteis por processo |
| **EvolveLoopStore** | Histórico de auto-evolução do framework | Controladores longitudinais | Análise de gargalos do motor | Disco (`evolution/snapshot.json`) | `VERIFIED_IN_CODE` / `TEST` | Complexidade de meta-otimização |
| **GraphStore** | DAG de execução de tarefas do IR | `ExecutionEngine`, `Scheduler` | Execução de plano IR | Em memória | `VERIFIED_IN_CODE` / `TEST` | Não é grafo de conhecimento |
| **MCP server-memory** | Grafo MCP externo de entidades | Descartado pelo core | Não acionado pelo EvolveLoop | Arquivo JSON global no host | Inativo no core | Mistura projetos no mesmo arquivo |
| **Diretório raiz memory/** | Workspace local de evidências e planos | Comandos de topo, benchmarks | Execução ao vivo de features | Disco local (`memory/`) | `OBSERVED_AT_RUNTIME` | Não versionado no Git |
