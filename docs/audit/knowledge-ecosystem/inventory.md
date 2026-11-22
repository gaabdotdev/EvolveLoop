# Inventário Completo dos Mecanismos de Conhecimento e Memória

> **Escopo:** Mapeamento sistemático de todos os componentes que armazenam, derivam, recuperam ou arbitram conhecimento, memória e contexto no checkout atual do EvolveLoop.

---

## 1. Tabela Resumo do Inventário

| ID | Nome Oficial no Projeto | Localização Principal | Tipo de Componente | Estado Aparente | Consumidores Principais |
|---|---|---|---|---|---|
| **M01** | `KnowledgeBackend` / `WikiKnowledgeBackend` | `orchestrator/src/knowledge/backend/` | Abstração & Ponte CLI | **ATIVO** | `DeterministicProvider` (`knowledge.search`, `knowledge.inspect`) |
| **M02** | `ProjectKnowledgeRuntime` & `TruthFence` | `orchestrator/src/knowledge/truth-source/` | Guardião de Autoridade & Isolamento | **ATIVO** | `providers/deterministic/knowledge.ts` |
| **M03** | `KnowledgeStore` / `FilesystemKnowledgeStore` | `orchestrator/src/knowledge/` | Store Local de Regras/Padrões | **ATIVO (Código) / VAZIO (Disco)** | `ExecutionEngine`, `Scheduler` |
| **M04** | `MemoryStore` / `FilesystemMemoryStore` | `orchestrator/src/memory/` | Memória Contextual de Feature | **ATIVO (Código) / DESACOPLADO (Disco)** | `ExecutionEngine`, `Scheduler` |
| **M05** | `EvidenceBus` & Persistência de Evidências | `orchestrator/src/evidence/evidence-bus.ts` | Barramento de Evidências & Gates | **ATIVO** | `ExecutionEngine`, Skill `orquestrar`, `/evolve` |
| **M06** | `WorkingContext` & `ContextBudget` | `orchestrator/src/context/` | Montador e Orçador de Contexto | **ATIVO** | `spawn-pickup-context.ts`, CLI `apply-context-budget` |
| **M07** | `GraphifyAdapter` & Skill `graphify` | `orchestrator/src/v22/`, `.cursor/skills/graphify/` | Grafo AST de Código & Pré-Gate | **EXPERIMENTAL / FLAG OPT-IN** | Pré-gate em `orquestrar`, `graphify query` |
| **M08** | Wiki Carpaccio (`.ai/` & `carpaccio.py`) | `.ai/`, `.cursor/skills/wiki-carpaccio/` | Documentação Local & Hash Tracking | **ATIVO** | Agentes em `/evolve`, scripts de sync |
| **M09** | Wiki Vault & `gaabwiki` | `fixtures/evolveloop-wiki-vault/gaabwiki/` | Motor de Retrieval (BM25/LanceDB) | **ATIVO** | `WikiKnowledgeBackend`, Skill `wiki` |
| **M10** | Skill `wiki` (Context Engineer) | `.cursor/skills/wiki/` | Hard-Gate de Grounding Pré-Código | **ATIVO** | Skill `orquestrar`, comando `/wiki` |
| **M11** | Skill `wiki-mem` & Hooks de Sessão | `.cursor/skills/wiki-mem/`, `.cursor/hooks/` | Memória Episódica & Librarian | **DESATIVADO (Default) / EXPERIMENTAL** | Comando `/mem`, Cursor hooks (quando ativos) |
| **M12** | `PatternAggregator` | `orchestrator/src/learning/pattern-aggregator.ts` | Aprendizado Operacional de Falhas | **ATIVO** | `ExecutionEngine`, `Scheduler` |
| **M13** | `EvolveLoopStore` / `SignalStore` | `orchestrator/src/evolveloop/` | Estado de Auto-Evolução do Framework | **ATIVO** | Controladores longitudinais do engine |
| **M14** | `GraphStore` (DAG de Execução) | `orchestrator/src/graph/graph-store.ts` | DAG de Tarefas do IR (Não-Conhecimento) | **ATIVO (Não é Knowledge Graph)** | `ExecutionEngine`, `Scheduler` |
| **M15** | MCP Memory (`server-memory`) | `mcp/mcp.json` | Grafo MCP Externo de Entidades | **DESCARTADO / INATIVO NO CORE** | Cursor IDE (se carregado), ignorado pelo core |
| **M16** | Diretório Raiz `memory/` | `/home/gaab/Downloads/EvolveLoop/memory/` | Área de Trabalho Local & Forense | **ATIVO (Workspace Local)** | Scripts de teste, agentes, benchmark V22/V23 |

---

## 2. Detalhamento Individual do Inventário

### M01: KnowledgeBackend & WikiKnowledgeBackend
- **Tipo:** Abstração de arquitetura e adaptador de subprocesso.
- **Responsabilidade:** Interface única em TypeScript (`KnowledgeBackend`) para consulta a bases de conhecimento externas. A implementação padrão (`WikiKnowledgeBackend`) invoca o utilitário Python `gaabwiki` via subprocesso no diretório `$WIKI_ROOT` ou `$RAG_REPO_ROOT`, higieniza saídas e trata falhas de infraestrutura através de estados degradados.
- **Arquivos-chave:** `orchestrator/src/knowledge/backend/types.ts`, `wiki-backend.ts`, `resolve.ts`, `fake-backend.ts`.
- **Documentação:** `docs/adr/0012-wiki-default-knowledge-backend.md`, `docs/adr/0005-hybrid-retrieval-degraded-mode.md`.
- **Entradas/Saídas:** Entrada: `query: string`. Saída: `Promise<EvidenceSet>` contendo `hits: KnowledgeHit[]` e `error_code`.
- **Dependências:** `child_process.spawn`, Python 3 com módulo `gaabwiki` no ambiente.
- **Consumidores:** `orchestrator/src/providers/deterministic/knowledge.ts`.
- **Estado:** `ATIVO` (Backend configurado como default em `profiles/default.yaml`).

### M02: ProjectKnowledgeRuntime & TruthFence
- **Tipo:** Mecanismo de resolução de conflitos, verificação de proveniência e isolamento.
- **Responsabilidade:** Aplica a regra de hierarquia rígida de fontes: `código (tier 0) > .ai/ (tier 1) > vault (tier 2) > inferred (tier 3)`. Descarta itens sem proveniência rastreável, demote páginas `.ai/` com `status: obsoleto` e bloqueia vazamento de canários de projetos estrangeiros.
- **Arquivos-chave:** `orchestrator/src/knowledge/truth-source/runtime.ts`, `fence.ts`, `isolation.ts`, `provenance.ts`, `types.ts`.
- **Documentação:** `docs/adr/0004-project-knowledge-contract.md`, `docs/v22/`.
- **Entradas/Saídas:** Entrada: lista de `TruthSourcedItem` ou `EvidenceSet`. Saída: `TruthFenceResult` (`accepted`, `rejected`) e `EvidenceSet` filtrado.
- **Dependências:** TypeScript puro / Node.js.
- **Consumidores:** Envolve todas as chamadas de `knowledgeSearch` e `knowledgeInspect` no provedor determinístico.
- **Estado:** `ATIVO` (Habilitado por padrão via `KNOWLEDGE_TRUTH_FENCE=on`).

### M03: KnowledgeStore & FilesystemKnowledgeStore
- **Tipo:** Repositório local de conhecimento estruturado/regras.
- **Responsabilidade:** Armazenamento permanente de entidades de conhecimento tipadas (`pattern`, `pitfall`, `bug`, `decision`, `lesson`, `contract`). Permite busca por substring e correspondência de tags/capabilities. A versão em filesystem salva arquivos `.md` individuais com frontmatter YAML e gera `index.yaml`.
- **Arquivos-chave:** `orchestrator/src/knowledge/knowledge-store.ts`, `filesystem-knowledge-store.ts`.
- **Documentação:** `.cursor/skills/orquestrar/references/specs/knowledge-memory.md`.
- **Entradas/Saídas:** Entrada: `KnowledgeQuery` (`capability`, `tags`, `text`). Saída: `KnowledgeEntry[]`. Escrita: `propose(ProposedKnowledgeEntry)`.
- **Dependências:** `node:fs`, biblioteca `yaml`.
- **Consumidores:** `ExecutionEngine`, `Scheduler`.
- **Estado:** `ATIVO NO CÓDIGO / VAZIO NO DISCO` (O motor carrega o store, mas o diretório `knowledge/` não existe no repositório de trabalho; opera como store em memória vazio a menos que criado).

### M04: MemoryStore & FilesystemMemoryStore
- **Tipo:** Store de memória contextual por feature/sessão.
- **Responsabilidade:** Armazena dados de execução e contexto específicos de uma tarefa/feature (`featureId`). Mantém separação estrita entre preferências do usuário (`preferences.yaml`) e decisões técnicas (`decisions.yaml`). Protegido contra path traversal via `assertFeatureIdConfined`.
- **Arquivos-chave:** `orchestrator/src/memory/memory-store.ts`, `filesystem-memory-store.ts`.
- **Documentação:** `.cursor/skills/orquestrar/references/specs/knowledge-memory.md`, `docs/adr/0013-context-ownership-working-context.md`.
- **Entradas/Saídas:** Entrada: `MemoryEntry` (`timestamp`, `source`, `type`, `content`). Saída: coleções de preferências e decisões.
- **Dependências:** `node:fs`, `yaml`.
- **Consumidores:** `ExecutionEngine` (`run.contextual_learnings`).
- **Estado:** `ATIVO NO CÓDIGO / DESACOPLADO NO DISCO` (O código do orquestrador suporta a escrita, porém o diretório `memory/` no checkout atual é utilizado pelos agentes para guardar relatórios e evidências JSON, sem instanciar os arquivos `preferences.yaml`).

### M05: EvidenceBus & Persistência de Evidências
- **Tipo:** Barramento e sistema de persistência de evidências de qualidade.
- **Responsabilidade:** Grava e sanitiza (redação de segredos) os resultados dos portões de qualidade e nós de execução em `memory/<feature_id>/evidence/` (ex.: `gate.testing.json`, `gate.security.json`, `grounding.json`). Garante que a transição de fases do ciclo `/evolve` seja bloqueada na ausência do arquivo no disco.
- **Arquivos-chave:** `orchestrator/src/evidence/evidence-bus.ts`, `builders.ts`, `publish-sanitize.ts`, `secret-redaction.ts`.
- **Documentação:** `.cursor/skills/orquestrar/references/evidence-bus.md`, `.cursor/commands/evolve.md`.
- **Entradas/Saídas:** Entrada: objeto `Evidence`, identificadores de nó e run. Saída: arquivos JSON sanitizados no disco.
- **Dependências:** `node:fs`, `node:path`.
- **Consumidores:** `ExecutionEngine`, skill `orquestrar`, revisores, analistas de falha.
- **Estado:** `ATIVO` (Fundamental para a operação dos hard-gates do EvolveLoop).

### M06: WorkingContext, ContextBudget & Ranking
- **Tipo:** Montador de contexto de trabalho e aplicador de limites de tokens.
- **Responsabilidade:** Prepara o payload efêmero para chamadas ao modelo LLM durante spawns PDA. Aplica orçamento estrito (`max_paths`, `max_pages`, `max_tokens`), deduplica caminhos já citados em evidências e impede o truncamento no meio do conteúdo de fatias protegidas (`acceptance_criteria`, `security_restriction`, `evidence`, `gate_bundle`).
- **Arquivos-chave:** `orchestrator/src/context/budget.ts`, `retrieval-ranking.ts`, `tokenizer.ts`, `ownership.ts`, `compaction-contract.ts`.
- **Documentação:** `docs/adr/0013-context-ownership-working-context.md`, `docs/architecture/v2.2/`.
- **Entradas/Saídas:** Entrada: `ContextSlice[]`, limites de orçamento. Saída: `ContextBudgetApplyResult` com texto concatenado e fatias descartadas.
- **Dependências:** Tokenizer (`tiktoken:cl100k_base` ou fallback whitespace).
- **Consumidores:** `orchestrator/src/jobs/spawn-pickup-context.ts`, CLI `apply-context-budget`.
- **Estado:** `ATIVO` (Homologado na release V2.2).

### M07: GraphifyAdapter & Skill Graphify
- **Tipo:** Grafo de dependências e estrutura de código baseado em AST.
- **Responsabilidade:** Utiliza a ferramenta externa PyPI `graphifyy` para analisar a AST do repositório (`graphify update . --no-cluster`), gerando um grafo estático de dependências em `graphify-out/graph.json`. Permite consultas por caminho/símbolo com restrição de tokens (`graphify query`).
- **Arquivos-chave:** `orchestrator/src/v22/graphify-adapter.ts`, `.cursor/skills/graphify/SKILL.md`, `.cursor/skills/orquestrar/references/graphify-skill-gate.md`.
- **Documentação:** `docs/adr/0014-graphify-b3-benchmark-decision.md`.
- **Entradas/Saídas:** Entrada: query e orçamento de tokens. Saída: lista ranqueada de caminhos de código e arestas `EXTRACTED`/`INFERRED`.
- **Dependências:** Binário `graphify` (no venv dedicado `/tmp/graphify-skill-hardgate-venv/bin/graphify` ou PATH).
- **Consumidores:** Hard-gate em `orquestrar` (se CLI ausente, marca status `blocked` e prossegue para wiki); motor via flag `EVOLVELOOP_GRAPHIFY`.
- **Estado:** `EXPERIMENTAL / FLAG OPT-IN` (Default OFF no motor por ADR-0014; arquivo `graphify-out/graph.json` gerado no repositório com 7.4 MB).

### M08: Wiki Carpaccio (.ai/ & carpaccio.py)
- **Tipo:** Sistema de documentação local por repositório com verificação de integridade.
- **Responsabilidade:** Mantém notas Markdown em `.ai/pages/*.md` e um catálogo de integridade em `.ai/manifest.yaml`. Rastreia hashes SHA-256 dos arquivos de código referenciados por cada nota. O script `carpaccio.py lint` detecta desvios de código e marca páginas desatualizadas com `status: obsoleto`. O comando `query` realiza busca lexical ignorando páginas obsoletas.
- **Arquivos-chave:** `.cursor/skills/wiki-carpaccio/scripts/carpaccio.py`, `.cursor/skills/wiki-carpaccio/SKILL.md`, `.ai/`.
- **Documentação:** `docs/adr/0004-project-knowledge-contract.md`.
- **Entradas/Saídas:** Arquivos Markdown e YAML em `.ai/`. Saída JSON estruturada para subcomandos CLI (`init`, `query`, `update`, `lint`).
- **Dependências:** Python 3 (apenas biblioteca padrão: `hashlib`, `json`, `re`, `pathlib`).
- **Consumidores:** Agentes no ciclo `/evolve`, scripts de sincronização para vault (`sync-carpaccio-to-vault.sh`), Truth Fence.
- **Estado:** `ATIVO` (Instanciado na raiz do repositório com 6 notas e manifesto sincronizado).

### M09: Wiki Vault & gaabwiki
- **Tipo:** Motor de indexação e recuperação léxica e semântica sobre o cofre de notas.
- **Responsabilidade:** Motor em Python que processa árvores de documentação Markdown (`projects/`, `packs/`), divide documentos em chunks estruturados com cálculo de hashes de código fonte e realiza busca por sobreposição de termos (BM25) e verificação de staleness em tempo real (`source_hash_mismatch`). A versão canônica externa (`karpathyWiki`) integra opcionalmente LanceDB e Ollama.
- **Arquivos-chave:** `fixtures/evolveloop-wiki-vault/gaabwiki/indexing.py`, `cli.py`, `manifest.py`.
- **Documentação:** `docs/adr/0004-project-knowledge-contract.md`, `docs/adr/0005-hybrid-retrieval-degraded-mode.md`.
- **Entradas/Saídas:** Entrada: termos de busca e parâmetros de top-k. Saída: envelope JSON com documentos selecionados, pontuações e metadados de proveniência.
- **Dependências:** Python 3 (stdlib para a fixture local; LanceDB/Ollama para a versão full).
- **Consumidores:** `WikiKnowledgeBackend` no orquestrador TypeScript, rotinas de grounding em `wiki`.
- **Estado:** `ATIVO` (Fixture funcional incluída no repositório; cofre externo acessado via `$WIKI_ROOT`).

### M10: Skill wiki (Context Engineer)
- **Tipo:** Skill de agente e portão de controle procedimental.
- **Responsabilidade:** Implementa a persona "Context Engineer". Constitui o portão obrigatório de grounding no ciclo de desenvolvimento (`/evolve`). Proíbe que agentes iniciem implementação de código sem consultar o cofre e gerar o Context Pack padronizado (Fontes, Contratos, GAPs, Método, Handoff).
- **Arquivos-chave:** `.cursor/skills/wiki/SKILL.md`, `.cursor/skills/orquestrar/references/knowledge-grounding-gate.md`.
- **Documentação:** `.cursor/skills/wiki/SKILL.md`.
- **Entradas/Saídas:** Entrada: solicitação do usuário e identificador do projeto. Saída: Context Pack estruturado no chat e arquivo `memory/<feature_id>/evidence/grounding.json`.
- **Dependências:** Script `ground.sh`, CLI do cofre (`gaabwiki`), ambiente Cursor.
- **Consumidores:** Skill `orquestrar`, comando `/wiki`, engenheiros humanos.
- **Estado:** `ATIVO` (Componente central da política de qualidade do projeto).

### M11: Skill wiki-mem & Hooks de Sessão (mem.py)
- **Tipo:** Memória episódica de sessão e esteira de promoção de conhecimento.
- **Responsabilidade:** Captura o histórico de conversas do Cursor via hooks (`session-start`, `after-edit`, `session-end`, `stop`). Persiste registros em `$WIKI_ROOT/.ai/sessions/` (`current.json`, `index.jsonl`, `LATEST.md`). Disponibiliza busca sobre sessões passadas (`mem.py search`) e enfileira alterações de código em `promote-queue.md` para curadoria humana/agente posterior.
- **Arquivos-chave:** `.cursor/hooks/wiki-mem/mem.py`, `.cursor/skills/wiki-mem/SKILL.md`.
- **Documentação:** `.cursor/skills/wiki-mem/SKILL.md`, `profiles/default.yaml`.
- **Entradas/Saídas:** Entrada: eventos JSON dos hooks do Cursor. Saída: resumos de sessão (`LATEST.md`), fila de promoção (`promote-queue.md`).
- **Dependências:** Python 3 stdlib, diretório `$WIKI_ROOT`, integração de hooks do Cursor.
- **Consumidores:** Comando `/mem`, agente no papel de librarian.
- **Estado:** `DESATIVADO (Default) / EXPERIMENTAL` (O perfil padrão `profiles/default.yaml` define `memory.enabled: false`; os hooks não estão registrados em `.cursor/hooks.json`).

### M12: PatternAggregator
- **Tipo:** Sistema de aprendizado operacional sobre falhas de execução.
- **Responsabilidade:** Monitora o barramento de eventos do orquestrador (`NodeFailed`, `FeatureBlocked`). Agrupa falhas reincidentes pela chave composta `capability:provider_id:reason`. Calcula uma penalidade numérica dinâmica (`providerPenalty` de 0.0 a 0.3) aplicada pelo escalonador para evitar a reativação de provedores problemáticos.
- **Arquivos-chave:** `orchestrator/src/learning/pattern-aggregator.ts`.
- **Documentação:** Arquitetura interna do Orquestrador V2.
- **Entradas/Saídas:** Entrada: `EventEnvelope[]`. Saída: `FailurePattern[]` e score de penalidade por provedor.
- **Dependências:** TypeScript em memória.
- **Consumidores:** `ExecutionEngine`, `Scheduler`.
- **Estado:** `ATIVO` (Integrado nativamente no ciclo do orquestrador).

### M13: EvolveLoopStore & SignalStore
- **Tipo:** Repositório de estado de auto-evolução longitudinal do sistema.
- **Responsabilidade:** Persiste sinais de necessidade do sistema (`NeedSignal`), padrões detectados, candidatos a evolução e requisições de mudança estrutural. Explicitamente desacoplado da semântica de conhecimento/memória de projeto: mantém o histórico de evolução do próprio framework em `evolutionDir/snapshot.json`.
- **Arquivos-chave:** `orchestrator/src/evolveloop/store.ts`, `orchestrator/src/evolveloop/persistence/signal-store.ts`.
- **Documentação:** `orchestrator/src/persistence/paths.ts`.
- **Entradas/Saídas:** Entrada: sinais de execução e necessidades de capacidade. Saída: snapshot estruturado de evolução.
- **Dependências:** `node:fs`, `node:path`.
- **Consumidores:** Controladores longitudinais e observadores de registry.
- **Estado:** `ATIVO` (Operacional no subsistema de auto-otimização).

### M14: GraphStore (DAG de Execução — Esclarecimento de Escopo)
- **Tipo:** Repositório do DAG de execução de tarefas (Não-Conhecimento).
- **Responsabilidade:** Armazena o grafo orientado acíclico de dependências de execução das capacidades declaradas em um `CapabilityIR` (estados, contadores de retry, satisfação de dependências e ponteiros para evidências). Não armazena nem recupera entidades semânticas de domínio.
- **Arquivos-chave:** `orchestrator/src/graph/graph-store.ts`.
- **Documentação:** Arquitetura V2 do Orquestrador.
- **Entradas/Saídas:** Entrada: `CapabilityIR`. Saída: manipulação de nós de execução.
- **Dependências:** TypeScript em memória.
- **Consumidores:** `ExecutionEngine`, `Scheduler`.
- **Estado:** `ATIVO (Execução de Tarefas)` (Identificado no inventário para dissipar confusões conceituais com Grafos de Conhecimento).

### M15: Servidor MCP Memory (@modelcontextprotocol/server-memory)
- **Tipo:** Servidor de grafo de entidades e relações via Model Context Protocol.
- **Responsabilidade:** Ferramenta MCP padrão da comunidade para persistir nós, relações e observações em um arquivo JSON monolítico no host (`create_entities`, `create_relations`, `read_graph`).
- **Arquivos-chave:** `mcp/mcp.json`.
- **Documentação:** `docs/research/evolveloop-v2.2/03-repositories-and-tools.md`.
- **Entradas/Saídas:** Chamadas JSON-RPC via stdio.
- **Dependências:** Node.js / `npx`.
- **Consumidores:** Cursor IDE / Claude Desktop (se ativado pelo usuário).
- **Estado:** `DESCARTADO / INATIVO NO CORE` (A pesquisa do projeto avaliou o MCP e determinou formalmente seu descarte como SSOT de projeto por falta de isolamento entre múltiplos repositórios).

### M16: Diretório Raiz memory/
- **Tipo:** Diretório de trabalho local e persistência de evidências de execução.
- **Responsabilidade:** Área ignorada no controle de versão (`.gitignore`) utilizada durante execuções ao vivo do `/evolve`, benchmarks e testes forenses. Abriga os subdiretórios de features (`memory/<feature_id>/evidence/`, `plan.ir.yaml`) e diretórios históricos de auditoria (`memory/v22-close-100/`, `memory/v23-planning/`, `memory/token-forensics-2026-10-24/`).
- **Arquivos-chave:** `/home/gaab/Downloads/EvolveLoop/memory/`, `.gitignore`.
- **Documentação:** `.cursor/commands/evolve.md`.
- **Entradas/Saídas:** Arquivos JSON de evidência, planos YAML e relatórios de medição.
- **Dependências:** Sistema de arquivos local.
- **Consumidores:** Comandos de orquestração, scripts de benchmark, suítes de validação.
- **Estado:** `ATIVO (Espaço de Trabalho Local)` (Presente no ambiente atual contendo múltiplos registros de execuções anteriores).
