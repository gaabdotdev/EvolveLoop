# Rastreamento dos Fluxos Completos de Conhecimento e Memória

> **Objetivo:** Documentar detalhadamente os caminhos reais de dados, controle e execução que conectam os mecanismos de conhecimento no EvolveLoop, diferenciando fluxos comprovados no código daqueles que operam manualmente ou que estão ausentes.

---

## 1. Fluxo de Entrada de Conhecimento

O conhecimento entra no ecossistema EvolveLoop por duas origens distintas:
1. **Documentação de Projeto Local (.ai/ Carpaccio):** Originada de notas redigidas por desenvolvedores ou agentes durante o trabalho no monorepo.
2. **Cofre Canônico (Wiki Vault):** Base de notas estruturada sob `$WIKI_ROOT` (`projects/` e `packs/`).

```mermaid
flowchart TD
    subgraph EntradaLocal["1. Entrada Local (.ai/)"]
        Dev["Desenvolvedor / Agente"] -->|cria/edita nota| Page[".ai/pages/*.md<br/>(com source_paths)"]
        Page -->|executa carpaccio.py update| CarpaccioUpdate["carpaccio.py update --all"]
        CarpaccioUpdate -->|lê código fonte| CodeSrc["Arquivos de Código Fonte"]
        CarpaccioUpdate -->|calcula SHA-256| ManifestAi[".ai/manifest.yaml<br/>(catálogo de hashes)"]
    end

    subgraph SyncVault["2. Sincronização para Vault (Opcional)"]
        Page -->|sync-carpaccio-to-vault.sh| VaultCopy["$WIKI_ROOT/projects/evolveloop/pages/"]
    end

    subgraph IngestaoVault["3. Ingestão e Indexação no Vault (gaabwiki)"]
        VaultCopy --> Ingest["gaabwiki rebuild --incremental"]
        OtherVaultPages["$WIKI_ROOT/packs/*.md"] --> Ingest
        Ingest --> FrontmatterParser["_parse_frontmatter()<br/>extrai source_paths e keywords"]
        FrontmatterParser --> Chunker["_build_chunks_for_page()<br/>gera chunk_id, texto e tokens"]
        Chunker --> HashChecker["sha256_file(source_paths)<br/>captura hash atual do código"]
        HashChecker --> ManifestVault["$WIKI_ROOT/.data/manifest.json<br/>(corpus BM25 + hashes)"]
    end
```

### Detalhamento das Etapas:
1. **Redação da Nota:** O autor cria uma nota Markdown em `.ai/pages/<nome>.md` incluindo frontmatter YAML com metadados obrigatórios (`title`, `keywords`, `source_paths`, `status: atual`).
2. **Registro de Hashes Locais:** Executa-se `python3 .cursor/skills/wiki-carpaccio/scripts/carpaccio.py update --all`. O script lê cada arquivo apontado em `source_paths`, calcula seu hash SHA-256 via `hashlib` e grava em `.ai/manifest.yaml` (`VERIFIED_IN_CODE`).
3. **Sincronização:** O script `docs/architecture/v2.2/scripts/sync-carpaccio-to-vault.sh` copia `.ai/pages/` para o diretório de projetos do cofre (`$VAULT/projects/evolveloop/pages/`).
4. **Indexação:** Executa-se `python -m gaabwiki rebuild --incremental`. A função `rebuild()` em `fixtures/evolveloop-wiki-vault/gaabwiki/indexing.py`:
   - Varre as pastas de projetos e packs.
   - Divide documentos em `Chunk`s com `chunk_id` determinístico (`<vault_path>#<digest>`).
   - Tokeniza o texto e palavras-chave via regex `[\w./-]+`.
   - Lê os arquivos de código correspondentes no monorepo e registra seus hashes em `source_hashes`.
   - Persiste o índice em `.data/manifest.json`.

---

## 2. Fluxo de Consulta de Conhecimento

Existem dois caminhos de consulta no ecossistema:
- **Caminho A (Agent Skill no Cursor):** O agente invoca a skill `wiki` ou executa `ground.sh` diretamente no terminal.
- **Caminho B (Runtime Determinístico do Orquestrador):** O plano de tarefas executa a capability `knowledge.search`.

```mermaid
flowchart TD
    subgraph Solicitante["Solicitante"]
        Agent["Agente Cursor / Tarefa do IR"]
    end

    subgraph Orquestrador["Orquestrador TypeScript"]
        Agent -->|invoca knowledge.search| DetProv["DeterministicProvider"]
        DetProv --> KnowSearch["knowledgeSearch(query)"]
        KnowSearch --> ResolveBackend["resolveKnowledgeBackend()"]
        ResolveBackend --> WikiBackend["WikiKnowledgeBackend.search(query)"]
    end

    subgraph SubprocessoPython["Subprocesso Python"]
        WikiBackend -->|child_process.spawn| GaabWikiCLI["python -m gaabwiki search <query>"]
        GaabWikiCLI --> SearchFn["indexing.search()"]
        SearchFn --> ReadManifest["Lê .data/manifest.json"]
        ReadManifest --> TokenScoring["Calcula intersecção de tokens"]
        TokenScoring --> LiveHashCheck{"monorepo_root presente?<br/>Compara live_hash vs indexed_hash"}
        LiveHashCheck -->|Igual| CleanHit["stale = false"]
        LiveHashCheck -->|Diferente| StaleHit["stale = true<br/>stale_reason = source_hash_mismatch"]
        CleanHit --> JsonEnvelope["Gera Envelope JSON (selected hits)"]
        StaleHit --> JsonEnvelope
    end

    subgraph RetornoHigienizacao["Higienização e Cerca da Verdade"]
        JsonEnvelope -->|stdout| ParseHits["parseHits()"]
        ParseHits --> Redaction["redactSecrets() + cleanOutput(500)"]
        Redaction --> RawEvidence["EvidenceSet"]
        RawEvidence --> TruthFence{"isTruthFenceEnabled()?<br/>applyTruthFence()"}
        TruthFence -->|Descarta sem proveniência| PrunedEvidence["EvidenceSet Fenced"]
        PrunedEvidence --> Agent
    end
```

### Detalhamento das Etapas:
1. **Chamada:** O chamador dispara `knowledgeSearch(query, options)` (`VERIFIED_IN_CODE`).
2. **Resolução de Backend:** `resolveKnowledgeBackend()` consulta o perfil e seleciona `WikiKnowledgeBackend` (`VERIFIED_IN_CODE`).
3. **Validação de Raiz:** Valida se `WIKI_ROOT` existe em disco. Se ausente, devolve imediatamente `error_code: "RAG_REPO_MISSING"` com hits vazios (`VERIFIED_BY_TEST`).
4. **Execução de Subprocesso:** Spawna `python -m gaabwiki search <query>` com timeout estrito de 20 segundos (`VERIFIED_IN_CODE`).
5. **Busca e Checagem de Staleness:**
   - O Python tokeniza a consulta e calcula pontuação por sobreposição de termos.
   - Para os melhores candidatos (`top_k`), lê o arquivo físico de código fonte no monorepo e calcula o SHA-256 ao vivo.
   - Se o hash mudou desde a última indexação, marca `stale: true` (`VERIFIED_BY_TEST`).
6. **Parsing e Redação:** O Node.js recebe o stdout, faz o parse de JSON, remove credenciais sensíveis (`redactSecrets`) e trunca trechos em 500 caracteres (`VERIFIED_IN_CODE`).
7. **Cerca da Verdade (Truth Fence):**
   - Descarta hits sem proveniência explícita.
   - Verifica se há sobreposição com código ativo. Se houver contradição, o código prevalece sobre a documentação (`VERIFIED_BY_TEST`).

---

## 3. Fluxo de Detecção de Mudança e Atualização (Staleness Lifecycle)

Um dos pontos mais fortes do EvolveLoop é a detecção sistemática de código que divergiu da documentação.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Desenvolvedor
    participant Code as Código Fonte
    participant Carpaccio as carpaccio.py lint
    participant ManifestLocal as .ai/manifest.yaml
    participant Pages as .ai/pages/*.md
    participant WikiEngine as gaabwiki (Vault)

    Dev->>Code: Altera função em orchestrator/src/engine.ts
    Note over Dev,Code: O hash do código fonte mudou

    rect rgb(240, 248, 255)
    Note over Carpaccio,Pages: Detecção no Nível do Repositório (.ai/)
    Dev->>Carpaccio: Executa carpaccio.py lint
    Carpaccio->>Code: Lê sha256_file(engine.ts)
    Carpaccio->>ManifestLocal: Lê hash registrado no manifesto
    Carpaccio-->>Carpaccio: live_hash != recorded_hash
    Carpaccio->>Pages: Reescreve frontmatter: status = obsoleto
    Carpaccio-->>Dev: Retorna {"stale_pages": [".ai/pages/engine.md"]}
    end

    rect rgb(255, 245, 245)
    Note over WikiEngine: Detecção no Nível do Vault (gaabwiki)
    Dev->>WikiEngine: Realiza busca (search query)
    WikiEngine->>Code: Lê source_hash em runtime
    WikiEngine-->>WikiEngine: live_hash != indexed_hash
    WikiEngine-->>Dev: Retorna hit com stale: true e source_hash_mismatch
    end
```

### Evidências:
- A marcação de `status: obsoleto` foi comprovada em código e executada em tempo real com `carpaccio.py lint` (`OBSERVED_AT_RUNTIME`).
- O retorno de `stale: true` em `gaabwiki.search` é comprovado no teste unitário `test_stale_after_source_change` em `fixtures/evolveloop-wiki-vault/tests/test_index.py` (`VERIFIED_IN_CODE`).

---

## 4. Fluxo de Exclusão e Invalidação

A auditoria identificou que **não existe um fluxo automatizado de propagação de exclusão (Delete cascade)** entre o monorepo e o cofre da Wiki.

### Comportamento Real Implementado:
1. **Exclusão de Arquivo de Código Fonte:**
   - Se um arquivo de código citado em `source_paths` for deletado do monorepo, a execução de `carpaccio.py lint` detecta que `not fp.is_file()` e marca a página como `status: obsoleto` (`VERIFIED_IN_CODE`).
   - No vault (`gaabwiki`), a função `source_hash()` retorna `None`, e a consulta subsequente marca a fonte como inconsistente.
2. **Exclusão de Página Documental em `.ai/pages/`:**
   - Se uma página `.md` for apagada em `.ai/pages/`, o arquivo de manifesto local (`manifest.yaml`) não remove a chave antiga automaticamente até que `carpaccio.py update` seja executado.
   - O cofre da Wiki **não apaga a página antiga** a menos que o script `sync-carpaccio-to-vault.sh` seja executado (ele realiza `rm -rf $DEST` e recopia tudo) seguido de `gaabwiki rebuild`.
3. **Ausência de Garbage Collection no Vault:**
   - Se o sincronizador não for rodado, chunks órfãos permanecem em `.data/manifest.json` do vault indefinidamente.

---

## 5. Fluxo de Utilização por Agentes no Ciclo `/evolve`

Este é o fluxo integrado completo que rege a jornada de desenvolvimento no EvolveLoop:

```mermaid
flowchart TD
    Start(["Início: /evolve &lt;tarefa&gt;"]) --> GateGraphify{"1. Hard-Gate Graphify<br/>/tmp/.../bin/graphify existe?"}
    
    GateGraphify -->|Sim| RunGraphify["Executa graphify query<br/>Gera arestas AST e caminhos"]
    GateGraphify -->|Não| BlockGraphify["Registra graphify_skill_status: blocked<br/>Não quebra o fluxo"]
    
    RunGraphify --> GateWiki["2. Hard-Gate Wiki Grounding<br/>(Context Engineer)"]
    BlockGraphify --> GateWiki
    
    GateWiki --> RitualGround["Executa ground.sh scout/search<br/>Consulta WIKI_ROOT"]
    RitualGround --> ContextPack["Gera Context Pack:<br/>Fontes + Contratos + GAPs + Método + Handoff"]
    ContextPack --> GroundingEv["Grava memory/&lt;feature&gt;/evidence/grounding.json<br/>Status: applied"]
    
    GroundingEv --> Phase1["3. Fase 1: /planejar<br/>Gera memory/&lt;feature&gt;/plan.ir.yaml"]
    
    Phase1 --> Phase2["4. Fase 2: Implementação (Workers)<br/>backend / frontend-pro / etc."]
    Phase2 --> CodeEdits["Edição de arquivos no monorepo"]
    
    CodeEdits --> Phase3["5. Fase 3: Portões de Qualidade (Gates)"]
    Phase3 --> TestGate["testing: executa suíte de testes"]
    TestGate --> TestEv["Grava memory/&lt;feature&gt;/evidence/gate.testing.json"]
    
    Phase3 --> SecGate["security-review: valida permissões e AST"]
    SecGate --> SecEv["Grava memory/&lt;feature&gt;/evidence/gate.security.json"]
    
    Phase3 --> POGate["po-review: valida contra critérios de aceite"]
    POGate --> POEv["Grava memory/&lt;feature&gt;/evidence/gate.po.json"]
    
    TestEv & SecEv & POEv --> VerifyAll{"Todos os arquivos de evidência<br/>existem fisicamente no disco?"}
    VerifyAll -->|Não| BlockFlow["BLOQUEADO: Comando continuar indisponível"]
    VerifyAll -->|Sim| Phase6["6. Fase 6: Finalização e Registro"]
    
    Phase6 --> WikiLog["Atualiza {Projeto}/log.md no vault<br/>Atualiza .ai/pages se contratos mudaram"]
    WikiLog --> End(["Conclusão com Sucesso"])
```

### Pontos Críticos do Fluxo de Agentes:
1. **Prioridade de Grounding:** A regra absoluta do EvolveLoop estipula que nenhum agente implementador pode alterar código sem antes ter a evidência `grounding.json` aprovada (`VERIFIED_IN_CODE`).
2. **Dependência de Arquivos Físicos:** O avanço entre as fases do ciclo de vida não aceita saída de texto puro no transcript da conversa. A função de transição verifica compulsoriamente a existência dos arquivos `.json` sob `memory/<feature_id>/evidence/` (`VERIFIED_IN_CODE`).
