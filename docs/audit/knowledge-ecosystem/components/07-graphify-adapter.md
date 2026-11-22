# Relatório de Componente: GraphifyAdapter & Skill Graphify

---

## 1. Identidade
- **O que é?**  
  Uma integração híbrida composta por um adaptador em TypeScript (`orchestrator/src/v22/graphify-adapter.ts`), uma skill restritiva no Cursor (`.cursor/skills/graphify/SKILL.md`) e um portão obrigatório de pré-execução (`references/graphify-skill-gate.md`), baseados na ferramenta externa CLI `graphify` (distribuída via PyPI como `graphifyy`).
- **Qual é sua finalidade declarada?**  
  Construir e consultar um grafo de dependências estruturais de código baseado em árvore sintática abstrata (AST), permitindo ranquear caminhos de arquivos e arestas de relacionamento (`from → to`) sem depender de LLMs externos ou serviços de nuvem.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Execução restrita da ferramenta CLI oficial: autoriza exclusivamente a análise estática local (`graphify update <path> --no-cluster`) e consultas ranqueadas com orçamento (`graphify query "<pergunta>" --budget <inteiro>`).
  - Recusa formal e bloqueio do "Step 1" e "Part B" do pacote upstream (proíbe terminantemente instalações globais de pacotes, extrações semânticas via Gemini/LLM, upload para nuvem ou Neo4j).
  - Parsing da saída textual do CLI procurando padrões `src=<path>` e resolução contra caminhos reais do monorepo (`pathsFromGraphifyQueryOutput`).
  - Mapeamento de arestas (`EXTRACTED`, `INFERRED`, `STUB`).
  - Fornecimento de stub estático (`STUB_EDGES`) para cenários onde a ferramenta CLI não estiver instalada.
- **Qual problema resolve?**  
  Permite ao agente obter uma visão topológica e determinística das dependências de código entre módulos antes de iniciar modificações ou consultar a Wiki, reduzindo a necessidade de varreduras extensivas por texto (`grep`).

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/v22/graphify-adapter.ts`: Adaptador de integração, detecção de CLI e parser de paths.
  - `.cursor/skills/graphify/SKILL.md`: Wrapper normativo da skill com recusas de segurança.
  - `.cursor/skills/graphify/upstream/skill-pi.md`: Snapshot de referência upstream pinado.
  - `.cursor/skills/orquestrar/references/graphify-skill-gate.md`: Definição do hard-gate de execução.
  - `graphify-out/`: Diretório local contendo `graph.json` (7.4 MB) e `manifest.json`.
- **Módulos relacionados:**  
  - Feature flags: `orchestrator/src/v22/feature-flags.ts` (`isGraphifyExperimentEnabled()`).
  - Skill raiz: `.cursor/skills/orquestrar/SKILL.md`.
- **Configurações necessárias:**  
  - `EVOLVELOOP_GRAPHIFY`: Flag de ativação no orquestrador (default: OFF / não definido).
  - `GRAPHIFY_BIN`: Caminho do executável (padrão: `graphify` ou `/tmp/graphify-skill-hardgate-venv/bin/graphify`).
  - `GRAPHIFY_GRAPH`: Caminho para o `graph.json` (padrão: `graphify-out/graph.json`).
  - `EVOLVELOOP_GRAPHIFY_BUILD`: Permite rodar `graphify update` se o arquivo estiver ausente.
- **Documentação relevante:**  
  - `docs/adr/0014-graphify-b3-benchmark-decision.md`: Decisão formal de integração experimental.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  No diretório `graphify-out/` na raiz do projeto:
  - `graphify-out/graph.json`: Grafo completo de símbolos, nós e arestas (formato JSON de grande porte).
  - `graphify-out/manifest.json`: Metadados do grafo gerado.
  - `graphify-out/cache/`: Cache interno do Graphify.
- **Em qual formato?**  
  JSON puro contendo nós (arquivos, classes, funções) e arestas de relacionamento com metadados estruturais.
- **Persistência:**  
  O arquivo é gerado no disco de trabalho e **não entra no Git** (ignorado explicitamente em `.gitignore`).

---

## 4. Ciclo de vida
1. **Verificação de Hard-Gate (Agente / Orquestrar):**  
   Ao iniciar uma nova missão no EvolveLoop, o subset da skill Graphify corre **antes** do grounding na Wiki. O agente verifica a presença do binário isolado em `/tmp/graphify-skill-hardgate-venv/bin/graphify`.
   - Se o binário não existir: marca imediatamente `graphify_skill_status: blocked` e prossegue para a Wiki sem falhar o fluxo.
2. **Construção / Atualização (`ensureGraphifyGraph`):**  
   Verifica a existência de `graphify-out/graph.json`. Se ausente e `EVOLVELOOP_GRAPHIFY_BUILD=1`, dispara `graphify update <projectRoot> --no-cluster`.
3. **Consulta Estrutural (`queryGraphifyCodeStructure`):**  
   - Se `isGraphifyExperimentEnabled()` for falso: retorna objeto com `enabled: false` e listas vazias.
   - Se ativo e CLI disponível: executa `graphify query <query> --budget <tokens> --graph <path>`.
   - Extrai caminhos de arquivo reais via regex `\bsrc=([^\s\]]+)`.
   - Valida se os caminhos existem no projeto (testando também com prefixo `orchestrator/`).
   - Constrói a lista ranqueada de caminhos e arestas estruturais `EXTRACTED`.
4. **Formatação de Contexto (`formatGraphifyContext`):**  
   Gera um bloco Markdown para ser injetado no contexto de trabalho:
   ```markdown
   ## Graphify (experiment)
   
   Ranked code paths:
   - `orchestrator/src/engine/execution-engine.ts`
   - `orchestrator/src/jobs/checkpoint.ts`
   ```
5. **Invalidação:**  
   O grafo é reconstruído executando novamente o comando `update`.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - A skill `orquestrar` do Cursor (`.cursor/skills/orquestrar/SKILL.md#L1-L10`) como primeiro passo do ciclo em novos projetos ou no próprio EvolveLoop.
  - A função `queryGraphifyCodeStructure()` no orquestrador TypeScript quando a flag experimental está ativada.
  - Scripts de benchmark de contexto (`run-graphify-b3-bench.sh`).
- **Obrigatoriedade:**  
  - No Cursor / `orquestrar`: O gate é obrigatório como tentativa inicial; se o venv estiver ausente, a política tolera e marca `blocked`.
  - No motor TypeScript: Opcional, estritamente condicionado à flag `EVOLVELOOP_GRAPHIFY=1` (ADR-0014).

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  Na fase de exploração prévia de código de uma tarefa complexa para mapear arquitetura e antes do grounding textual da Wiki.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:**  
  String de consulta (nome de símbolo, funcionalidade ou pergunta estrutural) e orçamento de tokens (default: 4000).
- **Saída:**  
  Estrutura `GraphifyQueryResult`:
  ```typescript
  {
    enabled: boolean,
    cli_available: boolean,
    paths_ranked: string[],
    edges: Array<{ from: string; to: string; kind: "EXTRACTED" | "INFERRED" | "STUB" }>,
    raw_excerpt?: string
  }
  ```

---

## 8. Dependências e integração
- **Dependências externas:**  
  - Pacote Python `graphifyy` (PyPI 0.9.93+).
  - Binário executável isolado em venv (proibido instalar no sistema global por regra do projeto).
- **Acoplamento:** Fraco; isolado atrás de adaptador e flags. Não altera o tipo `KnowledgeBackendId` nem substitui a Wiki.

---

## 9. Configuração e operação
- **Configurações:**  
  `EVOLVELOOP_GRAPHIFY=1` (liga o experimento no motor).
- **Limitações conhecidas:**  
  O arquivo gerado `graphify-out/graph.json` possui 7.4 MB, exigindo que o CLI realize o carregamento e consulta para não sobrecarregar a memória do processo principal.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/v22-graphify-adapter.test.ts`.
  - `orchestrator/tests/unit/v22-graphify-path-parse.test.ts`.
  - `orchestrator/tests/integration/v22-graphify-b3.integration.test.ts`.
- **Comprovação:** `VERIFIED_BY_TEST`.
- **Benchmark ADR-0014:** Comprovou empate de recall em testes oficiais (6/6) e dev (9/12), com latência significativamente reduzida frente ao retrieval completo da Wiki.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `orchestrator/src/v22/graphify-adapter.ts#L111-L205`.
- `VERIFIED_IN_CODE`: Gate normativo em `.cursor/skills/orquestrar/SKILL.md#L1-L10`.
- `OBSERVED_AT_RUNTIME`: Existência do grafo físico `graphify-out/graph.json` (7.477.454 bytes) no diretório do projeto.

---

## 12. Resumo operacional
- **Responsabilidade real:** Gerador e consultor de grafo de dependências sintáticas (AST) de código.
- **Quem o utiliza:** Skill `orquestrar` e benchmarks de contexto.
- **Quando é acionado:** Na fase preliminar de análise de código e exploração estrutural.
- **Fonte de dados:** Código-fonte do repositório analisado via AST.
- **Principal dependência:** Binário CLI `graphify`.
- **Principal risco / limitação:** Dependência de ambiente virtual Python isolado; o arquivo JSON é volumoso e volátil.
- **O que falta verificar:** Avaliar estabilidade de versões mais recentes do pacote PyPI `graphifyy` sem regressão no formato de saída.
