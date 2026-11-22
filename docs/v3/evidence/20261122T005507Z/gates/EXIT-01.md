# V3-EXIT-01 — Cinco tetos (M21)

- **ts:** 20261122T005507Z
- **task:** M21-M22-M23-V3-EXIT-AUDIT (tentativa 1/3)
- **gate:** V3-EXIT-01
- **vitest_regressão:** `npx vitest run tests/unit/v3-*.test.ts` → exit **0** (20 files / 207 tests) — `../vitest-v3-unit.txt`

## Tabela dos 5 tetos

| Teto | Fonte exigida | Verdict | Evidence path(s) | Honesty |
|------|---------------|---------|------------------|---------|
| Tokens | V1 | **PASS** | `docs/v1/evidence/latest` → `docs/v1/evidence/gate-tok-20261121T210140Z/SUMMARY.md` (`V1-GATE-TOK_PASS_75.54pct`) | estimated chars/4 (documentado no SUMMARY V1) |
| Memória | V3 desta sessão | **PASS** | MEM-01..07: `docs/v3/evidence/20261121T225051Z` … `20261121T232426Z` (canónicos: MEM-01 `225051Z`, MEM-02 `225535Z`, MEM-03 `230044Z`, MEM-04 `230709Z`, MEM-05 `231215Z`, MEM-06 `231709Z`, MEM-07 `232426Z`) | todos STATUS **PASS**; vitest exits 0 |
| Orquestração | V3 desta sessão | **PASS** | ORCH-01..05: `20261121T233047Z`, `233641Z`, `234036Z`, `234517Z`, `235036Z` | todos STATUS **PASS**; vitest exits 0 |
| Segurança | V3 desta sessão | **PASS** | SEC-01..04: `20261121T235713Z` (SEC-01), `20261122T000323Z` (SEC-02), `20261122T000945Z` (SEC-03), `20261122T001528Z` (SEC-04) | SEC-01/03/04 = **PASS_SIMULATED** onde host não tem Firecracker/eBPF live; SEC-02 = **PASS**; evidência unitária reproduzível |
| Testes | V3 desta sessão | **PASS** | TEST-01 `20261122T002551Z`, TEST-02 `20261122T003424Z` | **PASS_UNIT**; metamorphic + DST ≥10k |

## Inventário compacto (meta → evidence_dir → exit)

Ver `../raw/inventory-meta-map.tsv`.

## Critério de fecho

Todos os 5 tetos **PASS** com paths auditáveis e regressão V3 unit exit 0 nesta pasta.

## STATUS

**PASS**
