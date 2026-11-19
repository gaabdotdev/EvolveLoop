# Relatório de Componente: MemoryStore & FilesystemMemoryStore

---

## 1. Identidade
- **O que é?**  
  Um subsistema de persistência de memória episódica e contextual escopado por feature (`featureId`), implementado pelas classes `MemoryStore` (em memória) e `FilesystemMemoryStore` (disco).
- **Qual é sua finalidade declarada?**  
  Armazenar o contexto volátil ou semi-persistente gerado durante a execução de uma tarefa/feature (como preferências expressas pelo usuário, decisões pontuais de implementação e feedbacks de rejeição).
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Escopo isolado por `featureId`.
  - Confinamento estrito de caminhos (`assertFeatureIdConfined`), bloqueando caracteres de path traversal (`/`, `\`, `..`).
  - Segregação de tipos de memória: armazena `context.yaml` (metadados da feature), `preferences.yaml` (entradas com `type: "preference"` ou `"rejection_feedback"`) e `decisions.yaml` (entradas com `type: "decision"`).
  - Validação estrita de formato e parsing de YAML via `readEntriesFile()`.
- **Qual problema resolve?**  
  Garante que decisões e preferências tomadas no escopo de uma feature não contaminem o escopo de outras features e possam ser consultadas pelo escalonador para orientar workers durante o ciclo de vida daquela demanda específica.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/memory/memory-store.ts`: Classe base em memória, métodos de filtro `getPreferences()` e `getDecisions()`.
  - `orchestrator/src/memory/filesystem-memory-store.ts`: Persistência em disco, layout YAML e segurança `assertFeatureIdConfined`.
  - `orchestrator/src/types/index.ts`: Interface `MemoryEntry`.
- **Módulos relacionados:**  
  - `orchestrator/src/engine/execution-engine.ts`.
  - `orchestrator/src/cli/run-engine.ts`.
- **Configurações necessárias:**  
  - Diretório raiz `memoryDir`, configurado em `paths.ts` como `join(root, "memory")`.
- **Documentação relevante:**  
  - `.cursor/skills/orquestrar/references/specs/knowledge-memory.md`.
  - `docs/adr/0013-context-ownership-working-context.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  Sob `<memoryDir>/<featureId>/`:
  - `<featureId>/context.yaml`: Metadados (`ir_id`, `policy`, `started_at`, `user_request`).
  - `<featureId>/preferences.yaml`: Lista YAML de preferências e feedbacks.
  - `<featureId>/decisions.yaml`: Lista YAML de decisões arquiteturais.
- **Em qual formato?**  
  Arquivos YAML puros estruturados:
  ```yaml
  entries:
    - timestamp: "2026-10-24T12:00:00Z"
      source: "user"
      type: "preference"
      content: "Utilizador prefere botões primários na cor azul"
  ```
- **Dados originais ou derivados?**  
  Dados originais capturados do fluxo de execução e interação.
- **Existe persistência?**  
  Sim, no `FilesystemMemoryStore`. Cada `append()` regrava o respectivo arquivo YAML em disco.

---

## 4. Ciclo de vida
1. **Inicialização (`initFeature`):**  
   Cria o escopo em memória e persiste o arquivo `context.yaml`.
2. **Adição de Entradas (`append`):**  
   Valida o confinamento do `featureId`, adiciona o `MemoryEntry` no array da feature e chama `persistEntries()`, reescrevendo `preferences.yaml` e `decisions.yaml`.
3. **Consulta:**  
   Métodos `getPreferences(featureId)` e `getDecisions(featureId)` devolvem clones defensivos das entradas correspondentes.
4. **Recarregamento:**  
   Ao reiniciar, `FilesystemMemoryStore` varre todos os subdiretórios de `rootDir`, valida cada nome contra path traversal e hidrata o estado em memória.
5. **Invalidação / Exclusão:**  
   Não há API de exclusão de entradas individuais; exclusão é feita removendo o subdiretório da feature.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - `orchestrator/src/cli/run-engine.ts#L284`: Instancia `FilesystemMemoryStore(dataPaths.memoryDir)`.
  - `orchestrator/src/engine/execution-engine.ts#L747`: Ao encerrar um nó com `contextual_learnings`, grava em `this.memory.append(featureId, ...)` e emite o evento `MemoryWritten`.
- **Obrigatoriedade:** Automático e acoplado ao `ExecutionEngine`.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  Ao final da execução de nós de tarefa do IR que produzam aprendizados contextuais.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:**  
  `MemoryEntry` estruturado (`timestamp: string`, `source: string`, `type: string`, `content: string`).
- **Saída:**  
  Coleções de `MemoryEntry[]` filtradas por tipo.
- **Higienização:**  
  O motor aplica `redactSecrets(entry.content)` antes de persistir na memória.

---

## 8. Dependências e integração
- **Dependências:** `node:fs`, `node:path`, `yaml`, `assertFeatureIdConfined`.
- **Desacoplamento verificado no checkout atual:**  
  **Embora o diretório `memory/` exista na raiz do repositório, NÃO EXISTEM arquivos `preferences.yaml`, `context.yaml` ou `decisions.yaml` gravados nele.**  
  Os agentes humanos e o skill `/evolve` utilizam a pasta `memory/<feature_id>/` para armazenar `evidence/` (JSONs dos gates) e `plan.ir.yaml`, demonstrando que o `FilesystemMemoryStore` do TypeScript opera desacoplado do fluxo cotidiano dos agentes no Cursor.

---

## 9. Configuração e operação
- **Configuração:** `paths.resolveDataPaths(root).memoryDir`.
- **Segurança (SEC-002):** Bloqueio estrito de injeções de caracteres de diretório (`assertFeatureIdConfined`).

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/filesystem-stores.test.ts`.
  - `orchestrator/tests/unit/knowledge-memory.test.ts`.
- **Comprovação:** `VERIFIED_BY_TEST` (100% aprovados via Vitest).
- **Resiliência:** Lança erro tipado `MemoryFormatError` se um arquivo YAML estiver corrompido ou fora do formato esperado.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/memory/filesystem-memory-store.ts#L134-L191`.
- `VERIFIED_IN_CODE`: Confinamento em `orchestrator/src/memory/filesystem-memory-store.ts#L13-L23`.
- `OBSERVED_AT_RUNTIME`: Ausência total de arquivos `preferences.yaml` ou `context.yaml` na árvore física `memory/` do repositório.

---

## 12. Resumo operacional
- **Responsabilidade real:** Store de memória contextual por feature baseado em arquivos YAML locais.
- **Quem o utiliza:** `ExecutionEngine` em runtime TypeScript.
- **Quando é acionado:** Na inicialização de features e registro de aprendizados contextuais de tarefas.
- **Fonte de dados:** Nós de tarefa do plano de execução.
- **Principal dependência:** Sistema de arquivos e confinamento de caminho.
- **Principal risco / limitação:** Descompasso com os agentes Cursor: os agentes interagem com a pasta `memory/` gravando arquivos de evidência (`evidence/`), ignorando a API do `MemoryStore`.
- **O que falta verificar:** Avaliar a necessidade de manter este componente caso a memória de sessão seja inteiramente centralizada no `wiki-mem` ou em relatórios de evidência.
