# Implementation Roadmap — Meta 01–10

**Nota:** ordem **proposta** no blueprint M00. Nenhuma Meta >00 está implementada aqui.  
**Dependências:** ver também `dependency-matrix.md`.

---

## Visão por Meta

| Meta | Nome | Objectivo | Depende de |
|------|------|-----------|------------|
| **M00** | Architecture Discovery & Blueprint | Este pacote docs | — |
| **M01** | Persistent Work Foundation | Work aggregate + projeções read sobre stores atuais; PWR esboço **mínimo** | M00 |
| **M02** | Attempt Model | Entidade Attempt; ligar Task ↔ Agent/native run | M01 |
| **M03** | Agent Replaceability Contract | Formalizar continuity/Handles/lifecycle como contrato testável Work-first | M01 |
| **M04** | Harness ↔ Native Mode Split | Superfícies e telemetria por modo (ADR-003) | M01, M02 |
| **M05** | Evidence & Delivery Persistence | Unificar leitura Evidence; Delivery projection estável (sem mentir PASS) | M01, M02 |
| **M06** | Integration Surfaces Honesty | CLI/MCP/ACP/API documentados + stubs honestos; **sem** equivaler (ADR-004) | M04 |
| **M07** | Session & Workspace Views | Projeção unificada Session; Workspace produto sem fundir stores à força | M01, M03 |
| **M08** | V4 Compatibility Layer | Dual-label Task/Work; migration notes; sem regressão journey | M01, M05, M07 |
| **M09** | Extensions Boundary | Contratos para SDK / Studio **sem** implementar produto completo | M01–M06 |
| **M10** | Gate Closure A–J | Provas validation-plan; LIMITATIONs honestas | M01–M09 relevantes |

---

## Grafo de dependências

```text
M00
 └─→ M01 ──┬─→ M02 ──┬─→ M04 ─→ M06 ─→ M09
           │         └─→ M05 ─→ M08 ─→ M10
           ├─→ M03 ─→ M07 ─→ M08
           └────────────────────────────→ M10
```

---

## Detalhe (aceitação mínima — planeamento)

### M01 — Persistent Work Foundation
- Introduzir modelo/API **mínima** de Work (read + open/pause metadata) sobre `work_id` existente  
- **Não** apagar Task UX  
- Testes: Work legível após Agent REPLACED / TUI exit  

### M02 — Attempt Model
- Tipo Attempt + persistência aditiva  
- Ligação a ProcessSession / ExecutionRunnerResult  
- GAP actual fecha-se aqui  

### M03 — Agent Replaceability Contract
- Testes de contrato: replace não rebobina verified state; close viewer ≠ kill  
- Documentar SLA vs `cross_provider_swap: unsupported`  

### M04 — Harness ↔ Native
- Flags/campos `execution_mode` em Attempts  
- Relatórios doctor/harness sem colapsar modos  

### M05 — Evidence & Delivery
- API de leitura única; manter regras M5 provenance  
- Opcional: Delivery aggregate **só** se history exigir  

### M06 — Integrations
- Matriz CLI/MCP/ACP/API no código/docs  
- ACP: spike ou explicit defer — **não** fingir  
- MCP: honesty; bridge só se mediável  

### M07 — Session & Workspace
- View model; taxonomy CLI `workspace` clarificada  
- Sem merge destrutivo MsoSession⊕ProcessSession  

### M08 — Compat V4
- Guias migração; testes journey V4 verdes  
- Supersede Q2 documentado se UX Work-first  

### M09 — Extensions boundary
- Interfaces públicas estáveis; Studio/SDK **fora** do critical path se não prontos  

### M10 — Gates A–J
- Executar `validation-plan.md`; anexar evidência; FAIL/LIMITATION permitidos  

---

## Fora de ordem / proibido cedo

| Tentação | Porquê adiar |
|----------|--------------|
| Agent Studio UI | Sem domínio Work/Attempt → UI mente |
| SDK público amplo | Congela contratos cedo demais |
| ACP completo | Entidades erradas; GAP actual |
| Apagar L3 legado | Precisa taxonomy + M08 |
| Reescrita StateDb | Risco ao WIP REMED |

---

## Relação com WIP V4.3 REMED

Antes de M01 runtime grande: **integrar/commitar** (quando o utilizador pedir) o WIP de remediação (~62 ficheiros) para baseline estável. M00 **não** o altera.
