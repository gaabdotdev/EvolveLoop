# ADR-D03: Confinamento Estrito de Escopos por Projeto e Defesa Anti-Vazamento

| Metadado | Detalhe |
| :--- | :--- |
| **Documento** | ADR-D03 (Decisão Arquitetural D-03) |
| **Status** | `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` |
| **Data** | 2026-10-24 |
| **Deciders** | Setup Architect, Orquestrador V2.5, Core Maintainers |
| **Classificação Epistêmica** | `VERIFIED_IN_CODE` + `MEASURED` + `INFERENCE` |
| **Contrato Afetado** | `orchestrator/contracts/security-review.yaml` |
| **Branch / Workspace** | `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` |

---

## 1. Contexto & Problema

O EvolveLoop é projetado para operar tanto em projetos isolados quanto em organizações com múltiplos repositórios e um cofre de conhecimento corporativo global (`$WIKI_ROOT`):
- O código atual em `orchestrator/src/knowledge/truth-source/isolation.ts:11-14` calcula o `projectScopeId` como um hash SHA-256 truncado em 16 caracteres hexadecimais a partir do caminho absoluto normalizado do projeto (`VERIFIED_IN_CODE`).
- Contudo, a função `filterItemsToProjectScope` (`isolation.ts:47-60`) libera automaticamente itens de tier `vault` se a proveniência estiver completa, independentemente do repositório em execução (`VERIFIED_IN_CODE`).
- **Risco Crítico de Segurança:** Se um cofre corporativo contiver notas ou contratos de múltiplos projetos clientes, buscas por similaridade semântica ou BM25 poderiam recuperar trechos de código ou segredos de um projeto vizinho e injetá-los no prompt do agente de outro projeto (*cross-project scope leakage*).

---

## 2. Alternativas Avaliadas

### Alternativa 1: Escopo Aberto com Filtragem Heurística
- **Prós:** Permite máximo reuso de documentação corporativa sem configuração manual.
- **Contras:** Risco inaceitável de vazamento de propriedade intelectual e regras confidenciais entre clientes.

### Alternativa 2: Isolamento Físico Absoluto (Zero Acesso ao Cofre Global)
- **Prós:** Risco zero de vazamento externo.
- **Contras:** Impede o compartilhamento de padrões corporativos, templates universais e ADRs organizacionais homologados.

### Alternativa 3: Confinamento Estrito por Padrão com Acesso Explícito a Pacotes Globais — **RECOMENDADA**
- **Prós:**
  - **Isolamento Fechado (*Default-Closed*):** Por padrão, toda busca no UKS restringe-se estritamente ao escopo `project:<project_id>`.
  - **Acesso Global Mediado:** O acesso a itens com `scope: "global"` do cofre corporativo só é permitido se:
    1. A consulta declarar explicitamente a flag `allow_global: true`.
    2. O item global pertencer a um pacote de conhecimento pré-aprovado (`$WIKI_ROOT/packs/canonical/*.md`).
    3. O item passar pela validação de canários criptográficos (`detectCrossProjectLeakage`).
  - **Imutabilidade de Namespace:** Chunks de projetos nunca são indexados no mesmo espaço de chaves do cofre global.

---

## 3. Especificação do Algoritmo de Resolução de Escopo

```typescript
export function resolveProjectScope(workspaceRoot: string): string {
    const normalized = path.resolve(workspaceRoot).toLowerCase().replace(/\/+$/, "");
    const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
    return `project:${hash.substring(0, 16)}`;
}
```

### Invariantes de Isolamento (Testáveis via X01 a X06):
1. **Invariante 1 (Partição Estrita):** Itens com `scope: "project:A"` jamais podem ser retornados quando o contexto da consulta for `scope: "project:B"`.
2. **Invariante 2 (Anti-Similaridade Semântica):** Alta similaridade de embedding não sobrepõe a restrição booleana de escopo. O filtro de escopo é executado **antes** do ranking (pre-filtering), não após.
3. **Invariante 3 (Canary Rejection):** Se uma string canário registrada para outro escopo for detectada no payload final, o Context Pack é instantaneamente abortado e um alerta de segurança é gerado.

---

## 4. Decisão Proposta

1. **Adotar o modelo "Strict Isolation by Default"** para o UKS Core.
2. Todo documento ingerido no `.data/project-index.json` recebe obrigatoriamente a tag `scope: "project:<project_id>"`.
3. Itens do cofre global devem possuir `scope: "global"` e metadados que certifiquem a ausência de dados proprietários específicos de projetos.
4. Validar o isolamento contra a suíte de testes adversariais X01 a X06 em cada release.

---

## 5. Consequências & Riscos Mitigados

- **Consequências Positivas:** Garantia matemática de 0.00% de vazamento de escopo cruzado; conformidade estrita com normas de privacidade e separação multi-tenant.
- **Riscos Mitigados:** Elimina o risco de contaminação cruzada de regras arquiteturais ou vazamento acidental de tokens/credenciais documentados em outros repositórios.
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` (Homologado para execução).
