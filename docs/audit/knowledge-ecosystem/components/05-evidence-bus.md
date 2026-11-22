# Relatório de Componente: EvidenceBus & Persistência de Evidências

---

## 1. Identidade
- **O que é?**  
  Um barramento e sistema de persistência de evidências de verificação, situado em `orchestrator/src/evidence/evidence-bus.ts`, amplamente complementado por convenções operacionais na skill `orquestrar` e no comando `/evolve`.
- **Qual é sua finalidade declarada?**  
  Atuar como a fonte única da verdade (SSOT) operacional sobre a satisfação de critérios de aceite e portões de qualidade (Gates) de uma feature, assegurando que nenhuma fase avance sem prova documental persistida em disco.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Resolução do diretório canônico de evidências: `memory/<feature_id>/evidence/`.
  - Mapeamento determinístico de capabilities de portão para arquivos canônicos:
    - `testing` → `gate.testing.json`
    - `security-review` → `gate.security.json`
    - `po-acceptance` → `gate.po.json`
    - `design-stress-test` → `gate.grill-me.json`
    - nós genéricos → `node.<node_id>.json`
  - Sanitização de publicação e redação estrita de credenciais (`redactSecrets`, `serializeEvidenceForPublish`).
  - Gravação de sumários de execução (`run-summary.json`) e clonagem de evidências para diretórios de auditoria (`jobsDir`).
- **Qual problema resolve?**  
  Impede que agentes avancem fases de implementação baseando-se em declarações verbais no chat ("todos os testes passaram"). O avanço exige a presença física do arquivo JSON estruturado e sanitizado no disco.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/evidence/evidence-bus.ts`: Funções `persistNodeEvidence()`, `resolveEvidenceDir()`, `gateEvidenceFilename()`, `writeSanitizedJsonFile()`.
  - `orchestrator/src/evidence/builders.ts`: Construtores de instâncias tipadas de `Evidence`.
  - `orchestrator/src/evidence/secret-redaction.ts`: Expressões regulares de identificação e ofuscação de segredos.
  - `orchestrator/src/evidence/publish-sanitize.ts`: Serialização segura para persistência.
- **Módulos relacionados:**  
  - `.cursor/commands/evolve.md`.
  - `.cursor/skills/orquestrar/SKILL.md`.
  - `.cursor/skills/orquestrar/references/evidence-bus.md`.
- **Configurações necessárias:**  
  - Raiz de memória (`memoryRoot`), tipicamente o diretório `memory/` na raiz do repositório.
- **Documentação relevante:**  
  - `.cursor/skills/orquestrar/references/evidence-bus.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  No disco, sob `memory/<feature_id>/evidence/`.
- **Em qual formato?**  
  Arquivos JSON sanitizados estruturados segundo o schema de evidência do EvolveLoop:
  ```json
  {
    "kind": "Evidence",
    "metadata": {
      "node_id": "gate-test",
      "run_id": "run-123",
      "capability": "testing",
      "provider_id": "vitest",
      "timestamp": "2026-10-24T12:00:00Z"
    },
    "result": {
      "status": "satisfied",
      "data": { ... }
    }
  }
  ```
- **Dados originais ou derivados?**  
  Derivados de execuções de testes, linters, scanners de segurança ou rituais de grounding.
- **Existe persistência?**  
  Sim, persistência síncrona em arquivos JSON no sistema de arquivos.

---

## 4. Ciclo de vida
1. **Emissão da Evidência:**  
   Um worker ou portão conclui sua execução (ex.: suíte de testes finalizada).
2. **Construção e Higienização:**  
   O payload é empacotado em um objeto `Evidence`. A função `redactSecrets()` varre strings em busca de tokens, chaves e senhas, substituindo-os por `[REDACTED]`.
3. **Persistência em Disco (`persistNodeEvidence`):**  
   - Cria o diretório `memory/<feature_id>/evidence/` recursivamente.
   - Grava `node.<id>.json`.
   - Se o nó for do tipo `gate`, grava também a cópia com o nome canônico do portão (ex.: `gate.testing.json`).
4. **Verificação por Agentes / Escalonador:**  
   O orquestrador ou o comando `/evolve` lê o disco. O comando `continuar` só é desbloqueado se o arquivo JSON existir e contiver status de satisfação.
5. **Invalidação / Ciclo de Vida:**  
   As evidências permanecem no disco para fins de auditoria forense até que o diretório `memory/<feature_id>/` seja explicitamente limpo pelo desenvolvedor.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - O motor do orquestrador via `persistNodeEvidence()`.
  - Agentes e comandos do Cursor: `/planejar`, `/grill-me`, `/evolve` gravam manualmente ou via scripts evidências como `grounding.json`, `gate.grill-me.json` e `gate.testing.json`.
  - Avaliadores de portão (`code-reviewer`, `security`, `failure-analyst`).
- **Obrigatoriedade:**  
  Estritamente obrigatório para avanço de fases em qualquer fluxo orquestrado pelo EvolveLoop.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  - No grounding inicial: gravação de `grounding.json`.
  - Na conclusão do design e entrevistas: `gate.grill-me.json`.
  - Na conclusão dos testes automatizados: `gate.testing.json`.
  - Na aprovação de segurança: `gate.security.json`.
  - Na aceitação do PO: `gate.po.json`.
- **Frequência operacional:**  
  Utilizado em todos os ciclos de feature. Observado extensivamente em diretórios reais como `memory/v22-close-100/evidence/`, `memory/v23-planning/evidence/` e `memory/evolveloop-v3/evidence/`.

---

## 7. Entradas e saídas
- **Entradas:**  
  Resultados de execução, relatórios de ferramentas (pytest, vitest, semgrep) ou resumos de grounding.
- **Saídas:**  
  Arquivos JSON estruturados e higienizados.
- **Higienização:**  
  Garante remoção sistemática de segredos através de expressões regulares estritas em `secret-redaction.ts`.

---

## 8. Dependências e integração
- **Dependências:** Sistema de arquivos local (`node:fs`, `node:path`), sanitizadores.
- **Consumidores principais:**  
  - Toda a cadeia de orquestração do EvolveLoop (`.cursor/skills/orquestrar/SKILL.md`).
- **Resiliência:** Se a gravação falhar, a execução é interrompida, preservando o princípio *fail-closed*.

---

## 9. Configuração e operação
- **Configuração:** Resolução automática baseada no `featureId` sob o diretório `memory/`.
- **Operação no git:** O diretório raiz `memory/` é ignorado no git (`.gitignore`), garantindo que relatórios locais e artefatos de execução não sejam commitados acidentalmente.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/evidence.test.ts`.
  - `orchestrator/tests/unit/evidence/secret-redaction.test.ts`.
- **Comprovação:** `VERIFIED_BY_TEST` (todos os testes de redação e persistência passam com sucesso).
- **Consistência:** Alta. Arquivos gravados em formato imutável e verificável.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/evidence/evidence-bus.ts#L8-L71`.
- `VERIFIED_IN_CODE`: Regra de avanço em `.cursor/skills/orquestrar/SKILL.md#L264-L270`.
- `OBSERVED_AT_RUNTIME`: Centenas de arquivos de evidência reais gravados em `memory/*/evidence/*.json`.

---

## 12. Resumo operacional
- **Responsabilidade real:** Sistema de persistência e higienização de provas formais de aprovação de portões de qualidade.
- **Quem o utiliza:** O motor TypeScript do orquestrador e todos os agentes Cursor no fluxo `/evolve`.
- **Quando é acionado:** Na transição de cada portão de qualidade.
- **Fonte de dados:** Resultados de ferramentas de QA, testes e grounding.
- **Principal dependência:** Sistema de arquivos sob `memory/<feature_id>/evidence/`.
- **Principal risco / limitação:** Como o diretório está no `.gitignore`, evidências de execuções passadas são puramente locais a menos que exportadas explicitamente.
- **O que falta verificar:** Avaliar padronização de schemas para ferramentas externas que gravam direto sem passar pelo builder TypeScript.
