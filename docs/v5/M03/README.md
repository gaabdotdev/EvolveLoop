# V5-M03 — Model & Provider Freedom

**Status:** implementado (mínimo mas real)  
**Depende de:** M00 (ADR-002), providers existentes (`freellmapi`, `ollama`)  
**Tese:** Agent ≠ Model — registries e routing honestos; sem inventar custos

---

## Objectivo

Separar **Model Registry** / **Provider Registry** do **Agent Registry**, com seleção por escopo, fallback com razões explícitas, ownership harness vs runtime, e usage `measured|estimated|unavailable`.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Tipos | `orchestrator/src/v3/model-registry/types.ts` | Provider/Model records; selection; routing; usage |
| Provider Registry | `provider-registry.ts` | Seed: `freellmapi` (live) + `ollama` (live) + `custom` (stub) |
| Model Registry | `model-store.ts` | JSON `models.json` sob data-dir / `.evolveloop` |
| Seleção | `selection.ts` | `resolveModelSelection` — escopos `workspace` \| `work` |
| Routing | `routing.ts` | `routeWithFallback(policy)` — razões; nunca silencioso |
| Ownership | `ownership.ts` | `execution_model_control`: `harness_owned` \| `runtime_owned` |
| Usage | `usage.ts` | `measured` \| `estimated` \| `unavailable` |
| Custom stub | `custom-stub.ts` | Invoke bloqueado com honesty |
| Paths | `paths.ts` → `modelRegistryDir` | Aditivo |

## Precedência de seleção (documentada)

```text
work  >  workspace
```

1. Se `work_id` tem preferência → usa work.  
2. Senão → workspace.  
3. Senão → erro `NO_PREFERENCE` (não escolhe provider em silêncio).

Razões sempre em `ModelSelectionResolved.reasons`.

## Routing / fallback

- `allow_fallback=false` → fallbacks **não** são tentados; `policy_blocked_silent_fallback=true` + razão explícita.  
- `blocked_provider_ids` → outcome `blocked` (nunca selected).  
- Cada tentativa regista `selected` \| `failed` \| `skipped` \| `blocked`.

## `execution_model_control`

| Integração | Controlo | Implicação |
|------------|----------|------------|
| Adapters harness (`cursor`, `claude-code`, `codex`, `antigravity`) | `harness_owned` | Core **não** força modelo no host |
| ModelProviders (`freellmapi`, `ollama`, `custom`, `openrouter`) | `runtime_owned` | Core pode selecionar/routear |
| Desconhecido | `harness_owned` (fail-closed) | Não inventar controlo runtime |

## Usage honesty

| Provenance | Significado |
|------------|-------------|
| `measured` | Valor reportado/medido pela fonte |
| `estimated` | Número presente sem claim measured |
| `unavailable` | Sem inventar — tokens/cost null |

Mapeamento legado: `CostProvenance.reported` → `measured`; `UNAVAILABLE` → `unavailable`.

## Aceitação mínima

- [x] Model Registry ≠ Agent Registry (kinds + paths)
- [x] Provider Registry: freellmapi + ollama + custom stub honest
- [x] `resolveModelSelection` work > workspace + razões
- [x] `routeWithFallback` com policy; sem fallback silencioso
- [x] `execution_model_control` harness_owned \| runtime_owned
- [x] Usage `measured|estimated|unavailable` sem inventar custos
- [x] Provider down ≠ Work FAIL
- [x] Sem PASS forjado

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m03*.ts
```

Evidência: [acceptance-evidence.md](./acceptance-evidence.md)

## O que NÃO foi feito (propositadamente)

- Rewrite StateDb / unificar secrets files  
- Forçar model control em adapters harness  
- Agent Studio / SDK / ACP  
- Inventar benchmarks ou custos USD  
- Declarar TRUE_FULL_PASS sem critérios
