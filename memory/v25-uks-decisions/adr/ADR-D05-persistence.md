# ADR-D05: Persistência Unificada com Gravação Atômica e Separação de Schemas

| Metadado | Detalhe |
| :--- | :--- |
| **Documento** | ADR-D05 (Decisão Arquitetural D-05) |
| **Status** | `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` |
| **Data** | 2026-10-24 |
| **Deciders** | Setup Architect, Orquestrador V2.5, Core Maintainers |
| **Classificação Epistêmica** | `VERIFIED_IN_CODE` + `INFERENCE` |
| **Contrato Afetado** | `orchestrator/contracts/knowledge.inspect.yaml` |
| **Branch / Workspace** | `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` |

---

## 1. Contexto & Problema

O ecossistema V2.2 apresenta inconsistências na camada de persistência em disco:
- O `FilesystemKnowledgeStore` em TypeScript (`orchestrator/src/knowledge/filesystem-knowledge-store.ts`) implementa persistência particionada por tipos (`patterns`, `pitfalls`, `bugs`, `decisions`, `contracts`), mas a pasta de destino `knowledge/` sequer existe no repositório (`VERIFIED_IN_CODE`).
- O `FilesystemMemoryStore` (`orchestrator/src/memory/filesystem-memory-store.ts`) possui rotinas para gerenciar `context.yaml`, `preferences.yaml` e `decisions.yaml`, porém nenhum desses arquivos é de fato gerado durante os ciclos de vida (`VERIFIED_IN_CODE`).
- O `EvidenceBus` grava arquivos de portões com alta confiabilidade em `memory/<feature_id>/evidence/` (`VERIFIED_IN_CODE`).
- O cofre global utiliza um subdiretório `.data/` para armazenar `manifest.json` com vocabulário BM25 e chunks (`VERIFIED_IN_CODE`).

A coexistência de múltiplos stores sem uso real gera código órfão, enquanto a gravação direta em arquivos JSON/YAML sem transacionalidade expõe o sistema a corrupção em caso de queda de energia ou terminação abrupta de processos (SIGKILL).

---

## 2. Alternativas Avaliadas

### Alternativa 1: Três Subsistemas de Armazenamento Totalmente Independentes
- **Prós:** Isolamento absoluto de código entre memória, conhecimento e evidências.
- **Contras:** Triplica a lógica de sanitização de caminhos, locks de arquivos, redação de segredos e tratamento de erros de filesystem; mantém código órfão.

### Alternativa 2: Monolito de Dados em Banco Binário Embutido (SQLite/DuckDB)
- **Prós:** Transações ACID automáticas; alta velocidade de agregação.
- **Contras:** Rompe o princípio Local-First em Markdown; arquivos binários geram conflitos no Git; opacidade para o desenvolvedor inspecionar diffs.

### Alternativa 3: Infraestrutura Compartilhada de Storage Core com Schemas e Retenções Estritamente Separadas — **RECOMENDADA**
- **Prós:**
  - **Storage Core Unificado:** Módulo único e robusto de I/O (`storage-core.ts`) responsável por:
    1. Prevenção de *path traversal* (`assertPathConfined`).
    2. Gravação **atômica** em duas etapas (escreve em `.data/.tmp-<uuid>`, `fsync`, e executa `fs.renameSync` atômico).
    3. Redação automática de segredos antes de persistir em disco.
  - **SSOT em Markdown:** Todo conhecimento durável permanece em arquivos `.md` versionados no Git.
  - **Índice Derivado Descartável:** O índice compilado de busca reside em `.data/project-index.json`. Se for excluído, é regenerado integralmente a partir dos Markdowns em < 500 ms (`AC-04`).
  - **Separação Rígida de Schemas & Retenção:**
    - *Conhecimento de Projeto:* Schema `UKSKnowledgeItem`, retenção permanente no Git.
    - *Evidências:* Schema `GateEvidenceArtifact`, retenção permanente na pasta de evidências.
    - *Episódios:* Schema `EpisodicSession`, retenção transitória com política de expurgo configurável.
- **Contras:** Exige implementar a primitiva de escrita atômica com suporte a Windows e POSIX.

---

## 3. Primitiva de Gravação Atômica (Design de Engenharia)

```typescript
export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const tempPath = path.join(dir, `.tmp-${crypto.randomUUID()}`);
    const serialized = JSON.stringify(data, null, 2);
    
    // 1. Escrita no arquivo temporário
    await fs.promises.writeFile(tempPath, serialized, { encoding: "utf8" });
    
    // 2. Substituição atômica via syscall rename (POSIX atomic rename)
    await fs.promises.rename(tempPath, filePath);
}
```

---

## 4. Decisão Proposta

1. **Adotar o modelo de Infraestrutura Compartilhada com Schemas Segregados.**
2. Formalizar a **depreciação dos stores órfãos** (`FilesystemKnowledgeStore` e `FilesystemMemoryStore`) em favor do Storage Core do UKS.
3. Padronizar o diretório local `.data/` para armazenamento exclusivo de índices derivados descartáveis.
4. Tornar obrigatório o uso da primitiva `writeAtomicJson` para todas as gravações do UKS, EvidenceBus e manifestos, eliminando o risco de arquivos truncados.

---

## 5. Consequências & Riscos Mitigados

- **Consequências Positivas:** Garantia de integridade do índice contra interrupções de processo; unificação da higienização de paths; eliminação de código morto no repositório.
- **Riscos Mitigados:** Elimina o risco de corrupção de arquivos de índice durante desligamento inesperado ou cancelamento de turnos pelo usuário.
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` (Homologado para execução).
