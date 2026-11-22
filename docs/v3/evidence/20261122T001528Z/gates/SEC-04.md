# V3-SEC-04 — Red-Teaming Contínuo Automatizado

- **STATUS:** PASS_SIMULATED
- **task:** M16-V3-SEC-04-REDTEAM (tentativa 1/3)
- **bypass_rate:** 0 (reported; 28/28 attack cases blocked)
- **zero_bypass:** true
- **catalog:** 31 cases (14 sandbox + 9 SSRF + 8 DLP; inclui 3 negativos benignos)
- **schedule:** `scheduleContinuous` interval default 60_000 ms; timers/`now_ms` injetáveis (determinístico em teste)
- **safety:** synthetic payloads / in-process oracles only — no live network, no attacks outside workspace
- **PASS_LIVE:** not claimed — continuous red-team validates control oracles; not a live adversary campaign
- **Vitest:** `npx vitest run tests/unit/v3-sec-04-redteam.test.ts` EXIT=0 (9/9)
- **Regression SEC:** v3-04 + v3-03 + v3-02 + v3-01 + v2-02 + v1-02 EXIT=0 (85 passed)
- **Probe:** `host-probe.json`
