# AUD-UX-03 — Matriz Agente × Modelo × Protocolo

**Status:** PASS  
**UTC:** 2026-11-22T02:28:30Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 2/3

## Escopo

Live: FreeLLMAPI + Ollama (embed+infer) + ≥2 adapters reais; modelo solicitado vs servido.

## Achados

| Componente | Estado | Prova |
|------------|--------|-------|
| FreeLLMAPI `:3001` | **401 INFRA/UNAVAILABLE** | `AUD-UX-03-freellmapi.json` / matrix; curl_exit=0 HTTP=401 |
| Ollama embeddings | **LIVE** exit=0 HTTP=200 dims=768 | `AUD-UX-03-ollama-embed.json` — `nomic-embed-text:latest` |
| Ollama inference | **LIVE** exit=0 HTTP=200 done=true | `AUD-UX-03-ollama-generate.json` — requested/served `bonsai-64k:latest` |
| cursor-agent | **LIVE** exit=0 | model requested `composer-2.5` → result `PONG`; `AUD-UX-03-cursor-agent.json` |
| agy (antigravity) | **LIVE** exit=0 | model requested `gemini-3.8-flash-low` (válido; **não** `auto:fast`) → `PONG`; `AUD-UX-03-agy.json` |

## Modelo solicitado vs servido

| Adapter | Requested | Served | Nota |
|---------|-----------|--------|------|
| Ollama embed | `nomic-embed-text:latest` | `nomic-embed-text:latest` | response body |
| Ollama generate | `bonsai-64k:latest` | `bonsai-64k:latest` | `model` field |
| cursor-agent | `composer-2.5` | `composer-2.5` | payload sem campo model; exit 0 + `--model` válido |
| agy | `gemini-3.8-flash-low` | `gemini-3.8-flash-low` | payload sem campo model; `agy models` lista válido |

Matriz: `AUD-UX-03-matrix.json`

## Veredito

**PASS** — Ollama live (embed+infer) + 2 adapters live (cursor-agent + agy) + FreeLLMAPI honesto **UNAVAILABLE** (401 needsKey).
