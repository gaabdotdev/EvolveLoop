# Relatório de Componente: KnowledgeBackend & WikiKnowledgeBackend

---

## 1. Identidade
- **O que é?**  
  Uma abstração arquitetural em TypeScript (`KnowledgeBackend`) acompanhada de sua implementação de produção padrão (`WikiKnowledgeBackend`) e uma implementação para testes (`FakeKnowledgeBackend`), localizadas no núcleo do orquestrador do EvolveLoop.
- **Qual é sua finalidade declarada?**  
  Atuar como um ponto de desacoplamento (*minimal seam*) entre o núcleo de execução do EvolveLoop e as implementações externas de recuperação de conhecimento (RAG), permitindo consultar documentação e contratos sem embutir banco vetorial ou motor Python dentro do processo Node.js.
- **Qual é sua responsabilidade efetivamente implementada?**  
  Resolução dinâmica do backend configurado; invocação via subprocesso (`child_process.spawn`) do CLI Python externo (`python -m gaabwiki search <query>`); higienização de saída com redação de segredos (`redactSecrets`); tratamento de erros de infraestrutura classificando estados degradados (`RAG_REPO_MISSING`, `WIKI_TIMEOUT`, `WIKI_UNAVAILABLE`, `WIKI_ERROR`); e parsing da saída JSON/texto em estruturas normalizadas de evidência (`EvidenceSet`, `KnowledgeHit`).
- **Qual problema resolve?**  
  Evita a duplicação do stack de banco vetorial (LanceDB/embeddings) dentro do orquestrador TypeScript, isolando o RAG em um processo externo Python desacoplado e garantindo resiliência quando o serviço de embeddings ou o repositório da Wiki estiver indisponível.

---

## 2. Localização
- **Arquivos principais:**  
  - `orchestrator/src/knowledge/backend/types.ts`: Definições das interfaces `KnowledgeBackend`, `KnowledgeBackendId`, `KnowledgeHealth` e `KnowledgeInspectResult`.
  - `orchestrator/src/knowledge/backend/wiki-backend.ts`: Implementação da classe `WikiKnowledgeBackend`, resolução de variáveis de ambiente e parser de stdout.
  - `orchestrator/src/knowledge/backend/resolve.ts`: Função `resolveKnowledgeBackend` com cache singleton e suporte a fallback.
  - `orchestrator/src/knowledge/backend/fake-backend.ts`: Implementação estática para suítes de teste.
- **Módulos/pacotes relacionados:**  
  - Provedor determinístico: `orchestrator/src/providers/deterministic/knowledge.ts`.
  - Configuração de perfil: `orchestrator/src/config/profile.ts`.
- **Configurações necessárias:**  
  - `WIKI_ROOT` (ou alias `RAG_REPO_ROOT`): Caminho para o diretório raiz do cofre de conhecimento Markdown.
  - `WIKI_CLI_MODULE`: Nome do módulo Python executável (padrão: `gaabwiki`).
  - `KNOWLEDGE_BACKEND`: Sobrescrita opcional do backend (`wiki` ou `fake`).
- **Documentação relevante:**  
  - `docs/adr/0012-wiki-default-knowledge-backend.md`: Decisão da Wiki como backend default.
  - `docs/adr/0005-hybrid-retrieval-degraded-mode.md`: Tratamento de modo degradado e separação de status.
  - `docs/adr/0004-project-knowledge-contract.md`: Contrato de conhecimento e separação entre Carpaccio e Wiki RAG.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  O componente não armazena dados próprios. Ele consulta dados mantidos no cofre externo apontado por `WIKI_ROOT` (arquivos `.md` e índice `.data/manifest.json`).
- **Em qual formato?**  
  Consome a saída padrão (stdout) emitida pelo processo Python, que pode ser um envelope JSON (`{"selected": [...]}`) ou linhas delimitadas por barras verticais (`source | score | excerpt`). Converte internamente para objetos TypeScript do tipo `EvidenceSet`.
- **Dados originais, derivados ou ambos?**  
  Opera exclusivamente sobre representações derivadas fornecidas pelo CLI (trechos de texto e scores de recuperação).
- **Existe persistência ou os dados são reconstruídos durante a execução?**  
  Não há persistência interna. Cada chamada a `search()` gera uma nova execução de subprocesso sob demanda. A resolução da instância de `KnowledgeBackend` é mantida em memória cache durante a execução do processo Node.js.
- **Identificadores, metadados e referências:**  
  Cada `KnowledgeHit` preserva: `source` (caminho do arquivo de origem), `section` (número da linha ou hash), `score` (relevância numérica), `retrieval_method` (ex.: `bm25`), `project`, `excerpt` (trecho higienizado) e `chunk_id`.

---

## 4. Ciclo de vida
1. **Inicialização / Resolução:**  
   O chamador invoca `resolveKnowledgeBackend()`. A função consulta `profiles/default.yaml` ou a variável de ambiente `KNOWLEDGE_BACKEND`. Se o id for `"wiki"`, instancia `WikiKnowledgeBackend()`.
2. **Execução da Consulta (`search`):**  
   - Lê `resolveWikiRoot()`. Se o caminho não estiver configurado ou o diretório não existir em disco, retorna imediatamente um `EvidenceSet` com `retrieval_method: "unavailable"` e `error_code: "RAG_REPO_MISSING"`.
   - Dispara `runWikiSearch(query, ragRoot, timeoutMs = 20_000)` via `child_process.spawn("python", ["-m", mod, "search", query])`.
   - Se o comando exceder 20 segundos, mata o processo com `SIGKILL` e retorna `error_code: "WIKI_TIMEOUT"`.
   - Se o módulo Python não for encontrado (código 127 ou stderr acusando ausência do módulo), retorna `error_code: "WIKI_UNAVAILABLE"`.
   - Se a saída for bem-sucedida, repassa o texto para `parseHits()`.
3. **Processamento e Higienização:**  
   - Converte hits JSON ou texto formatado.
   - Aplica `redactSecrets()` sobre o trecho (`excerpt`) e limita seu tamanho em 500 caracteres via `cleanOutput()`.
   - Detecta se a fonte foi marcada como desatualizada (`stale: true`) e injeta no campo `degraded` a razão correspondente (`stale_source` ou `source_hash_mismatch`).
4. **Devolução dos Resultados:**  
   Retorna uma estrutura imutável `EvidenceSet` com status de degradação consolidado e lista de hits.
5. **Invalidação / Limpeza:**  
   Como não mantém cache de resultados de busca, nenhuma invalidação de dados é necessária. Para testes, `resetKnowledgeBackendCache()` permite reiniciar a instância singleton.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  O módulo de capacidades determinísticas do orquestrador (`orchestrator/src/providers/deterministic/knowledge.ts`) através das funções `knowledgeSearch()` e `knowledgeInspect()`.
- **APIs / Ferramentas que o utilizam:**  
  O runtime `DeterministicProvider` registra as capacidades `knowledge.search` e `knowledge.inspect`, que são expostas ao escalonador e aos agentes do orquestrador.
- **Fluxos de execução:**  
  - Fluxo determinístico acionado por nós do plano de execução (`CapabilityIR`) que demandam a capability `knowledge.search`.
  - Ritual de grounding automatizado ou verificação de integridade de contratos prévios à execução de código.
- **Obrigatoriedade / Condicionalidade:**  
  Condicional: é acionado quando o plano de execução contém um nó com a capability `knowledge.search` ou quando uma ferramenta solicita a inspeção da base.
- **Consumidores indiretos:**  
  `ProjectKnowledgeRuntime` / `fenceEvidenceSet` consome o `EvidenceSet` retornado por este componente para aplicar a cerca de autoridade (Truth Fence).

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  - Durante a execução de planos de tarefa no orquestrador que possuem passos explícitos de busca de conhecimento.
  - Quando um agente consulta a ferramenta determinística `knowledge.search`.
- **Caminhos que evitam sua utilização:**  
  - Quando o perfil define `KNOWLEDGE_BACKEND=fake` (cenários de teste isolados).
  - Quando a skill `wiki` no Cursor opta por invocar o script bash local `ground.sh` diretamente no terminal, sem passar pelo orquestrador TypeScript.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:**  
  String de consulta textual (`query: string`), opcionalmente refinada com termos de projeto.
- **Saída:**  
  Objeto tipado `EvidenceSet`:
  ```typescript
  {
    kind: "EvidenceSet",
    query: string,
    hits: KnowledgeHit[],
    retrieval_method: string,
    degraded?: string | null,
    error_code?: "RAG_REPO_MISSING" | "WIKI_TIMEOUT" | "WIKI_UNAVAILABLE" | "WIKI_ERROR" | null
  }
  ```
- **Transformações:**  
  - Mapeamento de campos da saída do CLI Python (`file`/`path`/`vault_page` → `source`, `line` → `section`).
  - Redação de segredos e regexes de tokens (API Keys, chaves privadas).
  - Truncamento protetivo de trechos em 500 caracteres.
- **Perdas potenciais de informação:**  
  O truncamento em 500 caracteres descarta o restante do corpo do arquivo original, exigindo que o agente realize leitura direta do arquivo em disco caso necessite do contexto integral.

---

## 8. Dependências e integração
- **Dependências de sistema e runtime:**  
  - Interpretador `python` acessível no `PATH` do sistema.
  - Módulo Python especificado por `WIKI_CLI_MODULE` (padrão `gaabwiki`) instalado e importável no ambiente.
  - Variável de ambiente `WIKI_ROOT` apontando para um diretório legível.
- **Componentes do EvolveLoop dependentes:**  
  - `orchestrator/src/providers/deterministic/knowledge.ts`.
  - `orchestrator/src/providers/deterministic/index.ts`.
- **Impacto de indisponibilidade:**  
  Se o cofre ou o Python estiverem ausentes, o componente não quebra com exceção não tratada; ele retorna `error_code: "RAG_REPO_MISSING"` ou `"WIKI_UNAVAILABLE"` com lista vazia de hits, permitindo que o orquestrador degrade graciosamente.

---

## 9. Configuração e operação
- **Variáveis de ambiente observadas:**  
  - `WIKI_ROOT`: Caminho absoluto do cofre Markdown (canônico).
  - `RAG_REPO_ROOT`: Alias legado aceito por retrocompatibilidade.
  - `WIKI_CLI_MODULE`: Nome do pacote Python (default: `gaabwiki`).
  - `KNOWLEDGE_BACKEND`: `wiki` (default) ou `fake`.
- **Comportamento em ambiente incompleto:**  
  Totalmente defensivo. A ausência de `WIKI_ROOT` resulta em `error_code: "RAG_REPO_MISSING"`.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  - `orchestrator/tests/unit/knowledge-backend.test.ts`: 13 testes unitários cobrindo resolução de backend, parsing de JSON malformado, linhas delimitadas por pipe, tratamento de timeout, ausência de repositório e redação de segredos.
  - Comprovação: `VERIFIED_BY_TEST` (13/13 testes aprovados via Vitest).
- **Tratamento de erros:** Robusto e explicitamente documentado no código com códigos de erro canônicos.
- **Risco de dados obsoletos:** O backend propaga o campo `degraded: "stale_source"` caso o CLI Python detecte que o hash do código fonte difere do hash gravado no índice da Wiki.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação da classe `WikiKnowledgeBackend` em `orchestrator/src/knowledge/backend/wiki-backend.ts#L173-L268`.
- `VERIFIED_IN_CODE`: Parsing e tratamento de erro em `orchestrator/src/knowledge/backend/wiki-backend.ts#L34-L82`.
- `VERIFIED_BY_TEST`: Suíte unitária `orchestrator/tests/unit/knowledge-backend.test.ts` executada com 100% de sucesso.
- `DOCUMENTED_ONLY`: Suporte a busca híbrida vetorial completa via LanceDB/Ollama no motor externo `karpathyWiki` (na fixture interna apenas o motor BM25 foi verificado).

---

## 12. Resumo operacional
- **Responsabilidade real:** Adaptador de processo que faz a ponte entre o runtime Node.js do orquestrador e a CLI externa de busca na Wiki em Python.
- **Quem o utiliza:** O provedor determinístico de capacidades (`knowledge.search`).
- **Quando é acionado:** Em chamadas a tarefas de grounding ou consultas a documentos do cofre.
- **Fonte de dados:** Subprocesso Python executado contra o diretório `$WIKI_ROOT`.
- **Principal dependência:** Existência de ambiente Python com o módulo `gaabwiki` configurado.
- **Principal risco / limitação:** Acoplamento a um processo externo e latência de inicialização do interpretador Python por consulta.
- **O que falta verificar:** Medição de latência média real em produção comparada com acesso direto em memória.
