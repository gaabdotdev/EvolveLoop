# V1-GATE-COMPAT Evidence

- ts: 20261121T210133Z
- goal: V1-GATE-COMPAT (attempt 1/3)
- evidence_dir: /home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v1/evidence/gate-compat-20261121T210133Z
- vitest_exit: 0

## Verdict

**V1-GATE-COMPAT_PASS**

```json
{
  "kind": "V1GateCompatVerdict",
  "pass": true,
  "label": "V1-GATE-COMPAT_PASS",
  "reasons": [
    "OK_MATRIX_AND_FAULT_INJECTION"
  ],
  "vitest_exit": 0,
  "live_probe": {
    "base_url": "http://localhost:3001/v1",
    "state": "needsKey",
    "message": "catalog HTTP 401",
    "models_count": 0,
    "honest": true,
    "invented_ready": false
  },
  "agents": [
    "cursor",
    "antigravity"
  ],
  "protocols": [
    "openai_compatible",
    "anthropic",
    "responses",
    "gemini"
  ],
  "models": [
    "bonsai-64k:latest",
    "openrouter/auto-cheap",
    "openrouter/frontier"
  ],
  "matrix_cells": 24,
  "fault_injection": [
    {
      "label": "http_429",
      "fault_kind": "http_429",
      "bucket": "INFRA_QUOTA",
      "burns_task_attempt": false,
      "cooldown_ms": 10000,
      "fallback_recommended": true,
      "circuit_attempts_after": 0,
      "ok": true
    },
    {
      "label": "timeout_mid_stream",
      "fault_kind": "timeout_mid_stream",
      "bucket": "INFRA_QUOTA",
      "burns_task_attempt": false,
      "cooldown_ms": 5000,
      "fallback_recommended": true,
      "circuit_attempts_after": 0,
      "ok": true
    },
    {
      "label": "truncated_json",
      "fault_kind": "truncated_json",
      "bucket": "INFRA_QUOTA",
      "burns_task_attempt": false,
      "cooldown_ms": 5000,
      "fallback_recommended": true,
      "circuit_attempts_after": 0,
      "ok": true
    },
    {
      "label": "unreachable",
      "fault_kind": "unreachable",
      "bucket": "INFRA_QUOTA",
      "burns_task_attempt": false,
      "cooldown_ms": 5000,
      "fallback_recommended": true,
      "circuit_attempts_after": 0,
      "ok": true
    }
  ],
  "ts": "20261121T210133Z",
  "evidence_dir": "/home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v1/evidence/gate-compat-20261121T210133Z"
}
```

## Live FreeLLMAPI probe (`http://localhost:3001/v1`)

| field | value |
|-------|-------|
| state | `needsKey` |
| message | catalog HTTP 401 |
| models_count | 0 |
| invented_ready | false |

Honesty: live probe may be UNAVAILABLE / needsKey — never rewritten to ready.

## Matrix Agente × Modelo × Protocolo

| Agent | Model | Protocol | Status |
|-------|-------|----------|--------|
| cursor | bonsai-64k:latest | openai_compatible | enumerated |
| cursor | openrouter/auto-cheap | openai_compatible | enumerated |
| cursor | openrouter/frontier | openai_compatible | enumerated |
| cursor | bonsai-64k:latest | anthropic | enumerated |
| cursor | openrouter/auto-cheap | anthropic | enumerated |
| cursor | openrouter/frontier | anthropic | enumerated |
| cursor | bonsai-64k:latest | responses | enumerated |
| cursor | openrouter/auto-cheap | responses | enumerated |
| cursor | openrouter/frontier | responses | enumerated |
| cursor | bonsai-64k:latest | gemini | enumerated |
| cursor | openrouter/auto-cheap | gemini | enumerated |
| cursor | openrouter/frontier | gemini | enumerated |
| antigravity | bonsai-64k:latest | openai_compatible | enumerated |
| antigravity | openrouter/auto-cheap | openai_compatible | enumerated |
| antigravity | openrouter/frontier | openai_compatible | enumerated |
| antigravity | bonsai-64k:latest | anthropic | enumerated |
| antigravity | openrouter/auto-cheap | anthropic | enumerated |
| antigravity | openrouter/frontier | anthropic | enumerated |
| antigravity | bonsai-64k:latest | responses | enumerated |
| antigravity | openrouter/auto-cheap | responses | enumerated |
| antigravity | openrouter/frontier | responses | enumerated |
| antigravity | bonsai-64k:latest | gemini | enumerated |
| antigravity | openrouter/auto-cheap | gemini | enumerated |
| antigravity | openrouter/frontier | gemini | enumerated |

Cells: **24**

## Fault injection

| case | bucket | burns_attempt | cooldown_ms | fallback | ok |
|------|--------|---------------|-------------|----------|----|
| http_429 | INFRA_QUOTA | false | 10000 | true | true |
| timeout_mid_stream | INFRA_QUOTA | false | 5000 | true | true |
| truncated_json | INFRA_QUOTA | false | 5000 | true | true |
| unreachable | INFRA_QUOTA | false | 5000 | true | true |

## Adapters

- real adapters: cursor, antigravity (≥2 required: cursor + antigravity)
- protocols: openai_compatible, anthropic, responses, gemini
