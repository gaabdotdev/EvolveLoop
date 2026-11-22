# Relatório de Componente: KnowledgeStore & FilesystemKnowledgeStore

---

## 1. Identidade
- **O que é?**  
  Um repositório interno de regras e padrões em TypeScript composto pela classe base em memória `KnowledgeStore` e pela subclasse persistente em sistema de arquivos `FilesystemKnowledgeStore`.
- **Qual é sua finalidade declarada?**  
  Manter o repositório permanente de aprendizados consolidados do projeto (padrões de arquitetura, armadilhas frequentes, bugs históricos, decisões de design, lições aprendidas e contratos).
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Armazenamento de entradas tipadas (`KnowledgeEntry`) contendo `id`, `kind`, `content`, `tags`, `capabilities` e `confidence`.
  - Busca lexical simples filtrando por substring no texto (`content`), igualdade de capability e intersecção de tags.
  - Proposição de novas entradas (`propose()`) com geração de ID (`kb-<timestamp>-<hash>`) e confiança inicial de 0.5.
  - Verificação e incremento de confiança (`verify()`, soma +0.3 até o teto de 1.0).
  - Persistência estruturada em diretórios particionados por tipo (`patterns`, `pitfalls`, `bugs`, `decisions`, `learned-lessons`, `contracts`) como arquivos Markdown individuais com frontmatter YAML e um índice centralizador `index.yaml`.
- **Qual problema resolve?**  
  Fornece uma base de conhecimento estruturada e versionável em Git que permite ao orquestrador consultar armadilhas antes de escalonar tarefas técnicas e registrar aprendizados duráveis gerados pelos workers.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/knowledge/knowledge-store.ts`: Classe base em memória `KnowledgeStore` e interface `KnowledgeQuery`.
  - `orchestrator/src/knowledge/filesystem-knowledge-store.ts`: Classe `FilesystemKnowledgeStore`, funções `loadFromDisk()`, `writeEntry()` e `writeIndex()`.
  - `orchestrator/src/types/index.js`: Definições das interfaces `KnowledgeEntry` e `ProposedKnowledgeEntry`.
- **Módulos relacionados:**  
  - `orchestrator/src/engine/execution-engine.ts`.
  - `orchestrator/src/scheduler/scheduler.ts`.
  - `orchestrator/src/cli/run-engine.ts`.
- **Configurações necessárias:**  
  - Diretório raiz de dados (`knowledgeDir`, resolvido por padrão como `<root>/knowledge`).
- **Documentação relevante:**  
  - `.cursor/skills/orquestrar/references/specs/knowledge-memory.md`: Especificação normativa da distinção entre Knowledge permanente e Memory contextual.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  - Na versão em memória: array `entries: KnowledgeEntry[]`.
  - Na versão em disco: sob `<rootDir>/` (esperado: `knowledge/` na raiz do projeto).
- **Em qual formato?**  
  - Arquivos Markdown individuais com frontmatter YAML:
    ```yaml
    ---
    id: pattern-contract-first
    kind: pattern
    capability: [api-contract, backend-implementation]
    tags: [parallelism]
    confidence: 0.95
    updated_at: 2026-10-24
    ---
    Corpo explicativo em Markdown...
    ```
  - Catálogo central `index.yaml`:
    ```yaml
    entries:
      - id: pattern-contract-first
        kind: pattern
        path: patterns/pattern-contract-first.md
        capabilities: [...]
        tags: [...]
        confidence: 0.95
    ```
- **Dados originais ou derivados?**  
  Armazena tanto dados canônicos (as regras criadas) quanto índices derivados (`index.yaml`).
- **Existe persistência?**  
  Sim, no `FilesystemKnowledgeStore`. Cada operação de `propose()` ou `verify()` grava o arquivo `.md` correspondente e rescreve o `index.yaml`.

---

## 4. Ciclo de vida
1. **Carregamento Inicial (`loadFromDisk`):**  
   Ao instanciar `FilesystemKnowledgeStore(rootDir)`:
   - Se `rootDir` não existir, inicializa com array vazio.
   - Se existir `rootDir/index.yaml`, lê o índice e carrega os arquivos Markdown listados.
   - Caso `index.yaml` não exista, varre as subpastas (`patterns`, `pitfalls`, `bugs`, etc.) carregando todos os arquivos `.md`.
2. **Consulta (`search`):**  
   Executa filtro síncrono em memória comparando `capability`, `tags` e `text.toLowerCase()`.
3. **Proposição (`propose`):**  
   Recebe `ProposedKnowledgeEntry`, gera ID único com timestamp e grava arquivo `.md` e `index.yaml` em disco. Emite evento `KnowledgeProposed`.
4. **Verificação (`verify`):**  
   Incrementa o valor de `confidence` do item em +0.3 (limitado a 1.0) e atualiza o arquivo no disco.
5. **Invalidação / Exclusão:**  
   Não há método programático de remoção ou invalidação implementado na classe (apenas exclusão manual de arquivo e reconstrução do índice).

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - `orchestrator/src/cli/run-engine.ts#L283`: Instancia `FilesystemKnowledgeStore(dataPaths.knowledgeDir)` e repassa para o `ExecutionEngine`.
  - `orchestrator/src/engine/execution-engine.ts#L760`: Ao concluir a execução de um nó de tarefa, se o resultado contiver `durable_learnings`, invoca `this.knowledge.propose()` e emite `KnowledgeProposed`.
  - `orchestrator/src/scheduler/scheduler.ts#L122`: Antes de escalonar um nó de execução, se a política definir `policy.spec.knowledge?.consult_before_schedule: true`, consulta `this.knowledge.search({ capability: node.capability })` e repassa os hits na requisição `ExecuteRequest`.
- **Obrigatoriedade:**  
  Opcional/condicional à política de execução (`consult_before_schedule`).

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  - No agendamento de nós de tarefa pelo escalonador (leitura).
  - No encerramento bem-sucedido de jobs com aprendizados duráveis (escrita).
- **Caminhos que evitam sua utilização:**  
  - Quando a política não ativa `consult_before_schedule`.
  - Quando os nós de execução não emitem `durable_learnings`.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada de consulta:**  
  `KnowledgeQuery` com filtros opcionais de `capability`, `tags` e `text`.
- **Saída de consulta:**  
  Array de `KnowledgeEntry[]`.
- **Perdas de informação:**  
  A busca por texto é uma busca simples de substring (`includes`), sem suporte a tokenização radical, tolerância a erros tipográficos, sinônimos ou ranking semântico.

---

## 8. Dependências e integração
- **Dependências diretas:** `node:fs`, `node:path`, biblioteca `yaml`.
- **Acoplamento:** Fortemente acoplado ao `ExecutionEngine` e ao `Scheduler`.
- **Estado no repositório atual:**  
  **A pasta `knowledge/` NÃO EXISTE na raiz do repositório de trabalho.** Portanto, em runtime no repositório atual, `loadFromDisk()` retorna `[]` e nenhuma regra pré-existente é carregada a partir do disco.

---

## 9. Configuração e operação
- **Configuração:** Caminho `dataPaths.knowledgeDir` resolvido em `orchestrator/src/persistence/paths.ts` como `join(root, "knowledge")`.
- **Comportamento em ambiente incompleto:** Gracioso: se o diretório não existir, inicializa silenciosamente com zero entradas.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/filesystem-stores.test.ts`: Testa salvamento, recarregamento e idempotência do `FilesystemKnowledgeStore`.
  - `orchestrator/tests/unit/knowledge-memory.test.ts`: Testa busca, proposição e verificação no `KnowledgeStore`.
- **Comprovação:** `VERIFIED_BY_TEST` (testes passam com 100% de sucesso).
- **Limitação de consistência:** Se arquivos forem editados manualmente sem atualizar o `index.yaml`, o índice em disco fica inconsistente com os arquivos Markdown.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/knowledge/filesystem-knowledge-store.ts#L104-L124`.
- `VERIFIED_IN_CODE`: Invocação pelo escalonador em `orchestrator/src/scheduler/scheduler.ts#L122`.
- `OBSERVED_AT_RUNTIME`: Ausência do diretório `knowledge/` no checkout atual (`ls knowledge` resultou em código de erro 2).

---

## 12. Resumo operacional
- **Responsabilidade real:** Store de regras e padrões estruturados em arquivos Markdown com catálogo YAML.
- **Quem o utiliza:** O motor de execução e o escalonador do orquestrador.
- **Quando é acionado:** Pré-agendamento de tarefas e pós-conclusão de nós com aprendizados duráveis.
- **Fonte de dados:** Arquivos locais na pasta `knowledge/`.
- **Principal dependência:** Acesso ao sistema de arquivos local.
- **Principal risco / limitação:** No checkout atual a pasta física não foi criada; a busca lexical por substring é excessivamente rasa para recuperação técnica avançada.
- **O que falta verificar:** Avaliar por que as regras consolidadas do projeto foram migradas para o cofre da Wiki ou para `.ai/pages` em vez de serem gravadas em `knowledge/`.
