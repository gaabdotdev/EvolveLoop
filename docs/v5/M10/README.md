# V5-M10 — Production Readiness & Gate Closure A–J

**Status:** executed (evidence-bound; honest FAIL/LIMITATION/BLOCKED allowed)  
**Depende de:** M01–M09  
**Tese:** Fechar validation-plan Gates A–J com provas anexadas; cenário integrado fixture-based; sem inventar N>0 humanos nem PASS forjado.

---

## Objectivo

1. Reliability / Security / Compat slices documentados com citações a testes  
2. Cenário integrado (secção 8) com persistência real em workspace temp  
3. Gates A–J com estado `PASS|FAIL|BLOCKED|NOT_RUN` + evidência  
4. Índice `docs/v5/README.md` ligando M00–M10

## Entregas

| Item | Path |
|------|------|
| Security assessment | [security-assessment.md](./security-assessment.md) |
| Compat matrix (append V5) | [compat-matrix.md](./compat-matrix.md) + append em `docs/v4/V4.3/compat-matrix.md` |
| Integrated scenario test | `orchestrator/tests/unit/v5-m10-integrated-scenario.test.ts` |
| Gates A–J | [gates.md](./gates.md) |
| Gate report / decisão | [gate-report.md](./gate-report.md) |
| LIMITATION multi-harness | [LIMITATION-multi-harness.md](./LIMITATION-multi-harness.md) |
| Human validation N=0 | [LIMITATION-human-validation.md](./LIMITATION-human-validation.md) |
| Acceptance evidence | [acceptance-evidence.md](./acceptance-evidence.md) |

## Fluxo do cenário integrado (secção 8)

```text
temp workspace
  → seed model/tool registries + Agent Studio team/workflow
  → open Work + graph
  → Attempt + bind ProcessSession fixture
  → failAttempt → Work IN_PROGRESS
  → replaceAgentPreservingWork → Work preserved
  → policy deny tool + approval(work_id)
  → Delivery local_execution PASS OR UNVERIFIED honesty
  → restart: new PersistentWorkRuntime → read Work from disk
  → export team/workflow/agent sem secrets
```

## Aceitação mínima

- [x] `engines.node >=22.5.0` documentado; build + testes corridos
- [x] security-assessment.md cita deny-default / no secrets export / process fence
- [x] compat matrix V5
- [x] `v5-m10-integrated-scenario.test.ts` (12 passos)
- [x] gates.md + gate-report.md honestos
- [x] N=0 human validation → Gate J UX externo **não** PASS pleno
- [x] docs/v5/README.md index

## Testes

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m*.ts
npm test 2>&1 | tee /tmp/v5-m10-full-test.txt; echo FULL=$?
```

## O que NÃO foi feito / LIMITATION

- Live multi-harness Cursor + Antigravity  
- Validação humana externa (N=0)  
- Visual Studio / full SDK publish (já LIMITATION M08/M09)  
