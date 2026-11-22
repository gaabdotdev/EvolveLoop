# Validation Plan — Gates A–J

**Regra:** critérios **verificáveis**. Estado inicial pós-M00: **NOT RUN** (exceto onde o código V4 já prova um subcritério — marcado como *baseline parcial*).  
**Proibido:** fingir PASS; promover LIMITATION a PASS; N humano inventado.

---

## Estados permitidos

| Estado | Significado |
|--------|-------------|
| **NOT RUN** | Meta necessária ainda não executou a prova |
| **FAIL** | Prova corrida; critério não cumprido |
| **PASS** | Evidência anexada (comando, teste, artefacto) |
| **LIMITATION** | Critério parcialmente cumprido; causa explícita |
| **DEFERRED** | ADR/Meta decide adiar com justificativa |

---

## Gate A — Work persiste sem Agent ativo

**Critério:** Após Agent `REPLACED` / processo exited / TUI fechada, Work (ou `work_id` + estado coordenado) permanece legível e não terminalizado indevidamente.

| Verificação | Como provar |
|-------------|-------------|
| A1 | Fixture: registar Agent → REPLACED via continuity → ler coordinator/ledger/StateDb |
| A2 | Fechar interface não apaga `CoordinatorState` (já documentado no tipo) |
| A3 | (V5) API Work read após restart CLI |

**Baseline parcial:** continuity + coordinator notes; **GAP** API Work produto.  
**Estado M00:** NOT RUN (A3) / LIMITATION (A1–A2 dependem de testes existentes remed/continuity — não re-declarar PASS sem re-run anexado neste Meta).

---

## Gate B — Agent substituível mid-work

**Critério:** Handoff/replace atribui novo Agent sem rewind de `verified_task_state`; Handles históricos ≠ kill.

| Verificação | Como provar |
|-------------|-------------|
| B1 | Teste continuity applyHandoff |
| B2 | `closeAgentViewer` ⇒ `killed_agent=false` (remed-m3) |
| B3 | Contrato M03 documentado + testes |

**Estado M00:** NOT RUN para fecho V5; baseline V4 REMED existe mas **não** é re-certificado aqui.

---

## Gate C — Agent ≠ Model

**Critério:** Falha/ausência de ModelProvider não marca Work FAIL automaticamente; CLI agents ≠ freellm; campos provider no Agent são metadados.

| Verificação | Como |
|-------------|------|
| C1 | FreeLLM down + Work open permanece |
| C2 | Teste/unidade: AgentRecord sem provider válido ainda serializa |
| C3 | Docs ADR-002 referenciados em help avançado (opcional) |

**Estado M00:** NOT RUN

---

## Gate D — Harness mode honesty

**Critério:** Sem consent/CLI → não `real_eligible`; dry-run não reporta execução real.

| Verificação | Como |
|-------------|------|
| D1 | `inspectHarness` paths (`harness/runtime.ts`) |
| D2 | cli-process sem consent → `DRY_RUN_PROMPT_WRITTEN` |
| D3 | Relatório Attempt/Work inclui `execution_mode=harness` + path |

**Estado M00:** NOT RUN (D3); D1–D2 baseline código

---

## Gate E — Native mode honesty

**Critério:** Native runs mediadas pelo ExecutionRunner/engine não se apresentam como harness CLI; evidência local pode qualificar Delivery só com provenance correta.

| Verificação | Como |
|-------------|------|
| E1 | Run native → ExecutionRunnerResult |
| E2 | Não mapear adapter ok → PASS (já M5) |
| E3 | `execution_mode=native` em Attempt (após M02/M04) |

**Estado M00:** NOT RUN

---

## Gate F — MCP ≠ ACP ≠ CLI ≠ API

**Critério:** Nenhuma superfície documentada como equivalente; ACP ausente declarado GAP; MCP catalog `unknown` se não mediado.

| Verificação | Como |
|-------------|------|
| F1 | `rg` ACP em orchestrator = 0 ⇒ docs dizem GAP (não “suportado”) |
| F2 | catalog mcp level ≠ `full` sem bridge |
| F3 | integration-strategy + ADR-004 publicados |
| F4 | (futuro) se ACP existir: testes protocolo separados de MCP |

**Estado M00:** **PASS documental** para F3 (este pacote); F1 evidência discovery; **não** fechar F4.  
**Fecho Gate F completo:** DEFERRED até M06/M10.

---

## Gate G — Capability honesty (sem PASS forjado)

**Critério:** Delivery PASS só `local_execution`+exit0; attestation→ATTESTED; absent→UNVERIFIED; harness não forja PASS.

| Verificação | Como |
|-------------|------|
| G1 | `remed-m5-delivery-provenance.test.ts` (re-run anexado) |
| G2 | Tentativa de PASS sem evidence falha |
| G3 | ADR-005 + policy em reviews |

**Estado M00:** NOT RUN (não re-executámos suite neste Meta docs-only)

---

## Gate H — Delivery / Evidence rastreáveis

**Critério:** Dado um Work/Task, é possível listar evidence e derivar Delivery com provenance explícita; STALE/INVALID tratados.

| Verificação | Como |
|-------------|------|
| H1 | `evolve delivery show` / deriveDeliveryFromWorkspace |
| H2 | Evidence rows StateDb listáveis |
| H3 | (V5) Delivery aggregate opcional com history |

**Estado M00:** NOT RUN

---

## Gate I — Compatibilidade V4

**Critério:** Jornada Task→Plan→Approval→Delivery e prefs/history/handles OFF continuam; IDs estáveis; testes V4/remed não regridem.

| Verificação | Como |
|-------------|------|
| I1 | Suite orchestrator + remed-m* exit 0 após mudanças V5 |
| I2 | `evolve help` journey intacta |
| I3 | migration-strategy seguida (sem delete stores) |

**Estado M00:** NOT RUN (docs only; WIP intocado)

---

## Gate J — Roadmap & governance

**Critério:** Metas 01–10 e ADRs estão referenciados; riscos rastreados; nenhum Meta implementa Studio/SDK/PWR além do permitido na sua fatia.

| Verificação | Como |
|-------------|------|
| J1 | Pacote M00 completo (este diretório) |
| J2 | Checklist Meta N vs dependency-matrix antes de merge |
| J3 | Risk register actualizado em cada Meta |

**Estado M00:** **PASS** para J1 (entregáveis criados); J2–J3 processo contínuo.

---

## Resumo estado após Meta 00

| Gate | Estado M00 |
|------|------------|
| A | NOT RUN / LIMITATION parcial baseline |
| B | NOT RUN |
| C | NOT RUN |
| D | NOT RUN |
| E | NOT RUN |
| F | PASS documental parcial (F3); fecho DEFERRED |
| G | NOT RUN |
| H | NOT RUN |
| I | NOT RUN |
| J | PASS (J1) |

**Nenhum gate A–J está “V5 CLOSED” após M00.**
