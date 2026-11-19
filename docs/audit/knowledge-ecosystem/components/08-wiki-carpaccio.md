# Relatório de Componente: Wiki Carpaccio (.ai/ & carpaccio.py)

---

## 1. Identidade
- **O que é?**  
  Um sistema leve e local de documentação de projeto por repositório, fundamentado na convenção do diretório `.ai/` e gerenciado pelo script utilitário em Python `.cursor/skills/wiki-carpaccio/scripts/carpaccio.py`.
- **Qual é sua finalidade declarada?**  
  Implementar a vertente local do "Project Knowledge Contract" (ADR-0004), fornecendo uma base documental humanamente legível, versionável em Git e integrada ao fluxo de agentes, com garantia criptográfica de integridade frente a modificações no código-fonte.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Estruturação do repositório `.ai/` em páginas temáticas (`pages/*.md`), logs de sessão (`log.md`) e índice de projeto (`index.md`).
  - Mapeamento bidirecional entre páginas documentais e os arquivos de código correspondentes através de metadados no frontmatter YAML (`source_paths`).
  - Rastreamento determinístico de integridade via catálogo de hashes SHA-256 em `.ai/manifest.yaml`.
  - Detecção automatizada de obsolescência (`carpaccio.py lint`): se o arquivo de código fonte sofrer alteração ou for excluído, a página associada tem seu metadado alterado automaticamente para `status: obsoleto`.
  - Busca lexical rápida sem dependências externas (`carpaccio.py query "<termo>"`), priorizando páginas atuais e ignorando sumariamente qualquer nota marcada como obsoleta.
  - Sincronização opcional com o cofre global (`docs/architecture/v2.2/scripts/sync-carpaccio-to-vault.sh`).
- **Qual problema resolve?**  
  Resolve o problema clássico de documentações que ficam silenciosamente desatualizadas à medida que o código evolui. O Carpaccio vincula a validade do texto ao hash criptográfico do código auditado.

---

## 2. Localização
- **Arquivos principais:**  
  - `.cursor/skills/wiki-carpaccio/scripts/carpaccio.py`: Script executável com os subcomandos `init`, `query`, `update` e `lint`.
  - `.cursor/skills/wiki-carpaccio/SKILL.md`: Definição normativa da skill.
  - `.ai/manifest.yaml`: Catálogo versionado contendo a correspondência `caminho_do_arquivo: hash_sha256`.
  - `.ai/pages/`: Diretório de notas Markdown vinculadas ao código.
  - `.ai/index.md` e `.ai/log.md`: Registros de índice e histórico.
- **Scripts relacionados:**  
  - `docs/architecture/v2.2/scripts/sync-carpaccio-to-vault.sh`.
- **Documentação relevante:**  
  - `docs/adr/0004-project-knowledge-contract.md`.
  - `.cursor/skills/wiki-carpaccio/SKILL.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  Diretamente no repositório Git, sob a pasta `.ai/`.
- **Em qual formato?**  
  - Notas em Markdown com frontmatter YAML:
    ```markdown
    ---
    title: Resolve wiki backend
    status: atual
    keywords: resolveKnowledgeBackend wiki default switch
    source_paths:
      - orchestrator/src/knowledge/backend/resolve.ts
    ---
    resolveKnowledgeBackend defaults unknown ids to WikiKnowledgeBackend.
    ```
  - Catálogo em YAML:
    ```yaml
    version: 1
    sources:
      orchestrator/src/knowledge/backend/resolve.ts: d730a37502cf63af1310f7331cdc0ad022bc89a3175191743d07158bfa4037d8
    ```
- **Dados originais ou derivados?**  
  As páginas em `.ai/pages/` contêm conhecimento original do projeto; o arquivo `.ai/manifest.yaml` contém dados derivados (hashes criptográficos).
- **Persistência:**  
  Persistência total no Git, integrando o histórico de versões do repositório.

---

## 4. Ciclo de vida
1. **Inicialização (`cmd_init`):**  
   Cria as pastas `.ai/pages/` e `.ai/raw/`, e gera os arquivos iniciais `index.md`, `log.md` e `manifest.yaml`.
2. **Atualização e Cálculo de Hashes (`cmd_update`):**  
   Varre as páginas em `.ai/pages/`, lê os arquivos citados em `source_paths`, calcula o hash SHA-256 e grava em `.ai/manifest.yaml`. Marca a página com `status: atual`.
3. **Auditoria de Frescor (`cmd_lint`):**  
   Varre todas as páginas. Para cada arquivo em `source_paths`, compara o hash ao vivo com o gravado no manifesto.
   - Se o arquivo sumiu ou o hash divergir: reescreve o cabeçalho da página Markdown com `status: obsoleto` e lista a página em `stale_pages`.
4. **Consulta (`cmd_query`):**  
   Recebe termos de busca. Ignora qualquer página que contenha `status: obsoleto`. Calcula pontuação lexical por intersecção de tokens (peso dobrado para termos presentes em `keywords`) e retorna a melhor página em JSON.
5. **Sincronização para Vault:**  
   O script `sync-carpaccio-to-vault.sh` copia `.ai/pages/` para `$WIKI_ROOT/projects/evolveloop/pages/` e dispara o rebuild do índice do cofre via `gaabwiki`.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - Agentes desenvolvedores e comandos do Cursor (`/evolve`, `/planejar`).
  - O Truth Fence no orquestrador (`ProjectKnowledgeRuntime`), que consome notas do tier `ai` e confere se possuem `status: atual`.
  - Scripts de CI ou hooks de validação pré-commit para rodar `carpaccio.py lint`.
- **Obrigatoriedade:**  
  Recomendado no padrão normativo do ADR-0004 para documentação de arquitetura de projeto.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  - Na fase de planejamento e pesquisa arquitetural de tarefas locais.
  - Após alterações em arquivos centrais de arquitetura, para registrar decisões e atualizar hashes.
  - Durante validações de QA e checagem de staleness.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada CLI:**  
  Comandos `init`, `query "<pergunta>"`, `update [--all]`, `lint`.
- **Saída CLI:**  
  Strings JSON padronizadas no stdout:
  ```json
  {"status": "ok", "page": ".ai/pages/backend-resolve-wiki.md", "score": 4, "source_paths": [...]}
  {"ok": true, "stale_pages": [".ai/pages/backend-resolve-wiki.md"]}
  ```

---

## 8. Dependências e integração
- **Dependências externas:**  
  **Nenhuma.** Implementado exclusivamente com a biblioteca padrão do Python 3 (`hashlib`, `json`, `re`, `pathlib`, `argparse`).
- **Acoplamento:** Totalmente autocontido e desacoplado de bancos vetoriais, LLMs ou serviços de rede.

---

## 9. Configuração e operação
- **Configuração:** Funciona nativamente a partir da raiz do repositório Git. Não requer variáveis de ambiente complexas.
- **Comportamento em ambiente mínimo:** Executa em qualquer máquina que possua `python3` instalado.

---

## 10. Qualidade e confiabilidade
- **Testes existentes:**  
  Testado operacionalmente via execução direta de subcomandos e integrado aos testes de cerca da verdade (`truth-source-fence.test.ts`).
- **Comprovação:** `VERIFIED_IN_CODE` e `OBSERVED_AT_RUNTIME`.
- **Risco mitigado:** Elimina completamente o risco de o agente confiar em documentação defasada após um refactor de código.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `.cursor/skills/wiki-carpaccio/scripts/carpaccio.py#L1-L200`.
- `OBSERVED_AT_RUNTIME`: Pasta `.ai/` na raiz do monorepo contendo 6 páginas ativas e manifesto íntegro.
- `OBSERVED_AT_RUNTIME`: Execução com sucesso do comando `carpaccio.py --help` e `carpaccio.py lint` no terminal.

---

## 12. Resumo operacional
- **Responsabilidade real:** Documentação de projeto por repositório com detecção criptográfica de staleness.
- **Quem o utiliza:** Agentes locais, desenvolvedores humanos e o Truth Fence.
- **Quando é acionado:** Durante consultas de arquitetura de projeto e verificação de frescor documental.
- **Fonte de dados:** Arquivos locais em `.ai/pages/*.md`.
- **Principal dependência:** Python 3 padrão.
- **Principal risco / limitação:** A busca lexical (`query`) depende de sobreposição literal de tokens, sem expansão semântica.
- **O que falta verificar:** Criar um teste automatizado na suíte CI do GitHub Actions rodando `carpaccio.py lint` para travar PRs com documentação desatualizada.
