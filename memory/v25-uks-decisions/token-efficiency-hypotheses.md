# Hipóteses de Eficiência de Tokens e Métricas de Validação — EvolveLoop V2.5 UKS

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Unified Knowledge System (UKS Core) |
| **Document ID** | EL-V25-UKS-HYPO-09 |
| **Status** | CANONICAL HYPOTHESES SPECIFICATION (`PROPOSED`) |
| **Methodology Standard** | Falsifiable Empirical Hypotheses (Popperian Standard) |
| **Last Updated** | 2026-10-24 |

---

## 1. Visão Geral da Problemática de Tokens

Nos benchmarks do EvolveLoop V2.2, a mediana de consumo de tokens por tarefa era de aproximadamente **20.500 a 45.000 tokens de entrada** (`REPORTED_UNVERIFIED`). A causa primária desse consumo excessivo não reside no raciocínio do modelo, mas no **comportamento de leitura cega**: agentes executam `read_file` em dezenas de arquivos completos de 500 a 2.000 linhas para encontrar uma única assinatura de função de 5 linhas.

O UKS Core formaliza **4 hipóteses falsificáveis de eficiência** com critérios matemáticos estritos de aceitação e rejeição.

---

## 2. As Quatro Hipóteses Falsificáveis

### Hipótese H-01: Recuperação Cirúrgica por Trechos Ancorados (`file:line-range`)
- **Enunciado Teórico:** A substituição da leitura indiscriminada de arquivos completos (`read_file`) pela injeção prévia de trechos cirúrgicos (snippets de 20 a 50 linhas com proveniência de linha exata) reduz o consumo de tokens de entrada em no mínimo **60%** em tarefas de modificação de código, sem degradar a taxa de sucesso da tarefa.
- **Métrica Primária:** $\Delta \text{InputTokens}_{H01} = \frac{\text{Tokens}_{B0} - \text{Tokens}_{UKS}}{\text{Tokens}_{B0}}$
- **Critério de Aceitação:** $\Delta \text{InputTokens}_{H01} \ge 0.60$ em pelo menos 10 das 12 tarefas de desenvolvimento (H07 a H18), mantendo taxa de sucesso $\ge 90\%$.
- **Critério de Falsificação:** Se a redução média for inferior a 40% ou se a supressão de linhas de contexto causar aumento no índice de erros de compilação.

---

### Hipótese H-02: Deduplicação de Contexto Estático e Hashes de Sessão
- **Enunciado Teórico:** A manutenção de um catálogo incremental de hashes SHA-256 no orquestrador impede a re-injeção de definições de interfaces e contratos arquiteturais imutáveis que já foram consumidos em turnos anteriores da mesma sessão, reduzindo o volume acumulado de tokens de entrada em diálogos multi-turnos em no mínimo **30%**.
- **Métrica Primária:** $\text{RedundancyRatio} = \frac{\text{TokensRepetidos}}{\text{TokensTotaisSessão}}$
- **Critério de Aceitação:** $\text{RedundancyRatio} \le 0.10$ (menos de 10% de tokens redundantes em sessões com mais de 3 turnos).
- **Critério de Falsificação:** Se o modelo solicitar explicitamente releitura de arquivos (`cache_miss_prompting`) em mais de 15% das interações.

---

### Hipótese H-03: Confinamento Estrito de Escopo e Eliminação de Ruído Global
- **Enunciado Teórico:** O pré-filtro booleano rígido por `projectScopeId` elimina completamente a recuperação de chunks do cofre global que sejam semanticamente similares porém contextualmente irrelevantes para o repositório em execução, economizando entre **2.000 e 5.000 tokens** por consulta de arquitetura.
- **Métrica Primária:** Taxa de Chunks Irrelevantes Injetados ($\text{NoiseRate}$) e Vazamento de Escopo ($\text{LeakageRate}$).
- **Critério de Aceitação:** $\text{LeakageRate} = 0.00\%$ (invariante absoluto nos testes X01 a X06) e $\text{NoiseRate} \le 0.05$.
- **Critério de Falsificação:** Se qualquer chunk de projeto alheio for detectado no prompt montado.

---

### Hipótese H-04: Saídas Estruturadas JSON em Gates de Validação
- **Enunciado Teórico:** A imposição de schemas estritos de resposta JSON (via `--output-format json` ou prompt engineering rígido) nos subagentes avaliadores (Test Engineer, Security Specialist, Independent Reviewer) reduz o consumo de tokens de saída (*output tokens*) em **30% a 50%**, eliminando preâmbulos conversacionais, devaneios e formatações decorativas.
- **Métrica Primária:** $\Delta \text{OutputTokens}_{H04} = \frac{\text{TokensOut}_{FreeText} - \text{TokensOut}_{SchemaJSON}}{\text{TokensOut}_{FreeText}}$
- **Critério de Aceitação:** $\Delta \text{OutputTokens}_{H04} \ge 0.35$ com 100% de conformidade de schema validada por `JSON.parse`.
- **Critério de Falsificação:** Se a redução for $< 20\%$ ou se a taxa de parsing quebrado exceder $2\%$.

---

## 3. Matriz de Síntese e Instrumentação

| Hipótese | Foco de Redução | Métrica de Aceite | Mecanismo de Medição | Instrumentação / Log |
| :---: | :---: | :---: | :--- | :--- |
| **H-01** | Tokens de Entrada | $\ge 60\%$ de redução | Comparativo de tokens de prompt B0 vs B_UKS | `.evidence/v2.5/benchmarks/h01_tokens.json` |
| **H-02** | Tokens de Sessão | $\le 10\%$ de redundância | Análise de n-gramas e hashes em turnos | `.evidence/v2.5/benchmarks/h02_session.json` |
| **H-03** | Ruído / Vazamento | $0.00\%$ vazamento | Scanner de canários criptográficos (X01-X06) | `.evidence/v2.5/benchmarks/h03_isolation.json`|
| **H-04** | Tokens de Saída | $\ge 35\%$ de redução | Contagem de tokens em saídas de gates | `.evidence/v2.5/benchmarks/h04_output.json` |
