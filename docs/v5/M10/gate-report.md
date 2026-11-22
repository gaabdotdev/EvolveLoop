# V5-M10 — Gate report (decisão)

**Data (UTC):** 2026-11-22T22:34:00Z  
**Meta:** Production Readiness / Gates A–J  
**Decisão:** **CONDITIONAL PASS / READY FOR CLOSE** com LIMITATIONs explícitas

---

## Decisão explícita

| Dimensão | Veredicto |
|----------|-----------|
| Gates A–E, G, I | **PASS** com evidência de comando/teste |
| Gate F | **PASS** honesty (ADR-004 + MCP LIMITATION); ACP runtime **BLOCKED**/LIMITATION |
| Gate H | **PASS** projection/evidence; history aggregate opcional **NOT_RUN** |
| Gate J | **PASS** roadmap/docs; UX humano externo **LIMITATION** (N=0) |
| Suite `npm test` | **PASS** — exit 0 — 264 files / 1472 passed / 2 skipped |
| `v5-m*.ts` | **PASS** — 12 files / 64 tests |
| Build `tsc` | **PASS** — exit 0 |

**Não** declarar “produção enterprise sem ressalvas”.  
**Sim** declarar: fatia V5 M01–M10 verificável localmente, com honesty de capability e LIMITATIONs restantes documentadas.

---

## Evidência âncora

| Artefacto | Path / comando | Exit |
|-----------|----------------|------|
| Build | `cd orchestrator && npm run build` → `/tmp/v5-m10-build.txt` | 0 |
| V5 units | `npx vitest run … tests/unit/v5-m*.ts` → `/tmp/v5-m10-v5-tests.txt` | 0 |
| Full suite | `npm test` → `/tmp/v5-m10-full-test.txt` | 0 |
| Integrated scenario | `tests/unit/v5-m10-integrated-scenario.test.ts` | 0 |
| Security notes | `docs/v5/M10/security-assessment.md` | — |
| Compat | `docs/v5/M10/compat-matrix.md` + append V4.3 | — |
| Gates detail | `docs/v5/M10/gates.md` | — |
| `git diff --check` | repo root | 0 |

---

## Fix de regressão incluído (Gate I)

`evolve work status --data-dir` era interceptado pela superfície produto V5 e quebrava `evolve-cli.integration.test.ts`.  
**Fix:** `handleWorkSurface` devolve `handled=false` para `status` quando `--data-dir` está presente → path legado coordinator em `evolve.ts`.

---

## LIMITATIONs que impedem “PASS absoluto”

1. **N=0 humanos** — Gate J UX externo não PASS pleno (`LIMITATION-human-validation.md`)  
2. **Multi-harness live Cursor+Antigravity** não corrido (`LIMITATION-multi-harness.md`)  
3. **ACP server** ausente (F4 BLOCKED)  
4. **MCP invoke host** unsupported (M04)  
5. Studio visual / SDK publish completo (M08/M09)

---

## Recomendação

Aceitar **fecho M10** como production-readiness **slice** do MSO V5: gates A–J evidenciados; falhas não escondidas; LIMITATIONs honestas. Próximos passos fora deste Meta: elevação ACP/MCP só com runtime mediável; validação humana se/quando N>0 real.
