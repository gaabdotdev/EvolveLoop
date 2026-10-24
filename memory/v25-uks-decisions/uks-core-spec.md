# UKS Core: Especificação Técnica e Contratos de Engenharia — EvolveLoop V2.5

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Unified Knowledge System (UKS Core) |
| **Document ID** | EL-V25-UKS-SPEC-08 |
| **Status** | CANONICAL TECHNICAL SPECIFICATION (`PROPOSED`) |
| **Target Directory** | `orchestrator/src/knowledge/uks/` |
| **Last Updated** | 2026-10-24 |

---

## 1. Fontes Canônicas e Hierarquia de Autoridade

O UKS Core consome conhecimento de fontes heterogêneas, aplicando a regra inegociável de **Markdown Local-First como SSOT**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 0: CÓDIGO-FONTE REAL (Source of Truth Supremo)                    │
│ Arquivos de implementação e testes em disco. Prevalência absoluta.     │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 1: CONHECIMENTO CANÔNICO LOCAL (.ai/pages/*.md)                   │
│ Notas de arquitetura, contratos e convenções específicas do projeto.   │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: COFRE CORPORATIVO GLOBAL ($WIKI_ROOT/packs/*.md)               │
│ Padrões organizacionais e diretrizes compartilhadas multi-projeto.     │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: INFERÊNCIA / ANÁLISE TRANSIENTE (LLM Inference)                │
│ Deduções sintéticas geradas pelo modelo; autoridade mínima.            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Contratos Formais de Dados (TypeScript Interfaces)

### 2.1 Contrato de Entidade de Conhecimento (`UKSKnowledgeItem`)

```typescript
export type EpistemicStatus = "active" | "obsoleto" | "draft" | "review_required";
export type KnowledgeTier = "code" | "ai" | "vault" | "inferred"; // Tiers 0 a 3

export interface UKSKnowledgeItem {
    id: string;                         // Identificador único (ex: "note:adr-0015")
    title: string;                      // Título descritivo legível
    content: string;                    // Conteúdo em Markdown
    scope: string;                      // "project:<project_id>" ou "global"
    tier: KnowledgeTier;                // Nível de autoridade TruthFence
    status: EpistemicStatus;            // Estado de frescor
    source_paths: string[];             // Arquivos de código relacionados
    source_sha256?: string;             // Hash SHA-256 do arquivo no momento da ingestão
    ast_symbols?: string[];             // Símbolos sintáticos vinculados (classes, interfaces)
    created_at: string;                 // ISO 8601
    updated_at: string;                 // ISO 8601
    metadata: Record<string, unknown>;  // Extensibilidade
}
```

### 2.2 Contrato de Consulta (`UKSQueryRequest` & `UKSQueryResponse`)

```typescript
export interface UKSQueryRequest {
    query: string;                      // Consulta em linguagem natural ou símbolo
    workspace_root: string;             // Caminho do projeto para resolução de escopo
    max_tokens?: number;                // Teto orçamentário (default: 2000)
    allow_global?: boolean;             // Habilita consulta ao cofre global (default: false)
    required_symbols?: string[];        // Símbolos AST obrigatórios
    min_confidence?: number;            // Limiar mínimo de score (0.0 a 1.0)
}

export interface UKSQueryHit {
    item: UKSKnowledgeItem;             // Item recuperado
    score: number;                      // Pontuação consolidada RRF
    match_sources: ("bm25" | "ast" | "vector")[]; // Canais que recuperaram o item
    epistemic_tier: KnowledgeTier;      // Tier de autoridade
    citation_ref: string;               // Referência cirúrgica (ex: "src/core/parser.ts:42-88")
}

export interface UKSQueryResponse {
    query_id: string;                   // UUID da consulta
    hits: UKSQueryHit[];                // Resultados ordenados por autoridade e relevância
    context_pack_markdown: string;      // Bloco consolidado e pronto para injeção no prompt
    token_count_estimated: number;      // Contagem aproximada de tokens
    latency_ms: number;                 // Duração da recuperação
    degraded_mode: boolean;             // Indica se operou sem motor vetorial (fail-closed)
    scope_enforced: string;             // Escopo de projeto validado
}
```

---

## 3. O Pipeline de Recuperação em 10 Passos

O fluxo de processamento do UKS Core executa 10 etapas determinísticas a cada requisição:

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Agente Requisitante
    participant UKS as UKS Core Engine
    participant Scope as Scope Resolver
    participant Lex as BM25 Retriever
    participant AST as Native AST Extractor
    participant RRF as Reciprocal Rank Fusion
    participant Fence as TruthFence & Canary Guard
    participant Pack as Context Pack Builder

    Agent->>UKS: query(UKSQueryRequest)
    UKS->>UKS: 1. Parse & Sanitize Request
    UKS->>Scope: 2. Resolve Project Scope (project:<id>)
    UKS->>UKS: 3. Verify Code Freshness & Stale Hashes
    par Recuperação Multimodal
        UKS->>Lex: 4. BM25 Lexical Search (in-process)
        UKS->>AST: 5. AST Syntactic Graph Search
        UKS->>UKS: 6. Local Vector Search (se disponível; senão degraded)
    end
    Lex-->>RRF: Hits Léxicos
    AST-->>RRF: Hits Estruturais
    RRF->>RRF: 7. Reciprocal Rank Fusion (k=60)
    RRF->>Fence: Hits Ranqueados
    Fence->>Fence: 8. TruthFence Authority Filter (Tiers 0-3)
    Fence->>Fence: 9. Canary & Anti-Leakage Audit
    Fence->>Pack: Hits Filtrados e Validados
    Pack->>Pack: 10. Assemble Context Pack & ContextBudget Slicing
    Pack-->>Agent: UKSQueryResponse (Context Pack Cirúrgico)
```

### Detalhamento das 10 Etapas:

1. **Parse & Sanitize Request:** Normaliza strings de consulta, remove caracteres nulos e valida parâmetros de entrada.
2. **Scope Resolution & Whitelisting:** Calcula `projectScopeId` (SHA-256 do workspace normalizado). Se `allow_global` for falso, restringe a busca estritamente à partição do projeto.
3. **Stale Detection & Hash Invalidation:** Compara o mtime e hash SHA-256 dos arquivos em `source_paths`. Notas com código divergente recebem marcação imediata `status = "obsoleto"` e são penalizadas.
4. **BM25 Lexical Retrieval:** Motor BM25 in-process executado sobre o índice de tokens de `.data/project-index.json`.
5. **Native AST Syntactic Retrieval:** Consulta o subgrafo de classes, interfaces e funções exportadas para recuperar contratos sintáticos exatos.
6. **Local Vector Search (Opcional):** Se embeddings locais via Ollama estiverem ativos, gera scores de cosseno; caso contrário, ativa `degraded_mode: true` sem interromper a execução.
7. **Reciprocal Rank Fusion (RRF):**
   $$RRF(d) = \sum_{m \in M} \frac{1}{60 + r_m(d)}$$
   Combina as listas ordenadas de BM25, AST e Vetores com constante de suavização $k = 60$.
8. **TruthFence Authority & Status Filtering:** Itens com `status == "obsoleto"` são descartados. Se houver contradição de tópicos, o item de menor Tier numérico (ex: Tier 0 sobre Tier 2) suprime os demais.
9. **Canary & Cross-Project Leakage Audit:** Executa varredura de strings canário no payload montado. Se um canário de projeto alheio for detectado, a consulta é abortada com `SECURITY_LEAK_PREVENTED`.
10. **Context Pack Assembly & ContextBudget Slicing:** Formata o resultado no envelope cirúrgico `<context_pack>`, truncando trechos excedentes sem violar fatias protegidas (`acceptance_criteria`, `security_restriction`).
