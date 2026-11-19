# Relatório de Componente: WorkingContext, ContextBudget & Ranking

---

## 1. Identidade
- **O que é?**  
  Um subsistema em TypeScript localizado em `orchestrator/src/context/` responsável pelo empacotamento, ranqueamento determinístico, orçamentação e controle de tamanho do contexto de trabalho (*Working Context*) injetado em chamadas a modelos LLM.
- **Qual é sua finalidade declarada?**  
  Implementar as diretrizes do ADR-0013 e da meta V22-GOAL-006, garantindo que o contexto montado para cada spawn de agente respeite orçamentos estritos de tokens, caminhos e páginas sem recorrer a stores permanentes desnecessários e sem truncar seções críticas.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Definição do conceito normativo de *Working Context*: payload efêmero e descartável montado por chamada ao modelo (não persistido como SSOT).
  - Isolamento de dono por spawn (`context_owner_id`), derivado de `parent_cycle_id`, `role` e `spawn_depth`.
  - Ranqueamento determinístico de relevância (`RetrievalRanking`) baseado em termos da query, caminhos citados e prefixos estruturais, sem circularidade.
  - Aplicação de limites de orçamento (`ContextBudgetLimits`: `max_paths`, `max_pages`, `max_tokens`).
  - Proteção absoluta de fatias críticas (`acceptance_criteria`, `security_restriction`, `evidence`, `gate_bundle`), que nunca são truncadas no meio do texto.
  - Deduplicação de caminhos já presentes em evidências (`evidence_paths`).
  - Medição de tokens com tokenizador nomeado (`tiktoken:cl100k_base` ou proxy por whitespace).
  - Bloqueio de reinjeção cega de compactação destrutiva (`CompactionReinjectContract` mantido *fail-closed* / `NOT_IMPLEMENTED`).
- **Qual problema resolve?**  
  Evita estouro de janela de contexto em prompts de agentes, impede perda silenciosa de critérios de aceite ou restrições de segurança por truncamento ingênuo e previne alucinações causadas por sumários destrutivos.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/context/types.ts`: Interfaces `ContextSlice`, `ContextBudgetLimits`, `ContextOwnerId`, `ContextBudgetApplyResult`.
  - `orchestrator/src/context/budget.ts`: Função `applyContextBudget()` e conjunto de fatias protegidas `PROTECTED_KINDS`.
  - `orchestrator/src/context/retrieval-ranking.ts`: Algoritmo `rankContextPaths()` e tokenização determinística de termos.
  - `orchestrator/src/context/tokenizer.ts`: Função `countTokens()` com suporte a tiktoken e fallback.
  - `orchestrator/src/context/ownership.ts`: Resolução de `context_owner_id`.
  - `orchestrator/src/context/compaction-contract.ts`: Contrato de proteção contra compactação sem teste de fidelidade.
- **Módulos relacionados:**  
  - `orchestrator/src/jobs/spawn-pickup-context.ts`.
  - `orchestrator/src/cli/apply-context-budget.ts`.
- **Documentação relevante:**  
  - `docs/adr/0013-context-ownership-working-context.md`.
  - `docs/architecture/v2.2/`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  O Working Context **não possui store permanente próprio** (princípio normativo do ADR-0013). Opera exclusivamente em memória durante a montagem da requisição de inferência e é descartado após a resposta do modelo.
- **Em qual formato?**  
  Lista de fatias estruturadas (`ContextSlice`):
  ```typescript
  interface ContextSlice {
    path: string;
    kind: ContextSliceKind; // "acceptance_criteria" | "security_restriction" | "evidence" | "gate_bundle" | "code" | "spec" | ...
    priority: number;
    content: string;
  }
  ```
- **Persistência vs Efemeridade:**  
  Estritamente efêmero. O que sobrevive após a execução é apenas o que for gravado em arquivos de evidência (`EvidenceBus`), na memória da feature (`MemoryStore`) ou em commits de código.

---

## 4. Ciclo de vida
1. **Coleta de Fatias:**  
   O despachante agrega trechos de código, contratos da Wiki, critérios de aceite e evidências prévias.
2. **Deduplicação e Triagem:**  
   `applyContextBudget()` descarta caminhos duplicados ou já citados no vetor `evidence_paths`.
3. **Separação Protegidos vs Descartáveis:**  
   Fatias com `kind` presente em `PROTECTED_KINDS` são blindadas e mantidas integralmente. As demais são ordenadas por prioridade.
4. **Aplicação de Tetos (Paths / Pages):**  
   Descarta arquivos inteiros antes de cortar texto, respeitando `max_paths` (default 15) e `max_pages` de documentação `.ai/` (default 5).
5. **Medição de Tokens e Redução Gradual:**  
   Mede os tokens do texto consolidado. Se exceder `max_tokens` (default 128.000), descarta progressivamente as fatias não protegidas de menor prioridade.
6. **Entrega:**  
   Gera o bloco final de texto para anexar ao prompt e um relatório de telemetria (`ContextBudgetTelemetry`).

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - `orchestrator/src/jobs/spawn-pickup-context.ts`: Ao criar o contexto inicial para um subagente/worker spawnado.
  - CLI `orchestrator/src/cli/apply-context-budget.ts`.
- **Condições de acionamento:**  
  Em spawns orquestrados de workers onde limites de contexto foram declarados no `GATE_BUNDLE`.
- **Obrigatoriedade:**  
  Obrigatório nos spawns gerenciados pelo orquestrador V2.2.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  Na fronteira imediatamente anterior à invocação da API do modelo de linguagem.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:**  
  Vetor de `ContextSlice` e objeto `ApplyContextBudgetOptions` contendo `ownerId`, limites de tokens e `evidence_paths`.
- **Saída:**  
  `ContextBudgetApplyResult`:
  ```typescript
  {
    context_text: string,
    kept: ContextSlice[],
    dropped: ContextSlice[],
    telemetry: {
      tokens_measured: number,
      tokenizer: string,
      paths_count: number,
      pages_count: number,
      budget_exceeded: boolean
    }
  }
  ```

---

## 8. Dependências e integração
- **Dependências:** Tokenizer (`tiktoken` ou fallback regex), TypeScript puro.
- **Acoplamento:** Totalmente integrado com o sistema de jobs e spawns do orquestrador.

---

## 9. Configuração e operação
- **Configurações:**  
  Limites parametrizáveis via `ContextBudgetLimits`:
  - `max_paths` (padrão: 15)
  - `max_pages` (padrão: 5)
  - `max_tokens` (padrão: 128.000)

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/context-budget.test.ts`.
  - `orchestrator/tests/unit/context-budget-harness.test.ts`.
  - `orchestrator/tests/unit/retrieval-ranking.test.ts`.
  - `orchestrator/tests/unit/context-ownership.test.ts`.
- **Comprovação:** `VERIFIED_BY_TEST` (todos os testes de orçamento e ranking passam com sucesso).
- **Garantia de segurança:** Fatias de segurança e critérios de aceite possuem garantia matemática de nunca serem descartadas ou truncadas para dar espaço a código ou notas opcionais.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Regras de proteção em `orchestrator/src/context/budget.ts#L13-L18`.
- `VERIFIED_IN_CODE`: Tokenizador em `orchestrator/src/context/tokenizer.ts#L1-L80`.
- `DOCUMENTED_ONLY`: Algoritmos de compactação semântica com reinjeção mantidos como `NOT_IMPLEMENTED` por determinação explícita do ADR-0013.

---

## 12. Resumo operacional
- **Responsabilidade real:** Gerenciador e orçador de fatias efêmeras de contexto para modelos de linguagem.
- **Quem o utiliza:** O mecanismo de spawn de agentes e jobs do orquestrador.
- **Quando é acionado:** Imediatamente antes do envio do prompt para a API do modelo.
- **Fonte de dados:** Fatias de código, contratos, critérios de aceite e evidências.
- **Principal dependência:** Biblioteca de tokenização.
- **Principal risco / limitação:** Descarte de arquivos completos quando o teto de caminhos é atingido, exigindo bom ranqueamento prévio.
- **O que falta verificar:** Avaliação do impacto real no consumo de tokens em execuções de longa duração.
