# V3-TEST-01 — Testes Metamórficos e Diferenciais Multi-Modelo

- **STATUS:** PASS_UNIT
- **task:** M18-V3-TEST-01-METAMORPHIC (tentativa 1/3)
- **critério (plano §5.4):** mesmo Goal Contract com 3 paráfrases equivalentes → estabilidade de decomposição e TRUE-FULL-PASS
- **API:** `runMetamorphicHarness` / `evaluateMetamorphicGate` / `createStubRouter` / `createStubDecomposer`
- **honesty:** stub decomposer + stub router determinísticos — **sem** claim de multi-modelo LLM live
- **PASS_LIVE:** not claimed
- **Vitest:** `npx vitest run tests/unit/v3-test-01-metamorphic.test.ts` EXIT=0 (11/11)
- **Regression QUAL+TEST:** v3-test-01 + v2-qual-01 + v2-qual-02 EXIT=0 (33 passed)
- **Probe:** `host-probe.json`
