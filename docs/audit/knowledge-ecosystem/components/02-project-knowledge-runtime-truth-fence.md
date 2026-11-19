# Relatório de Componente: ProjectKnowledgeRuntime & TruthFence

---

## 1. Identidade
- **O que é?**  
  Um subsistema em TypeScript dentro de `orchestrator/src/knowledge/truth-source/` composto pela classe `ProjectKnowledgeRuntime` e pela função pura de cerca lógica `applyTruthFence()`.
- **Qual é sua finalidade declarada?**  
  Implementar a governança do conhecimento de projeto estabelecida no V22-GOAL-002, impondo uma hierarquia determinística de autoridade entre fontes conflitantes e garantindo proveniência e isolamento de escopo por projeto.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Ordenação hierárquica por níveis de autoridade: `code (rank 0) > ai (rank 1) > vault (rank 2) > inferred (rank 3)`.
  - Descarte estrito de itens de conhecimento desprovidos de proveniência rastreável (`source_ref`).
  - Demote e descarte de páginas da Wiki Carpaccio com `status: obsoleto`.
  - Resolução de conflito por chave de tópico (`topic_key`), onde o nível mais alto sempre suprime o mais baixo (`codeOverridesWiki`).
  - Detecção e prevenção de contaminação cruzada de projetos através de sentinelas/canários (`foreign_canary`).
- **Qual problema resolve?**  
  Evita que alucinações, notas de documentação desatualizadas ou hints inferidos se sobreponham à realidade do código-fonte em execução, e impede que conhecimentos de um projeto vazem para outro em ambientes monorepo.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/knowledge/truth-source/types.ts`: Constantes `TRUTH_TIER_RANK`, tipos `TruthSourceTier`, `TruthSourcedItem`, `KnowledgeProvenance`.
  - `orchestrator/src/knowledge/truth-source/fence.ts`: Funções de julgamento `applyTruthFence()` e `codeOverridesWiki()`.
  - `orchestrator/src/knowledge/truth-source/runtime.ts`: Classe `ProjectKnowledgeRuntime` e adaptador `fenceEvidenceSet()`.
  - `orchestrator/src/knowledge/truth-source/provenance.ts`: Validações de proveniência e normalização de status de páginas `.ai/`.
  - `orchestrator/src/knowledge/truth-source/isolation.ts`: Filtragem de escopo de projeto e verificação de canários de vazamento.
- **Módulos relacionados:**  
  - Provedor determinístico: `orchestrator/src/providers/deterministic/knowledge.ts`.
- **Configurações necessárias:**  
  - `KNOWLEDGE_TRUTH_FENCE`: Flag de controle (`on` por padrão; desativa com `off`, `0` ou `false`).
  - `PROJECT_ROOT` / `WORKSPACE_ROOT`: Raiz do projeto auditado para isolamento de caminho.
- **Documentação relevante:**  
  - `docs/adr/0004-project-knowledge-contract.md`.
  - Relatórios de metas V2.2 (`memory/v22-close-100/`).

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  Estruturas voláteis em memória (`this.items: TruthSourcedItem[]`) durante o ciclo de avaliação de uma consulta ou montagem de bundle.
- **Em qual formato?**  
  Objetos em memória estruturados:
  ```typescript
  interface TruthSourcedItem {
    topic_key: string;
    tier: TruthSourceTier; // "code" | "ai" | "vault" | "inferred"
    provenance: { source_ref: string; content_hash?: string; edge_kind?: "extracted" | "inferred" };
    excerpt?: string;
    ai_status?: "atual" | "obsoleto" | "draft" | "unknown";
    superseded?: boolean;
    rejection_reason?: string;
  }
  ```
- **Dados originais, derivados ou ambos?**  
  Dados derivados e enriquecidos com metadados de julgamento e proveniência a partir de hits do RAG ou leituras de código.
- **Existe persistência?**  
  Não possui armazenamento próprio em disco; opera como middleware de filtragem em memória antes de injetar contexto nos prompts ou devolver evidências.

---

## 4. Ciclo de vida
1. **Ingestão:**  
   O runtime recebe itens através de métodos específicos por tier: `ingestCode()`, `ingestAiPage()`, `ingestVaultHits()` ou `ingestRaw()`.
2. **Filtragem de Escopo:**  
   `filterItemsToProjectScope()` valida se os caminhos dos itens pertencem à raiz do projeto informado, prevenindo injeções de arquivos externos ao workspace.
3. **Julgamento de Cerca (`applyTruthFence`):**  
   - Para itens do tier `ai`, valida e normaliza o status da página. Se for `obsoleto`, marca como rejeitado.
   - Verifica integridade da proveniência (`isProvenanceComplete`). Se faltar `source_ref` válido, descarta com `missing_provenance`.
   - Agrupa candidatos pelo identificador de tópico (`topic_key`). Se houver múltiplos itens para o mesmo tópico, calcula a prioridade numérica baseada em `TRUTH_TIER_RANK` (`code: 0` > `ai: 1` > `vault: 2` > `inferred: 3`).
   - O item de maior autoridade vence; o perdedor é registrado na lista `rejected` com `superseded: true` e `rejection_reason: "superseded_by_higher_tier"`.
4. **Devolução:**  
   Retorna uma estrutura `TruthFenceResult` particionada em `accepted` (ordenados por rank de autoridade) e `rejected`.
5. **Integração com EvidenceSet (`fenceEvidenceSet`):**  
   Filtra hits de um `EvidenceSet`, descartando entradas anônimas e ajustando o `retrieval_method` para `${set.retrieval_method}:truth_fence`.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - Diretamente invocado pelas funções `knowledgeSearch()` e `knowledgeInspect()` em `orchestrator/src/providers/deterministic/knowledge.ts`.
  - Invocado internamente na montagem de bundles de injeção em testes de integração e harnesses de grounding.
- **Fluxo de execução:**  
  Toda busca determinística realizada pelo orquestrador passa compulsoriamente por `fenceEvidenceSet()`, a menos que o usuário tenha desativado a flag explicitamente (`disableTruthFence: true` ou `KNOWLEDGE_TRUTH_FENCE=off`).
- **Obrigatoriedade:**  
  Obrigatório por padrão em chamadas de capacidade do motor.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  - Ao final de cada execução da capability `knowledge.search`.
  - Ao final de cada execução da capability `knowledge.inspect`.
  - Na montagem de pacotes de contexto que consolidam trechos de código e notas da Wiki.
- **Caminhos que evitam sua utilização:**  
  Definir a variável de ambiente `KNOWLEDGE_TRUTH_FENCE=off`.

---

## 7. Entradas e saídas
- **Entrada:**  
  `EvidenceSet` bruto vindo do `WikiKnowledgeBackend`, ou lista direta de `TruthSourcedItem`.
- **Saída:**  
  `EvidenceSet` higienizado com hits ordenados por autoridade, garantindo que hits sem proveniência ou desatualizados tenham sido purgados.
- **Perdas esperadas:**  
  Páginas com marcação de obsolescência e hits com `source: "unknown"` são intencionalmente descartados para evitar alucinações.

---

## 8. Dependências e integração
- **Dependências de sistema:** Nenhuma dependência externa; lógica pura em TypeScript.
- **Componentes do EvolveLoop dependentes:**  
  `orchestrator/src/providers/deterministic/knowledge.ts`.
- **Impacto de indisponibilidade:**  
  Como é uma biblioteca interna estática sem I/O de rede ou processo, não sofre falhas de infraestrutura.

---

## 9. Configuração e operação
- **Configurações:**  
  `KNOWLEDGE_TRUTH_FENCE`: `"on"` (padrão) ou `"off"`.
- **Testabilidade:**  
  Executável diretamente via Vitest sem necessidade de infraestrutura ativa.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  `orchestrator/tests/unit/knowledge/truth-source-fence.test.ts`: 9 testes cobrindo ordenação de autoridade, descarte de notas obsoletas, supressão de vault por código, rejeição de ausência de proveniência e isolamento de canários entre projetos.
- **Comprovação:** `VERIFIED_BY_TEST` (9/9 testes aprovados).
- **Consistência:** Extremamente alta; garante a regra fundamental de que o código real sempre prevalece sobre a documentação escrita.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/knowledge/truth-source/fence.ts#L23-L74`.
- `VERIFIED_IN_CODE`: Invocação padrão em `orchestrator/src/providers/deterministic/knowledge.ts#L52-L54`.
- `VERIFIED_BY_TEST`: Vitest em `orchestrator/tests/unit/knowledge/truth-source-fence.test.ts`.

---

## 12. Resumo operacional
- **Responsabilidade real:** Juiz determinístico de autoridade e proveniência para dados de conhecimento.
- **Quem o utiliza:** Provedor determinístico de conhecimento (`knowledge.ts`).
- **Quando é acionado:** Em toda busca ou inspeção de conhecimento no orquestrador.
- **Fonte de dados:** Hits do RAG e itens de código extraídos do projeto.
- **Principal dependência:** Nenhuma (TypeScript puro).
- **Principal risco / limitação:** Depende de o extrator fornecer um `topic_key` coerente para correlacionar itens concorrentes.
- **O que falta verificar:** Avaliar se chaves de tópicos inferidas automaticamente por LLM mantêm precisão frente a nomes de funções renomeadas.
