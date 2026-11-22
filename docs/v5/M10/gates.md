# V5-M10 — Gates A–J (evidence-bound)

**Data (UTC):** 2026-11-22T22:34:00Z  
**Host Node:** `v22.15.0` (≥22.5.0)  
**HEAD (approx):** `53ad059` + WIP V5/M10 uncommitted  
**Estados permitidos:** `PASS` | `FAIL` | `BLOCKED` | `NOT_RUN` (+ LIMITATION anotada quando parcial)

Critérios canónicos: `docs/v5/M00/validation-plan.md`.

---

## Comandos âncora (M10)

```bash
cd orchestrator
npm run build
# exit 0 — /tmp/v5-m10-build.txt

npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m*.ts
# exit 0 — 12 files / 64 tests — /tmp/v5-m10-v5-tests.txt

npm test 2>&1 | tee /tmp/v5-m10-full-test.txt; echo FULL=$?
# FULL=0 — Test Files 264 passed; Tests 1472 passed | 2 skipped
```

---

## Gate A — Work persiste sem Agent ativo

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| A1 replace → Work legível | **PASS** | `v5-m01-work-runtime.test.ts` (`survives Agent REPLACED`); `v5-m10-integrated-scenario.test.ts` passos 6–7, 11 |
| A2 fechar TUI ≠ apagar | **PASS** | `v5-m01` (`survives TUI exit`) |
| A3 API Work read após restart | **PASS** | M10 passo 11 (`rt.close` → new runtime → `read`) |

**Gate A:** **PASS**

---

## Gate B — Agent substituível mid-work

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| B1 continuity applyHandoff | **PASS** | `v5-m02-orchestration-contracts.test.ts`; M10 passo 7 |
| B2 closeAgentViewer ≠ kill | **PASS** | `remed-m3-handles-attach.test.ts` |
| B3 contrato M02/M03 | **PASS** | `replaceAgentPreservingWork` + docs M02 |

**Gate B:** **PASS**

---

## Gate C — Agent ≠ Model

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| C1 Model down ≠ Work FAIL auto | **PASS** (unit) | `v5-m03-model-provider.test.ts` (registries separados; Work open independente) |
| C2 AgentRecord sem provider válido serializa | **PASS** | M03 + Agent Registry ensure |
| C3 ADR-002 referenciado | **PASS** (doc) | `docs/v5/M00/adr/ADR-002-agent-ne-model.md`; README V5 |

**Gate C:** **PASS**  
**Nota:** FreeLLM live-down E2E não re-corrido neste Meta; prova unitária + contrato.

---

## Gate D — Harness mode honesty

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| D1 inspectHarness paths | **PASS** (baseline + suite) | código `harness/`; engineering-loop harness matrix no `npm test` |
| D2 dry-run sem consent | **PASS** | `engineering-loop.test.ts` (*never marks dry-run as SUPPORTED*); circuit offline E2E |
| D3 Attempt `execution_mode=harness` | **PASS** | `v5-m02-attempt-binding.test.ts` (`bindProcessSession` → harness); M10 passo 5 |

**Gate D:** **PASS**

---

## Gate E — Native mode honesty

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| E1 ExecutionRunnerResult bind | **PASS** | `v5-m02-attempt-binding.test.ts` (`bindExecutionResult`) |
| E2 adapter ok ≠ Delivery PASS | **PASS** | `remed-m5-delivery-provenance.test.ts`; `v5-m06-verification.test.ts` |
| E3 `execution_mode=native` em Attempt | **PASS** | M02 createAttempt native + bind runner |

**Gate E:** **PASS**

---

## Gate F — MCP ≠ ACP ≠ CLI ≠ API

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| F1 ACP = GAP declarado | **PASS** (doc+code notes) | `docs/v5/M02/LIMITATION-acp-deferred.md`; `work-surface` help; `rg` notes em tool-registry/mcp.ts |
| F2 MCP catalog ≠ full host | **PASS** + LIMITATION | `v5-m04`; `LIMITATION-mcp.md` (`invoke_supported=false`) |
| F3 integration-strategy + ADR-004 | **PASS** | `docs/v5/M00/integration-strategy.md`; ADR-004 |
| F4 ACP protocolo testes | **BLOCKED** | ACP ausente — não inventar |

**Gate F:** **PASS** (honesty documental + MCP LIMITATION) com **F4 BLOCKED**  
Não equivaler superfícies; fecho “ACP completo” continua LIMITATION.

---

## Gate G — Capability honesty (sem PASS forjado)

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| G1 remed-m5 re-run | **PASS** | incluído em `npm test` FULL=0 |
| G2 PASS sem evidence falha | **PASS** | `v5-m06-verification.test.ts`; M10 passo 10 (claim → UNVERIFIED) |
| G3 ADR-005 | **PASS** (doc) | `docs/v5/M00/adr/ADR-005-capability-honesty.md` |

**Gate G:** **PASS**

---

## Gate H — Delivery / Evidence rastreáveis

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| H1 getWorkDelivery / derive | **PASS** | `v5-m06`; M10 passo 10 (`local_execution` PASS com `run: true`) |
| H2 Evidence StateDb | **PASS** | `v5-m06` evidence facade tests |
| H3 Delivery aggregate history opcional | **NOT_RUN** | Aggregate history completo fora da fatia; projection API suficiente |

**Gate H:** **PASS** (H1–H2); H3 **NOT_RUN** (não bloqueia fecho projection)

---

## Gate I — Compatibilidade V4

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| I1 suite + remed + v5 | **PASS** | `npm test` → 264 files / 1472 passed / exit 0 (`/tmp/v5-m10-full-test.txt`) |
| I2 journey CLI `--data-dir` | **PASS** | `evolve-cli.integration.test.ts` (após fix M10 defer `work status` com `--data-dir`) |
| I3 migration sem delete stores | **PASS** (doc+code) | `docs/v5/M00/migration-strategy.md`; paths aditivos |

**Gate I:** **PASS**  
**Regressão encontrada e corrigida neste Meta:** `handleWorkSurface` interceptava `work status --data-dir` → legacy JSON `agents_summary` partido; defer quando `--data-dir` presente (`work-surface.ts`).

---

## Gate J — Roadmap & governance

| Verificação | Estado | Evidência |
|-------------|--------|-----------|
| J1 pacote M00 + índice M00–M10 | **PASS** | `docs/v5/README.md`; `docs/v5/M00/` |
| J2 checklist Meta vs dependency | **PASS** (processo) | READMEs M01–M10 + dependency-matrix |
| J3 risk register | **PASS** (M00 base) | `docs/v5/M00/risk-register.md` (não reescrito raw) |
| J UX humano externo | **LIMITATION** | N=0 — `LIMITATION-human-validation.md` |

**Gate J:** **PASS** documental/processual; **não** PASS pleno de UX externo (N=0).

---

## Resumo

| Gate | Estado M10 |
|------|------------|
| A | **PASS** |
| B | **PASS** |
| C | **PASS** |
| D | **PASS** |
| E | **PASS** |
| F | **PASS** (F4 **BLOCKED**; MCP LIMITATION) |
| G | **PASS** |
| H | **PASS** (H3 **NOT_RUN**) |
| I | **PASS** |
| J | **PASS** processual + **LIMITATION** UX humano |

**Human validation:** N=0 — não inventar.  
**Multi-harness live:** LIMITATION — `LIMITATION-multi-harness.md`.
