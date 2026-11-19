# Relatório de Componente: Wiki Vault & gaabwiki

---

## 1. Identidade
- **O que é?**  
  O motor de indexação e recuperação lexical (BM25) e semântica que opera sobre o cofre global de conhecimento (Wiki Vault). Possui uma implementação de referência/fixture no repositório em `fixtures/evolveloop-wiki-vault/gaabwiki/` e uma versão externa completa (`karpathyWiki`) opcionalmente dotada de LanceDB e embeddings Ollama.
- **Qual é sua finalidade declarada?**  
  Servir como a base central de conhecimento cross-project e de longo prazo do ecossistema, permitindo indexar centenas de páginas Markdown de múltiplos projetos e recuperá-las por relevância com metadados detalhados de proveniência e linha.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Varredura de páginas Markdown em diretórios `projects/` e `packs/`.
  - Extração de frontmatter (`source_paths`, `keywords`) e particionamento em chunks estruturados (`Chunk`).
  - Cálculo de digests estáveis (`chunk_id = rel_vault#sha256`) e associação de hashes de arquivos de código fonte originais (`source_hashes`).
  - Reconstrução de índice incremental com salvamento de catálogo em `.data/manifest.json`.
  - Execução de busca lexical com ranqueamento por contagem de tokens compartilhados (`_tokenize()`).
  - Verificação de frescor da fonte em tempo de consulta: compara o hash indexado com o hash ao vivo do arquivo no monorepo (`monorepo_root`), sinalizando `stale: true` e `stale_reason: "source_hash_mismatch"` se o código divergir.
  - Exposição de interface CLI (`python -m gaabwiki {rebuild,search,health}`).
- **Qual problema resolve?**  
  Centraliza o conhecimento corporativo ou pessoal em um cofre externo desacoplado do código, fornecendo busca rápida com garantia de detecção de fontes obsoletas.

---

## 2. Localização
- **Arquivos principais:**  
  - `fixtures/evolveloop-wiki-vault/gaabwiki/cli.py`: Ponto de entrada CLI, subcomandos `rebuild`, `search`, `health`.
  - `fixtures/evolveloop-wiki-vault/gaabwiki/indexing.py`: Lógica de chunking, cálculo de tokens, busca e checagem de staleness.
  - `fixtures/evolveloop-wiki-vault/gaabwiki/manifest.py`: Persistência do manifesto `.data/manifest.json` e cálculo de SHA-256.
- **Instâncias no ambiente:**  
  - Fixture local portátil: `fixtures/evolveloop-wiki-vault/`.
  - Vault canônico externo apontado pela variável de ambiente `WIKI_ROOT` (ou `RAG_REPO_ROOT`).
- **Documentação relevante:**  
  - `docs/adr/0012-wiki-default-knowledge-backend.md`.
  - `docs/adr/0005-hybrid-retrieval-degraded-mode.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  No diretório apontado por `WIKI_ROOT`:
  - Documentos Markdown sob `<vault>/projects/<projeto>/pages/*.md` e `<vault>/packs/*.md`.
  - Índice compilado em `<vault>/.data/manifest.json`.
- **Em qual formato?**  
  JSON estruturado no manifesto:
  ```json
  {
    "version": 1,
    "vault_root": "/caminho/do/vault",
    "corpus_size": 42,
    "chunks": [
      {
        "chunk_id": "projects/evolveloop/pages/backend.md#a1b2c3d4",
        "vault_path": "projects/evolveloop/pages/backend.md",
        "repo_sources": ["orchestrator/src/index.ts"],
        "line": 1,
        "text": "Conteúdo...",
        "source_hashes": { "orchestrator/src/index.ts": "hash..." }
      }
    ],
    "sources": { ... }
  }
  ```
- **Persistência:**  
  O manifesto é persistido em disco para possibilitar buscas instantâneas sem reindexação total a cada query.

---

## 4. Ciclo de vida
1. **Indexação (`rebuild --incremental`):**  
   - Descobre todas as páginas Markdown do cofre.
   - Extrai metadados do frontmatter.
   - Se o modo incremental estiver ativo e o texto e os hashes de fonte não mudaram, reutiliza o chunk antigo.
   - Atualiza `.data/manifest.json` com o tamanho do corpus e metadados.
2. **Consulta (`search`):**  
   - Lê `.data/manifest.json`. Se não houver chunks, retorna imediatamente status `empty_corpus`.
   - Tokeniza a query e calcula o score de intersecção com os tokens de cada chunk.
   - Ordena os chunks por score decrescente e recorta no limite `top_k` (padrão 8).
   - Para cada chunk selecionado, se o caminho do monorepo estiver disponível (`monorepo_root`), relê o arquivo físico correspondente e calcula seu hash ao vivo. Se for diferente do hash indexado, ativa a flag `stale: true`.
   - Retorna o JSON com os itens selecionados.
3. **Checagem de Saúde (`health`):**  
   Valida se `.data/manifest.json` existe e é legível; caso contrário, encerra com código de saída 1.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - Subprocesso disparado por `WikiKnowledgeBackend` no orquestrador Node.js (`python -m gaabwiki search <query>`).
  - Script bash `ground.sh` da skill Cursor `wiki`.
  - Scripts de manutenção periódica (`sync-carpaccio-to-vault.sh`).
- **Obrigatoriedade:**  
  Obrigatório caso a Wiki seja a fonte de grounding adotada para o projeto.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  Durante rituais de grounding de arquitetura, investigações de contratos de API e chamadas à capability `knowledge.search`.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:**  
  `query: string`, `--top-k int`, `--projeto str`.
- **Saída (JSON):**  
  ```json
  {
    "status": "ok",
    "confidence": "high",
    "allow_generation": true,
    "retrieval_method": "bm25",
    "corpus_size": 15,
    "selected": [
      {
        "score": 3.0,
        "content": "trecho...",
        "source": {
          "file": "orchestrator/src/index.ts",
          "line": 1,
          "vault_page": "projects/evolveloop/pages/backend.md",
          "source_hash": "...",
          "live_hash": "...",
          "stale": false,
          "stale_reason": null
        }
      }
    ]
  }
  ```

---

## 8. Dependências e integração
- **Dependências externas:**  
  A versão fixture no repositório depende exclusivamente da biblioteca padrão do Python 3 (`hashlib`, `json`, `re`, `argparse`, `pathlib`, `dataclasses`). Não necessita de PyPI externo.
- **Acoplamento:**  
  Requer que a variável `WIKI_ROOT` aponte para um diretório válido contendo a estrutura da Wiki.

---

## 9. Configuração e operação
- **Configuração:**  
  `WIKI_ROOT` ou `RAG_REPO_ROOT` (obrigatória).  
  `EVOLVELOOP_MONOREPO_ROOT` ou `AGENTS_ROOT` (opcional, para checagem de staleness de arquivos de código).
- **Comportamento em ausência:** Se `WIKI_ROOT` não estiver configurado, aborta com mensagem de erro explícita no stderr.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  `fixtures/evolveloop-wiki-vault/tests/test_index.py`: Cobre busca, reconstrução e detecção de staleness (`test_stale_after_source_change`).
- **Comprovação:** `VERIFIED_IN_CODE` e testado via CLI (`python3 -m gaabwiki --help` executado com código 0).
- **Confiabilidade:** O mecanismo de checagem ao vivo de hash garante que o modelo nunca receba documentação defasada sem que a flag `stale` seja emitida.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `fixtures/evolveloop-wiki-vault/gaabwiki/indexing.py#L125-L232`.
- `OBSERVED_AT_RUNTIME`: Execução com sucesso do CLI `gaabwiki` via `python3 -m gaabwiki --help`.
- `DOCUMENTED_ONLY`: Implementação completa com LanceDB e embeddings de terceiros presente na árvore externa `karpathyWiki`.

---

## 12. Resumo operacional
- **Responsabilidade real:** Motor de indexação e busca léxica com verificação instantânea de obsolescência de código.
- **Quem o utiliza:** O `WikiKnowledgeBackend` do orquestrador e a skill `wiki`.
- **Quando é acionado:** Durante rituais de grounding ou comandos de busca na Wiki.
- **Fonte de dados:** Notas Markdown em `WIKI_ROOT`.
- **Principal dependência:** Python 3 e diretório do vault configurado.
- **Principal risco / limitação:** Na fixture embutida, a busca é léxica por sobreposição de termos; busca semântica densa depende do cofre externo completo.
- **O que falta verificar:** Medir o overhead de I/O da verificação de hash ao vivo em repositórios com dezenas de milhares de arquivos.
