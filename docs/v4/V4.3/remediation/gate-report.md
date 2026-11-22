# REMED — Gate report (M1–M6 Full Integration)

**Fatias:** REMED-M1 … REMED-M6
**Data (UTC):** 2026-11-22T21:04:19Z
**Repo HEAD (pré-commit WIP):** `53ad05911118408d48f334bf991fb299e7c2d5b2`
**Node:** `v22.15.0`
**Regra:** não inventar N>0 humanos; não fingir Ink TTY live; não esconder falhas; suite completa ≠ só v4*.

---

## 1. Decisão explícita

### **liberar com ressalvas**

| Alternativa | Por que não |
|---|---|
| liberar (sem ressalvas) | Humano **N=0**; Ink TTY journey live **LIMITATION**; wiki pack EvolveLoop ausente |
| bloquear | M1–M6 integrados; `npm test` completo exit 0; remed-m* 57 pass; bench/validate/pytest baratos OK; LIMITATIONs honestas |

**Justificativa:** código + integração + testes automatizados comprovam pause/ProcessSession/Handles/delivery provenance/history/isolamento/restart CLI; ressalvas humanas e TTY permanecem — **não** liberar limpo.

---

## 2. Cobertura M1–M6 (contrato)

| Fatia | Prova | Status |
|---|---|---|
| M1 StateDb / engines ≥22.5 | `remed-m1-statedb-runtime.test.ts`; CI matrix 22+24 | **APROVADO** |
| M2 pause/resume/cancel real | `remed-m2-lifecycle-controls.test.ts`; `lifecycle/run-controls.ts` | **APROVADO** (L-PAUSE-POSIX) |
| M3 Handles + tmux exact bind | `remed-m3-handles-attach.test.ts`; tmux 3.5a | **APROVADO** (L-HANDLES-TTY / L-ZELLIJ) |
| M4 first-run Handles ON/OFF | `remed-m4-first-run-handles.test.ts` | **APROVADO** |
| M5 delivery provenance | `remed-m5-delivery-provenance.test.ts`; L-DELIVERY-ATTEST | **APROVADO** |
| M6 full integration | `remed-m6-full-integration.test.ts` (15) + suite completa | **APROVADO com ressalva TTY** |

---

## 3. Integração comprovada (M6 §6.2)

| Eixo | Como | Resultado |
|---|---|---|
| TUI pause = persistido | `pauseJourneyTask` → `getJourneyPause` (CLI restart sim) | **PASS** |
| ProcessSession + OS | SIGSTOP/SIGCONT/cancel com fence `/proc` | **PASS** (POSIX) |
| Handles OFF / closeViewer≠kill | attach soft-fail; `killed_agent=false` | **PASS** |
| Delivery provenance | local_execution→PASS; attestation→ATTESTED≠PASS; absent→UNVERIFIED | **PASS** |
| History + isolamento | StateDb A≠B; `history list` scoped | **PASS** |
| Compat | Node engines; tmux ON; spaces; narrow; NO_COLOR; Handles OFF | **PASS** |
| PTY barato | `script -q -c 'evolve --help'` | **PASS** (≠ Ink journey) |

---

## 4. Execuções (APPEND — evidência)

### 4.1 Suite completa orchestrator

```bash
git rev-parse HEAD   # 53ad05911118408d48f334bf991fb299e7c2d5b2
node -v              # v22.15.0
cd orchestrator && npm run build   # BUILD_EXIT=0
npm test 2>&1 | tee /tmp/remed-m6-full-test.txt
# FULL_TEST_EXIT=0
# Test Files  252 passed (252)
# Tests       1408 passed | 2 skipped (1410)
```

### 4.2 REMED unit pack

```bash
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/remed-m*.ts
# Test Files  6 passed (6)
# Tests       57 passed (57)
# REMED_SUITE_EXIT=0
```

### 4.3 Bench + CI baratos

| Comando | Exit | Notas |
|---|---:|---|
| `npm run test:bench` | **0** | 18 passed (`bench-budget-nocirc`) |
| `bash docs/architecture/v2.2/scripts/validate-v22-artifacts.sh` | **0** | `=== VERDICT: PASS ===` |
| `python3 scripts/v23/test_readiness.py` | **0** | 15 OK |
| `pytest agent-setup` (venv) | **0** | 11 passed |
| `pytest fixtures/evolveloop-wiki-vault/tests/test_index.py` | **0** | 2 passed |
| `git diff --check` | **0** | clean |

### 4.4 Correcções durante M6 (não escondidas)

| Falha inicial | Causa | Acção |
|---|---|---|
| `v0-cli-grill` esperava `Sessão MSO` | Drift copy V4 → `Session reconhecida` | Assert actualizado (produto Session) |
| `v22-p0-baseline` token golden drift | `tree_sha` golden `0622fcb` vs HEAD `53ad059` (≈1000 paths); tokens `161827`→`217380` (curta B0) | Re-pin `docs/v22/baseline/raw/p0-baseline-report.json` via `V22_P0_WRITE_REPORT=1`; verify exit 0 |

---

## 5. LIMITATIONs (permanecem)

| ID | Nota |
|---|---|
| L-E2E-TTY / Ink journey | Harness PTY cobre `--help`; **não** Home→Grill→Plan→kick→Delivery live |
| L-HUMAN | N=0 usabilidade humana — bloqueia liberar limpo |
| L-ZELLIJ | Binário ausente neste host; nunca OK só por `which` |
| L-WIKI | Pack EvolveLoop `PACK_NOT_FOUND` no vault |
| L-PAUSE-POSIX / L-HANDLES-TTY / L-DELIVERY-ATTEST / L-CREDS / L-NONASCII | Herdados M2–M5 / V4.3 |

---

## 6. Critérios gate (revisão)

| Critério | Resultado |
|---|---|
| Código M1–M5 preservado + integrado | **APROVADO** |
| Testes suite completa | **APROVADO** (1408 pass) |
| Integração §6.2 | **APROVADO** (unit+PTY barato) |
| Compat §6.4 | **APROVADO** com LIMITATIONs |
| Docs APPEND §6.5 | **APROVADO** (este ficheiro + APPEND V4.3) |
| Validação humana N≥1 | **REPROVADO / LIMITATION** N=0 |

---

*MSO TASK REMED-M6 — decisão: liberar com ressalvas*
