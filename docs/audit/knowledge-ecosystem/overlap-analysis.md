# Análise de Sobreposições, Duplicidades e Fragmentação

> **Objetivo:** Comparar os mecanismos identificados, examinando responsabilidades compartilhadas, coexistência de representações múltiplas e potenciais redundâncias sem prescrever soluções simplistas ou descartes precipitados.

---

## 1. Visão Geral das Zonas de Sobreposição

A auditoria identificou três grandes zonas de sobreposição funcional no ecossistema:

1. **Zona 1: Documentação e Conhecimento Canônico**
   - `.ai/pages/*.md` (Wiki Carpaccio local) vs `$WIKI_ROOT/projects/evolveloop/pages/*.md` (Wiki Vault) vs `knowledge/` (`FilesystemKnowledgeStore`).
2. **Zona 2: Memória de Sessão e Contexto de Execução**
   - `MemoryStore` (`orchestrator/src/memory/`) vs `wiki-mem` (`.cursor/hooks/wiki-mem/mem.py`) vs `WorkingContext` (`orchestrator/src/context/`) vs `EvidenceBus` (`memory/<id>/evidence/`).
3. **Zona 3: Descoberta Estrutural e Grafo de Código**
   - `Graphify` (grafo AST de dependências) vs `gaabwiki` (BM25 + hashes de código) vs `retrieval-ranking.ts` (ranqueamento determinístico por termos).

---

## 2. Análise Detalhada por Par/Grupo de Componentes

---

### Sobreposição A: Wiki Carpaccio (`.ai/pages`) vs Wiki Vault (`gaabwiki` em `$WIKI_ROOT`)

#### 1. Componentes Envolvidos
- **Wiki Carpaccio:** `.ai/pages/*.md` + `.cursor/skills/wiki-carpaccio/scripts/carpaccio.py`.
- **Wiki Vault:** `$WIKI_ROOT/projects/evolveloop/pages/*.md` + `gaabwiki` (`fixtures/evolveloop-wiki-vault/`).

#### 2. Responsabilidade Compartilhada
Ambos armazenam documentação técnica sobre o projeto EvolveLoop associada aos arquivos de código fonte, calculam hashes SHA-256 desses arquivos e oferecem busca lexical para alimentar agentes com contexto de arquitetura.

#### 3. Diferenças Funcionais
| Critério | Wiki Carpaccio (`.ai/`) | Wiki Vault (`gaabwiki`) |
|---|---|---|
| **Escopo** | Exclusivo do repositório local corrente. | Global / Multi-projeto (guarda múltiplos repositórios e packs). |
| **Localização Física** | Commitado na raiz do repositório Git (`.ai/`). | Fora do repositório, em cofre central (`$WIKI_ROOT`). |
| **Recuperação** | Busca direta em arquivos `.md` por `carpaccio.py query`. | Índice compilado (`.data/manifest.json`), BM25 e opcional vetorial. |
| **Detecção de Staleness** | `carpaccio.py lint` reescreve a nota local com `status: obsoleto`. | `gaabwiki.search` emite flag `stale: true` no retorno do hit em runtime. |

#### 4. Evidências da Sobreposição
- O script `docs/architecture/v2.2/scripts/sync-carpaccio-to-vault.sh` copia literalmente os arquivos de `.ai/pages/` para o diretório `$VAULT/projects/evolveloop/pages/` (`VERIFIED_IN_CODE`).
- O mesmo documento (ex.: `backend-resolve-wiki.md`) existe fisicamente tanto em `.ai/pages/` quanto dentro do vault (`OBSERVED_AT_RUNTIME`).

#### 5. Benefícios Atuais de Manter Ambos
- O `.ai/` é imediatamente portável com o repositório, funciona para qualquer desenvolvedor que clone o Git sem exigir configuração de um cofre externo na máquina.
- O Vault permite correlacionar projetos distintos (ex.: EvolveLoop + KernelBot + OrbitBot) em uma única interface corporativa.

#### 6. Custos e Riscos de Manter Ambos
- **Risco de Dessincronização:** Se uma nota for editada em `.ai/` e o script de sync não for rodado, a Wiki externa fica com dados desatualizados.
- **Duplicidade de Índices:** Dois manifestos rastreiam os mesmos hashes (`.ai/manifest.yaml` e `.data/manifest.json`).

#### 7. Informações Faltantes para Decisão
- Medição de quantas vezes o desenvolvedor efetivamente consulta notas de outros projetos durante a codificação no EvolveLoop.

---

### Sobreposição B: `KnowledgeStore` (TypeScript) vs Wiki Carpaccio (`.ai/`)

#### 1. Componentes Envolvidos
- `FilesystemKnowledgeStore` (`orchestrator/src/knowledge/filesystem-knowledge-store.ts`).
- `Wiki Carpaccio` (`.ai/pages/`).

#### 2. Responsabilidade Compartilhada
Ambos propõem armazenar regras, padrões de arquitetura e decisões técnicas em formato Markdown com cabeçalho YAML dentro do repositório.

#### 3. Diferenças Funcionais
- O `FilesystemKnowledgeStore` possui categorização rígida por pastas (`patterns`, `pitfalls`, `bugs`, `decisions`, `contracts`, `learned-lessons`) e métricas de `confidence`. É consumido diretamente pelo escalonador TypeScript via `consult_before_schedule`.
- O `Wiki Carpaccio` organiza o conhecimento por tópicos livres, mas vincula cada nota a arquivos de código fonte com rastreamento criptográfico de integridade.

#### 4. Evidências da Sobreposição
- No checkout atual, **a pasta física `knowledge/` nem sequer existe** (`OBSERVED_AT_RUNTIME`). Todas as decisões técnicas reais foram registradas em `.ai/pages/` ou em `docs/adr/`.
- O código do `FilesystemKnowledgeStore` continua ativo e testado na suíte do Vitest, mas opera como um store fantasma no repositório de trabalho.

#### 5. Benefícios Atuais de Manter Ambos
Nenhum benefício operacional demonstrado pelas evidências.

#### 6. Custos e Riscos de Manter Ambos
- Confusão cognitiva para o desenvolvedor e agentes: a especificação em `specs/knowledge-memory.md` descreve a pasta `knowledge/` como permanente, mas o projeto utiliza `.ai/`.

#### 7. Informações Faltantes para Decisão
- Avaliar se a funcionalidade `verify()` (incremento de confiança) e `consult_before_schedule` do escalonador são requeridas pela versão V3 do framework.

---

### Sobreposição C: `MemoryStore` (TypeScript) vs `wiki-mem` (`mem.py`) vs `EvidenceBus`

#### 1. Componentes Envolvidos
- `FilesystemMemoryStore` (`orchestrator/src/memory/filesystem-memory-store.ts`).
- `wiki-mem` (`.cursor/hooks/wiki-mem/mem.py`).
- `EvidenceBus` (`orchestrator/src/evidence/evidence-bus.ts`).

#### 2. Responsabilidade Compartilhada
Os três subsistemas pretendem registrar a memória das ações e do contexto gerado durante a execução de tarefas.

#### 3. Diferenças Funcionais
| Mecanismo | O que grava | Onde grava | Ativação |
|---|---|---|---|
| **`FilesystemMemoryStore`** | `preferences.yaml` e `decisions.yaml` por feature. | `memory/<feature_id>/` | Código do `ExecutionEngine`. |
| **`wiki-mem`** | Histórico de conversas Cursor e digest de edições. | `$WIKI_ROOT/.ai/sessions/` | Hooks do Cursor IDE (desativado por default). |
| **`EvidenceBus`** | JSONs dos gates de qualidade (`gate.testing.json`, etc.). | `memory/<feature_id>/evidence/` | Obrigatório no ciclo `/evolve`. |

#### 4. Evidências da Sobreposição
- Existem três pastas com nome ou semântica de "memória" no projeto:
  1. A pasta física `memory/` na raiz do monorepo.
  2. O módulo TypeScript `orchestrator/src/memory/`.
  3. A pasta de sessões `$WIKI_ROOT/.ai/sessions/` mantida pelo `wiki-mem`.
- No disco de trabalho, a pasta `memory/` é utilizada exclusivamente pelo `EvidenceBus` e pelos relatórios de planejamento; o `FilesystemMemoryStore` não gravou nenhum arquivo no checkout.

#### 5. Benefícios Atuais de Manter Ambos
- O `EvidenceBus` atende à necessidade operacional imediata de travas de portão (Gates).
- O `wiki-mem` atende à necessidade de continuidade entre conversas humanas na IDE.

#### 6. Custos e Riscos de Manter Ambos
- Fragmentação extrema do conceito de "Memória". O desenvolvedor não tem clareza se uma preferência deve ser registrada em `preferences.yaml`, em um gate JSON ou no `log.md`.

#### 7. Informações Faltantes para Decisão
- Decisão formal se a memória episódica do EvolveLoop deve residir no repositório de trabalho ou no cofre global.

---

### Sobreposição D: Graphify (AST) vs Retrieval Léxico da Wiki (BM25)

#### 1. Componentes Envolvidos
- `GraphifyAdapter` + skill `graphify` (AST code graph).
- `WikiKnowledgeBackend` + `gaabwiki` (BM25 sobre notas).

#### 2. Responsabilidade Compartilhada
Ambos fornecem contexto de código para o agente antes da implementação, ajudando a identificar quais arquivos precisam ser lidos ou alterados.

#### 3. Diferenças Funcionais
- O **Graphify** analisa o código fonte diretamente através da sintaxe da linguagem (árvore sintática abstrata). Constrói arestas precisas de chamadas, herança e importações (`from → to`), mas ignora decisões de negócio e contratos conceituais.
- A **Wiki** recupera documentos em prosa e contratos explicativos redigidos por humanos, contextualizando o "porquê" de certas decisões de design.

#### 4. Evidências de Coexistência
- O benchmark oficial documentado no ADR-0014 (`V22-GOAL-008`) comprovou que o Graphify empatou em recall com a Wiki em cenários de busca de arquivos de código (recall 6/6), apresentando latência significativamente inferior (724 ms vs ~2000 ms), mas tokens ligeiramente superiores (`VERIFIED_IN_CODE`).
- O hard-gate do EvolveLoop determinou a execução sequencial: o subset do Graphify roda primeiro para topologia de código, seguido pelo grounding da Wiki para contratos (`VERIFIED_IN_CODE`).

#### 5. Benefícios Atuais de Manter Ambos
- Complementaridade comprovada: a AST fornece a malha física do software; a Wiki fornece o significado arquitetural e regras de negócio.

#### 6. Custos e Riscos de Manter Ambos
- O arquivo gerado `graphify-out/graph.json` é grande (7.4 MB) e a dependência de um pacote PyPI externo (`graphifyy`) em venv isolado adiciona atrito operacional.
