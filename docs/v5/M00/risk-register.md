# Risk Register — V5 (a partir de M00)

**Escala:** Probabilidade × Impacto = {L, M, H} → severidade qualitativa.

| ID | Risco | P | I | Severidade | Mitigação | Owner Meta |
|----|-------|---|---|------------|-----------|------------|
| **R-WIP-01** | Perder ou corromper WIP REMED (~62 ficheiros) ao “limpar” para V5 | M | H | **H** | M00 proíbe tocar; merge/commit sob pedido explícito; testes remed-m* | pré-M01 |
| **R-DOM-01** | Work-first conflita com Task UX (ADR Q2) e confunde utilizadores | H | M | **H** | Dual-label; M08; não apagar Q2 sem supersede | M01/M08 |
| **R-DOM-02** | Attempt mal modelado = ProcessSession duplicado / drift | M | M | M | Mapear Attempt → session/run ids; testes | M02 |
| **R-DOM-03** | “Unificar Session” funde stores e parte MSO | M | H | **H** | Só projeções primeiro (M07) | M07 |
| **R-REP-01** | Replace Agent rebobina progresso verificado | L | H | M | Continuity já protege; testes contrato M03 | M03 |
| **R-DEL-01** | Delivery aggregate reintroduz PASS forjado | M | H | **H** | ADR-005; manter M5 provenance | M05 |
| **R-INT-01** | Relatórios colapsam harness dry-run com native real | M | H | **H** | ADR-003; campos execution_mode | M04 |
| **R-INT-02** | Docs/marketing equivalem MCP≈ACP≈Agent | H | M | **H** | ADR-004; Gate F | M06 |
| **R-INT-03** | Implementar ACP cedo sobre domínio errado | M | H | **H** | Depende M01–M02; defer explícito OK | M06 |
| **R-MIG-01** | Big-bang rewrite “V5 limpo” | M | H | **H** | Roadmap incremental; proibição M00 | todos |
| **R-MIG-02** | Dual persistence SQLite/JSON diverge | H | M | **H** | API de leitura única; testes isolamento | M01/M05 |
| **R-EXT-01** | SDK/Studio antes de contratos estáveis | M | M | M | M09 só boundary; feature flags | M09 |
| **R-VAL-01** | Declarar gates A–J PASS sem evidência | M | H | **H** | validation-plan; NOT RUN default | M10 |
| **R-DOC-01** | GAP-DOC-V5 — tese incompleta no repo | H | M | M | Reconciliar quando doc chegar; não inventar | M00+ |
| **R-WIKI-01** | Pack EvolveLoop ausente → grounding fraco | H | L | M | L-WIKI; criar pack fora de runtime V5 | ops |
| **R-HUM-01** | Usabilidade N=0 herdada de V4.3 | H | M | M | Não fingir N>0; estudos separados | pós-M08 |
| **R-CREDS-01** | Dual-home credenciais (L-CREDS) | M | M | M | Deferred D1 V4.3; não misturar com PWR | ops |

---

## Riscos aceites conscientemente (M00)

- Documento estratégico V5 completo ausente → blueprint baseado na tese nomeada + código.  
- Wiki pack ausente → GAP declarado.  
- ACP ausente → tratado como GAP, não como feature.

---

## Gatilhos de escalação

1. Qualquer Meta propor `rm` de stores V4 ou enfraquecer testes remed → **bloquear**.  
2. Qualquer PASS de Delivery sem provenance local → **bloquear**.  
3. Claim “ACP suportado” sem código → **bloquear** (ADR-004).
