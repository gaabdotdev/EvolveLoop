# Relatório de Componente: PatternAggregator

---

## 1. Identidade
- **O que é?**  
  Um agregador de padrões de falha em TypeScript, implementado na classe `PatternAggregator` em `orchestrator/src/learning/pattern-aggregator.ts`.
- **Qual é sua finalidade declarada?**  
  Implementar o loop de aprendizado sobre contratos e execuções no orquestrador, identificando erros reincidentes e ajustando a prioridade de seleção de provedores de capacidade.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Ingestão de eventos de falha do barramento de eventos (`EventEnvelope` com tipos `NodeFailed` e `FeatureBlocked`).
  - Agrupamento estatístico de falhas pela chave composta `${capability}:${provider_id}:${blocked_reason}`.
  - Manutenção de contadores (`count`) e timestamp da última ocorrência (`last_seen`).
  - Cálculo de penalidade numérica dinâmica para provedores (`providerPenalty(providerId)`), calculada como `min(0.3, soma_falhas * 0.05)`.
  - Exposição de ranking de padrões frequentes (`topPatterns(limit)`).
- **Qual problema resolve?**  
  Evita loops infinitos de retentativas contra provedores instáveis ou mal configurados, permitindo que o escalonador prefira alternativas mais saudáveis à medida que falhas ocorrem durante a execução.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/learning/pattern-aggregator.ts`.
- **Módulos relacionados:**  
  - `orchestrator/src/engine/execution-engine.ts#L239`.
  - `orchestrator/src/scheduler/scheduler.ts`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  Em memória, dentro do mapa privado `this.patterns: Map<string, FailurePattern>`.
- **Em qual formato?**  
  Estrutura em memória `FailurePattern`:
  ```typescript
  interface FailurePattern {
    capability: string;
    provider_id: string;
    blocked_reason: string;
    count: number;
    last_seen: string;
  }
  ```
- **Persistência:**  
  Opera em memória durante o ciclo de vida da execução do motor; os padrões podem ser exportados via snapshot no fim da execução.

---

## 4. Ciclo de vida
1. **Instanciação:** Criado no início do ciclo de execução em `ExecutionEngine.execute()`.
2. **Escuta de Eventos:** A cada falha de nó (`NodeFailed`) ou bloqueio de feature (`FeatureBlocked`), invoca `record(event)`.
3. **Atualização de Padrões:** Incrementa o contador da chave correspondente.
4. **Consulta no Escalonamento:** Durante a escolha do provedor para um nó de tarefa, o escalonador consulta `patternAggregator.providerPenalty(provider.id)` e aplica a penalidade na pontuação do candidato.

---

## 5. Como é utilizado
- **Quem chama:** `ExecutionEngine` e `Scheduler`.
- **Obrigatoriedade:** Ativo por padrão no pipeline de execução do orquestrador.

---

## 6. Quando é utilizado
- **Momentos de acionamento:** Em qualquer execução de IR em que nós de tarefa falhem ou sofram timeout.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:** `EventEnvelope` contendo dados da falha.
- **Saída:** `FailurePattern[]` e score numérico de penalidade (`0.0` a `0.3`).

---

## 8. Dependências e integração
- **Dependências:** TypeScript puro em memória.

---

## 9. Qualidade e confiabilidade
- **Testes existentes:** Testado nos cenários de avaliação e tolerância a falhas do orquestrador.
- **Comprovação:** `VERIFIED_IN_CODE`.

---

## 10. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/learning/pattern-aggregator.ts#L1-L59`.
- `VERIFIED_IN_CODE`: Instanciação em `orchestrator/src/engine/execution-engine.ts#L239`.

---

## 11. Resumo operacional
- **Responsabilidade real:** Rastreador de padrões de falha e calculador de penalidade de provedores.
- **Quem o utiliza:** Escalonador do orquestrador.
- **Quando é acionado:** Em falhas de execução e seleção de provedores.
- **Fonte de dados:** Barramento de eventos interno.
- **Principal dependência:** Em memória.
- **Principal risco / limitação:** Os dados de falha são voláteis e resetados ao término do processo a menos que o snapshot seja gravado em telemetria.
