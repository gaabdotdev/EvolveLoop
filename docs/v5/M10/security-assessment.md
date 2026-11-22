# V5-M10 — Security assessment (slice)

**Data (UTC):** 2026-11-22T22:32:00Z  
**Âmbito:** fatias já implementadas em M04/M05/M09 + REMED process fence — **não** pentest completo.  
**Regra:** só claims com testes citados; sem inventar controlos.

---

## 1. Tool deny-by-default (M04 + M05)

| Controlo | Comportamento | Evidência |
|----------|---------------|-----------|
| Assignment allowlist | Sem assignment → `deny` / `no_assignment_deny_default` | `orchestrator/tests/unit/v5-m04-tool-registry.test.ts` (`assignToolsToAgent then agentMayUseTool…`) |
| Policy deny overlays | `deny_tool_ids` em scope `work` bloqueia mesmo com assignment | `v5-m05-governance.test.ts` (`policy deny blocks tool…`); cenário M10 passo 8 |
| Audit | `policy_deny_tool` append-only | idem + `v5-m10-integrated-scenario.test.ts` |

**Honesty:** tools seed (`shell.exec`, `fs.read`) são **stubs** (`implementation=native_stub`, honesty `partial`) — não afirmar sandbox OS completo via Tool Registry.

---

## 2. No secrets in export (M09 + M10)

| Controlo | Comportamento | Evidência |
|----------|---------------|-----------|
| `stripSecrets` | Remove `api_key`, `token`, `password`, … | `v5-m09-agent-studio.test.ts` (`load/save/import/export strips secrets`) |
| Save team/workflow/agent | Persistência limpa secrets | M09 + M10 passo 3 e 12 |
| Model credential refs | Só env var names + boolean presence | `v5-m03-model-provider.test.ts` (`exportCredentialRefs`) |

**Honesty:** strip é por nomes de campo conhecidos (`SECRET_FIELD_NAMES`); secrets em campos custom fora da lista = **GAP residual** (não fingir cobertura total).

---

## 3. Process identity fence (REMED-M2)

| Controlo | Comportamento | Evidência |
|----------|---------------|-----------|
| `sameProcess` / starttime fence | Pause/resume/cancel só no processo owned | `remed-m2-lifecycle-controls.test.ts` (header: *identity fence required*; asserts `sameProcess`) |
| Bad fence reuse | Wrong `starttime` rejected | remed-m2 (fixture `test_bad_fence`) |
| Handles close ≠ kill | `killed_agent=false` | `remed-m3-handles-attach.test.ts` |

**Honesty:** fence depende de `/proc` (POSIX). Hosts sem `/proc` → paths live skipped (`it.skipIf(!POSIX_PROC)` em M02).

---

## 4. Delivery / capability honesty (cross-cutting)

| Controlo | Evidência |
|----------|-----------|
| PASS só `local_execution` exit 0 | `remed-m5-delivery-provenance.test.ts`; `v5-m06-verification.test.ts`; M10 passo 10 |
| Agent claim → UNVERIFIED, nunca PASS | `projectFromAgentClaim` nos testes M06/M10 |

---

## 5. Residual risks (não fechados neste Meta)

| Risco | Estado |
|-------|--------|
| MCP invoke host | LIMITATION M04 — `MCP_INVOKE_UNSUPPORTED` |
| ACP server | LIMITATION M02 — GAP |
| Full OS sandbox / seccomp | Fora de scope Tool Registry stubs |
| Human operator UX validation | N=0 — ver `LIMITATION-human-validation.md` |
| Live multi-harness Cursor+Antigravity | `LIMITATION-multi-harness.md` |

---

## Comandos de re-prova

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m04-tool-registry.test.ts \
  tests/unit/v5-m05-governance.test.ts \
  tests/unit/v5-m09-agent-studio.test.ts \
  tests/unit/remed-m2-lifecycle-controls.test.ts \
  tests/unit/v5-m10-integrated-scenario.test.ts
```
