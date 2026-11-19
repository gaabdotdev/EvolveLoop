# Relatório de Componente: GraphStore (DAG de Execução — Esclarecimento de Escopo)

---

## 1. Identidade
- **O que é?**  
  Um repositório em TypeScript localizado em `orchestrator/src/graph/graph-store.ts`.
- **Qual é sua finalidade e por que está na auditoria?**  
  Frequentemente confundido com um *Knowledge Graph* ou grafo de conhecimento semântico devido ao nome `GraphStore`. Esta auditoria investigou o componente para dissipar ambiguidades.
- **Qual é sua responsabilidade efetivamente implementada?**  
  Gerenciar exclusivamente o **DAG (Grafo Orientado Acíclico) de execução de tarefas** originado de um plano de execução intermediário (`CapabilityIR`). Gerencia nós de tarefas (`GraphNode`), status de execução (`pending`, `satisfied`, `failed`, `skipped`), dependências entre nós (`dependenciesSatisfied`, `transitiveDependents`), contagem de retentativas (`retry_count`) e referências para evidências produzidas.
- **Conclusão de Auditoria:**  
  **O `GraphStore` NÃO armazena conhecimento, conceitos, entidades ou semântica de domínio.** É estritamente um componente do motor de escalonamento e execução de tarefas.

---

## 2. Localização e Código
- **Arquivo principal:** `orchestrator/src/graph/graph-store.ts`.
- **Tipos relacionados:** `orchestrator/src/types/index.ts` (`GraphNode`, `GraphSnapshot`, `NodeStatus`).

---

## 3. Estrutura e Métodos
- Mantém `this.nodes: Map<string, GraphNode>`.
- Métodos implementados: `getNode()`, `getAllNodes()`, `setNodeStatus()`, `setNodeEvidence()`, `incrementRetry()`, `dependenciesSatisfied()`, `transitiveDependents()`.

---

## 4. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/graph/graph-store.ts#L8-L100`.
- Nenhuma menção a entidades semânticas, embeddings ou conceitos. Apenas nós de computação e execução de capabilities.

---

## 5. Resumo operacional
- **Responsabilidade real:** DAG de dependência e controle de execução de tarefas do orquestrador.
- **Classificação:** Componente de runtime de execução (excluído do ciclo de vida de conhecimento de domínio).
