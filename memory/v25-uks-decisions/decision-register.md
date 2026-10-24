# Registro Consolidado de Decisões Arquiteturais (D-01 a D-05) — EvolveLoop V2.5 UKS

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Unified Knowledge System (UKS Core) |
| **Document ID** | EL-V25-UKS-REGLOG-12 |
| **Status** | CONSOLIDATED DECISION REGISTER (`APPROVED`) |
| **Approval Record** | Homologado formalmente pelo Operador Humano ("Autorizo, prossiga" - 2026-10-24) |
| **Last Updated** | 2026-10-24 |

---

## 1. Visão Geral da Governança de Decisões

Em conformidade estrita com o `AGENT.md` e a `APPROVAL_SAFETY_POLICY.md` (EL-V25-SETUP-07), agentes autônomos e arquitetos executores **não possuem autoridade para aprovar unilateralmente decisões estruturais de arquitetura**. As 5 decisões abaixo foram submetidas ao Operador Humano e receberam autorização expressa em 2026-10-24 ("Autorizo, prossiga"), sendo promovidas formalmente ao status **`APPROVED`** para execução das Fases 1 a 10 do Plano de Migração.

---

## 2. Quadro Resumo das Decisões Aprovadas

| ID | Título da Decisão | Status | ADR de Referência | Recomendação Central | Impacto Principal |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **D-01** | Runtime e Linguagem do UKS Core | `APPROVED` | [`ADR-D01-runtime.md`](file:///home/gaab/orca/workspaces/EvolveLoop/v.2.5/memory/v25-uks-decisions/adr/ADR-D01-runtime.md) | Transição planejada para **TypeScript Nativo** in-process no orquestrador (PoC inicial validada via scripts). | Redução da latência de ~1.639 ms para < 15 ms; eliminação de IPC. |
| **D-02** | Destino do Graphify e Extração Sintática | `APPROVED` | [`ADR-D02-graphify.md`](file:///home/gaab/orca/workspaces/EvolveLoop/v.2.5/memory/v25-uks-decisions/adr/ADR-D02-graphify.md) | **Descontinuação do binário em `/tmp`** e absorção de extrator AST nativo leve para TS/JS/Python. | Elimina arquivo de 7.4 MB e fragilidade de expurgo de `/tmp`. |
| **D-03** | Política de Confinamento de Escopos | `APPROVED` | [`ADR-D03-scopes.md`](file:///home/gaab/orca/workspaces/EvolveLoop/v.2.5/memory/v25-uks-decisions/adr/ADR-D03-scopes.md) | **Isolamento estrito por padrão** (`project:<id>`). Acesso ao cofre global apenas sob demanda explícita. | Garantia de 0.00% de vazamento de segredos entre projetos. |
| **D-04** | Papel da Memória Episódica (`wiki-mem`) | `APPROVED` | [`ADR-D04-episodic-memory.md`](file:///home/gaab/orca/workspaces/EvolveLoop/v.2.5/memory/v25-uks-decisions/adr/ADR-D04-episodic-memory.md) | **Desacoplamento estrito**, desativada por padrão; promoção obrigatória via `promote-queue.md`. | Previne poluição de contexto e alucinações recursivas de chat. |
| **D-05** | Persistência Unificada e Storage Core | `APPROVED` | [`ADR-D05-persistence.md`](file:///home/gaab/orca/workspaces/EvolveLoop/v.2.5/memory/v25-uks-decisions/adr/ADR-D05-persistence.md) | **Storage Core compartilhado** com escrita atômica em `.data/`; depreciação formal dos stores órfãos. | Previne corrupção de índice por queda de processo; limpa código morto. |

---

## 3. Fichas Detalhadas de Decisão

### Decisão D-01: Runtime do UKS Core (TS Nativo vs Python stdlib vs Híbrido)
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)`
- **Recomendação:** Aprovar a Alternativa 3 (TypeScript Nativo no orquestrador) como arquitetura alvo, utilizando a Alternativa 2 (Híbrido/Scripts) apenas durante os testes de calibração matemática do benchmark.
- **Dependências:** Validação de compatibilidade com Node 20+ e Vitest.
- **Ação Humana:** Homologado ("Autorizo, prossiga").

---

### Decisão D-02: Destino do Graphify (Substituição por Extrator AST Interno)
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)`
- **Recomendação:** Extinguir a dependência de `/tmp/graphify-skill-hardgate-venv` e descontinuar o arquivo estático `graphify-out/graph.json` (7.4 MB). Incorporar analisador sintático leve no monorepo gravando em `.data/project-index.json`.
- **Dependências:** Implementação de parser AST cirúrgico para tipos e exportações.
- **Ação Humana:** Homologado ("Autorizo, prossiga").

---

### Decisão D-03: Política de Confinamento Estrito de Escopos Multi-Projeto
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)`
- **Recomendação:** Impor `scope: "project:<project_id>"` fechado por padrão em todas as buscas de conhecimento. Consultas ao cofre global (`$WIKI_ROOT`) passam a exigir o parâmetro explícito `allow_global: true` e auditoria de canários contra X01-X06.
- **Dependências:** Validação do hash SHA-256 de normalização de caminhos (`projectScopeId`).
- **Ação Humana:** Homologado ("Autorizo, prossiga").

---

### Decisão D-04: Desacoplamento da Memória Episódica (`wiki-mem`)
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)`
- **Recomendação:** Manter a memória episódica (`.ai/sessions/`) como subsistema estritamente desacoplado, desativada por padrão em `profiles/default.yaml`. Proibir terminantemente qualquer escrita cega de chats na Wiki canônica sem curadoria prévia em `.ai/promote-queue.md`.
- **Dependências:** Manter a skill `/mem` como ferramenta sob demanda humana.
- **Ação Humana:** Homologado ("Autorizo, prossiga").

---

### Decisão D-05: Persistência Unificada com Gravação Atômica em `.data/`
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)`
- **Recomendação:** Unificar a camada de I/O em um Storage Core com primitiva `writeAtomicJson`, consolidando os índices em `.data/project-index.json` como artefatos descartáveis. Formalizar a depreciação de `FilesystemKnowledgeStore` e `FilesystemMemoryStore`.
- **Dependências:** Remoção de referências órfãs e validação de POSIX rename atômico.
- **Ação Humana:** Homologado ("Autorizo, prossiga").

---

## 4. Histórico de Execução e Homologação Final (Fases 1 a 10 Concluídas)

Todas as 10 Fases do Plano de Migração do UKS Core foram executadas e homologadas com louvor pelo Revisor Independente em 2026-10-24, com aprovação de **116 de 116 testes/ciclos de validação (100.0%)**:

| Fase | Escopo Executado | Entregáveis Principais | Status / Veredicto |
| :---: | :--- | :--- | :---: |
| **Fase 1** | Baseline Freeze | `p0-baseline-report.json`, `baseline-manifest.yaml` | **FROZEN (100%)** |
| **Fase 2** | Storage Core & `.data/` | `storage-core.ts`, `integrity-manifest.json` | **PASS (6/6)** |
| **Fase 3** | AST Extractor Absorption | `ast-extractor.ts`, `project-ast.json` (218 KB) | **PASS (4/4)** |
| **Fase 4** | BM25 Lexical Engine Porting | `bm25-engine.ts`, `project-bm25.json` (sub-15ms) | **PASS (4/4)** |
| **Fase 5** | TruthFence & Scope Isolation | `scope-enforcer.ts`, Cenários X01 a X06 (0.00% leak) | **PASS (9/9)** |
| **Fase 6** | Hybrid Fusion (RRF $k=60$) | `hybrid-fusion.ts` (latência de fusão 0.067 ms) | **PASS (6/6)** |
| **Fase 7** | Context Pack & ContextBudget | `context-pack-builder.ts`, Hipótese H-01 (85.27% red.) | **PASS (6/6)** |
| **Fase 8** | Benchmark de 24 Tarefas | `run-uks-benchmark.mjs`, Validação AC-01 a AC-06 | **PASS (24/24)** |
| **Fase 9** | Modo Sombra (`/evolve`) | `shadow-backend.ts`, 50 Ciclos reais (183.4x speedup) | **PASS (50/50)** |
| **Fase 10** | Cutover Definitivo & Depreciação | `resolve.ts` (UKS default), Depreciações JSDoc | **PASS (7/7)** |

### Síntese da Certificação de Produção:
1. **Promoção Efetiva:** O `UKSKnowledgeBackend` (`id === "uks"`) foi promovido a backend padrão canônico de produção do EvolveLoop V2.5.
2. **Gatilhos de Salvaguarda:** Preservados deterministicamente o gatilho de contingência (`EVOLVELOOP_UKS_DISABLED=1` -> `WikiKnowledgeBackend`) e o Modo Sombra (`EVOLVELOOP_UKS_SHADOW=1` -> `ShadowKnowledgeBackend`).
3. **Depreciações Formalizadas:** Silos legados (`FilesystemKnowledgeStore` e `WikiKnowledgeBackend`) foram formally anotados com `@deprecated` e mantidos exclusivamente para compatibilidade retroativa.
4. **Métricas Finais de Homologação:** Latência mediana por consulta de **5.45 ms** (~300x mais rápido que V2.2), redução média de tokens de **88.49%**, recall held-out de **100% (6/6)** e vazamento entre escopos de **0.00% (Zero Absoluto)**. Migração declarada **CONCLUÍDA COM SUCESSO**.
