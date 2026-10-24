# Plano de Validação Experimental: Harness de 24 Tarefas — EvolveLoop V2.5 UKS

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Unified Knowledge System (UKS Core) |
| **Document ID** | EL-V25-UKS-VAL-10 |
| **Status** | CANONICAL VALIDATION PROTOCOL (`PROPOSED`) |
| **Evaluation Arms** | B0 (Grep), B1 (Wiki), B3 (Graphify), B_UKS (Unified) |
| **Harness Dataset** | 24 Tarefas Congeladas (H07-H18, H19-H24, X01-X06) |
| **Last Updated** | 2026-10-24 |

---

## 1. Protocolo Experimental e Desenho dos 4 Braços de Avaliação

O objetivo da validação experimental é demonstrar que o UKS Core supera os três mecanismos históricos em precisão, velocidade, segurança e economia de tokens:

```
┌────────────────────────────────────────────────────────────────────────┐
│ BRAÇO B0 (Baseline Tradicional):                                       │
│ Busca textual ingênua via grep / busca direta de arquivos completos.   │
├────────────────────────────────────────────────────────────────────────┤
│ BRAÇO B1 (Motor Wiki Python V2.2):                                     │
│ Invocação de python -m gaabwiki search via subprocesso IPC.            │
├────────────────────────────────────────────────────────────────────────┤
│ BRAÇO B3 (Recuperação Sintática Graphify V2.2):                        │
│ Consulta ao grafo compilado graphify-out/graph.json (7.4 MB) via CLI.  │
├────────────────────────────────────────────────────────────────────────┤
│ BRAÇO B_UKS (Unified Knowledge System V2.5):                           │
│ Motor híbrido in-process (BM25 + AST nativo + TruthFence + Scopes).    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Inventário do Dataset de 24 Tarefas Congeladas

O benchmark é composto por 24 cenários determinísticos distribuídos em três grupos funcionais:

### 2.1 Grupo 1: 12 Tarefas de Desenvolvimento (H07 a H18)
Utilizadas para calibração de pesos BM25 e ajuste fino do limiar de fusão RRF:
- **H07:** Resolução de dependências do módulo de autenticação.
- **H08:** Busca por contrato de interface de storage (`KnowledgeStore`).
- **H09:** Consulta a regras de timeout de subprocessos em `WikiKnowledgeBackend`.
- **H10:** Verificação de tratamento de erros em parsing de YAML.
- **H11:** Recuperação de convenção de nomes de branches no `WORKTREE_POLICY`.
- **H12:** Identificação de invariantes de autoridade no `TruthFence`.
- **H13:** Mapeamento de listeners de eventos no `EvidenceBus`.
- **H14:** Checagem de políticas de sanitização de segredos em `secret-redaction.ts`.
- **H15:** Resolução de classes derivadas de `BaseAdapter`.
- **H16:** Auditoria de funções assíncronas sem tratamento de rejeição.
- **H17:** Busca de referências ao tokenizador `tiktoken`.
- **H18:** Validação de fatias protegidas no `ContextBudget`.

### 2.2 Grupo 2: 6 Tarefas Held-Out Oficiais (H19 a H24)
Avaliação cega de generalização sem exposição prévia aos prompts:
- **H19:** Pergunta conceitual sobre propagação de erros em DAGs do `GraphStore`.
- **H20:** Recuperação cruzada de ADRs sobre política de modelos (Model Routing).
- **H21:** Localização de fixtures de teste órfãs no repositório.
- **H22:** Contratos de comunicação inter-agentes via `send_message`.
- **H23:** Rastreamento de mutações de estado no ciclo de vida de tarefas.
- **H24:** Identificação de requisitos de compatibilidade Node.js no `package.json`.

### 2.3 Grupo 3: 6 Tarefas Adversariais de Isolamento de Escopo (X01 a X06)
Testes de penetração projetados para forçar vazamento de contexto entre projetos:
- **X01 (Injeção de Canário de Projeto Vizinho):** Tenta recuperar nota marcada com `scope: "project:financeiro"` a partir de contexto `project:loja`.
- **X02 (Colisão Semântica de Alta Pontuação):** Consulta termos técnicos idênticos presentes em dois projetos distintos; verifica se apenas o projeto ativo é retornado.
- **X03 (Path Traversal em Proveniência):** Forja `source_paths` contendo `../../etc/passwd` ou caminhos fora do workspace; verifica bloqueio do sanitizador.
- **X04 (Bypass de TruthFence por Tópico Homônimo):** Tenta injetar nota obsoleta do vault com score BM25 elevado para sobrepor código local recente.
- **X05 (Vazamento por Embedding Global):** Simula similaridade de cosseno $> 0.95$ entre query do projeto e segredo de outro cliente no cofre global; avalia pre-filtering.
- **X06 (Sobrecarga de Contexto com Chunks Sintéticos):** Injeta 500 chunks para avaliar o comportamento do `ContextBudget` e certificar que fatias protegidas não são descartadas.

---

## 3. Critérios de Aceite Inegociáveis (AC-01 a AC-06)

Para que a implementação do UKS Core seja declarada homologada para produção no EvolveLoop V2.5, **todos os 6 critérios devem ser atingidos simultaneamente**:

| Critério | Métrica Avaliada | Alvo Inegociável | Comportamento em Caso de Falha |
| :---: | :--- | :---: | :--- |
| **AC-01** | Recall em Tarefas Held-Out (H19-H24) | $\ge 5/6$ ($83.3\%$) | Re-calibração de pesos da fusão RRF. |
| **AC-02** | Vazamento Cruzado de Escopo (X01-X06) | **$0.00\%$ (Zero Absoluto)** | **VETO IMEDIATO / BLOQUEIO DE RELEASE** |
| **AC-03** | Redução de Tokens de Entrada vs B0 | $\ge 10\%$ global ($\ge 60\%$ em código) | Refinamento da ancoragem de trechos. |
| **AC-04** | Detecção de Código Obsoleto (Staleness) | **$100\%$** dos hashes divergentes | Ajuste no cálculo de mtime/SHA-256. |
| **AC-05** | Latência Mediana por Consulta (p50) | **$< 250$ ms** (Alvo: $< 100$ ms) | Otimização de I/O e caching de tokens. |
| **AC-06** | Taxa de Aprovação na Suíte de Testes | **$100\%$ PASS** (Zero falhas) | Correção obrigatória de defeitos. |

---

## 4. Procedimento de Execução do Harness

O harness será executado via script de benchmark automatizado gerando telemetria em `.evidence/v2.5/benchmarks/`:
```bash
# Execução do harness de validação experimental
npm run test:uks-benchmark
```
Os dados consolidados serão persistidos em `.evidence/v2.5/benchmarks/uks_validation_results.json`.
