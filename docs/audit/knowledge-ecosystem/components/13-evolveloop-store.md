# Relatório de Componente: EvolveLoopStore & SignalStore

---

## 1. Identidade
- **O que é?**  
  Um subsistema de persistência e rastreamento de estado longitudinal do framework em TypeScript, implementado em `orchestrator/src/evolveloop/store.ts` e `orchestrator/src/evolveloop/persistence/signal-store.ts`.
- **Qual é sua finalidade declarada?**  
  Armazenar o histórico de sinais de necessidade, padrões de lacuna de capacidades (*needs*), análises de causa raiz e requisições de evolução do próprio framework EvolveLoop.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Persistência estruturada de `NeedSignal`, `DetectedPattern`, `NeedCandidate`, `RootCauseAnalysis`, `EvolutionCandidate` e `EvolutionRequest`.
  - Suporte a armazenamento em memória com espelhamento opcional em disco em `<evolutionDir>/snapshot.json`.
  - Desacoplamento semântico explícito de conhecimento/memória de projeto: a própria documentação no código estabelece que o `evolutionDir` destina-se ao estado longitudinal do framework, e não ao conhecimento do domínio do usuário.
- **Qual problema resolve?**  
  Permite que o EvolveLoop analise suas próprias limitações operacionais ao longo de múltiplas semanas de uso e sugira a criação de novas capacidades ou refatores no próprio orquestrador.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/evolveloop/store.ts`.
  - `orchestrator/src/evolveloop/persistence/signal-store.ts`.
  - `orchestrator/src/evolveloop/types.ts`.
- **Configuração:** `paths.resolveDataPaths(root).evolutionDir` (aponta para `join(root, "evolution")`).

---

## 3. Armazenamento e representação
- **Onde fica armazenado?**  
  Em memória com exportação para `<root>/evolution/snapshot.json`.
- **Em qual formato?**  
  JSON estruturado contendo coleções de sinais e requisições de evolução.

---

## 4. Ciclo de vida
1. **Ingestão:** Observadores do runtime registram sinais de gargalo ou falha de capacidade.
2. **Agrupamento:** Mineradores de sinal detectam padrões longitudinais.
3. **Persistência:** O snapshot de evolução é gravado em disco.

---

## 5. Como é utilizado
- **Consumidores:** Controladores longitudinais do módulo `evolveloop` (`LongitudinalController`, `LiveCoordinator`).
- **Não confundir com RAG:** Não é consultado por tarefas de código nem participa de buscas da Wiki.

---

## 6. Qualidade e confiabilidade
- **Testes existentes:**  
  `orchestrator/tests/unit/evolveloop/evolveloop.test.ts`, `longitudinal.test.ts`.
- **Comprovação:** `VERIFIED_BY_TEST`.

---

## 7. Evidências
- `VERIFIED_IN_CODE`: Declaração em `orchestrator/src/persistence/paths.ts#L8-L9` ("EvolveLoop longitudinal state — not knowledge/memory/telemetry").
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/evolveloop/store.ts#L22-L24`.

---

## 8. Resumo operacional
- **Responsabilidade real:** Repositório de telemetria longitudinal e auto-evolução do framework.
- **Quem o utiliza:** Subsistema interno de auto-otimização do orquestrador.
- **Quando é acionado:** Em análises agregadas de múltiplas execuções.
- **Fonte de dados:** Eventos de execução e diagnósticos de capacidades ausentes.
- **Principal dependência:** Sistema de arquivos.
- **Principal risco / limitação:** Componente avançado voltado para meta-otimização do orquestrador, não para as regras de negócio dos projetos do usuário.
