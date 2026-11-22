# Integration Strategy — harness vs native; ACP / CLI / MCP / API

**Lei:** estas superfícies **não são equivalentes**. Inventário ≠ mediação ≠ protocolo ≠ produto.

---

## 1. Dois modos de execução

### 1.1 Harness mode

| | |
|--|--|
| **Definição** | Core orquestra um **harness externo** (CLI de agente) via adapter `cli_process` / `jobs_pickup` |
| **Código** | `adapters/drivers/cli-process.ts`; `harness/runtime.ts`; `adapters/catalog.ts` |
| **Default** | Dry-run (escreve prompt package; sem rede) salvo `provider_mode=real` **e** `EVOLVELOOP_HARNESS_CONSENT=true` (`cli-process.ts:1-5`, `96-119`) |
| **Honesty** | `execution_path`: `real_eligible \| dry_run \| probe_only \| blocked` (`harness/runtime.ts:60-71`) |
| **Sessão OS** | `ProcessSessionRecord` com fence `starttime` |
| **Não afirmar** | “agente Cursor completo mediado”; MCP do harness inventariado; cross-provider swap automático (`unsupported`) |

### 1.2 Native mode

| | |
|--|--|
| **Definição** | Execução sob mediação Core (ExecutionRunner, engine capabilities, deterministic providers, sandbox) |
| **Código** | `execution-runner/`; `sandbox/`; `providers/deterministic/`; partes de `engineering/` |
| **Características** | HOME efémero; capability gate; scrubbed shell; evidência de run local pode alimentar Delivery `local_execution` |
| **Não afirmar** | Que native mode “substitui” Claude Code / Cursor Agent; que todo shell do host está mediado |

### 1.3 Comparação (não equivaler)

| Dimensão | Harness mode | Native mode |
|----------|--------------|-------------|
| Quem corre as tools | Processo do harness | Core / runner |
| Mediação FS/shell | Parcial / unsupported no host | Mais forte no engine path |
| Consentimento | `EVOLVELOOP_HARNESS_CONSENT` | Capability / approvals / sandbox |
| Observabilidade | ProcessSession + ficheiros stdio | ExecutionRunnerResult + evidence |
| Replace Agent | Handoff + novo spawn/dry-run | Novo run native; AgentRecord opcional |

---

## 2. Superfícies de integração (quatro eixos)

### 2.1 CLI (produto principal)

- Entrypoint público: `evolve` / `/evolve` (`AGENTS.md`, `evolve.ts`)
- Jornada V4 + grupos avançados (complexidade progressiva)
- **É** a superfície canónica de operador humano

### 2.2 MCP (Model Context Protocol)

| Facto | Evidência |
|-------|-----------|
| Existe como **action de policy** `mcp.invoke` | `security/types.ts`, `profiles.ts` (`require_approval`) |
| Catalog: level **`unknown`** | `adapters/catalog.ts` — “Core does not inventory Cursor MCP sessions” |
| Live harness pode desligar MCP host | `CURSOR_AGENT_NO_MCP=1` em evaluation live |
| Servidor MCP EvolveLoop / bridge de sessão | **GAP** |

**Conclusão:** MCP hoje = host capability + honesty. **Não** é runtime de Agent do Core.

### 2.3 ACP (Agent Client Protocol)

| Facto | Evidência |
|-------|-----------|
| Referências em `orchestrator/` | **0** (GAP-ACP) |
| Equivaler a MCP ou CLI | **Proibido** (ADR-004) |

**Postura blueprint:** ACP, se adoptado, é protocolo **separado** (cliente↔agente estruturado). Requer Meta próprio; não reutilizar nome MCP.

### 2.4 API (programática)

| Facto | Evidência |
|-------|-----------|
| API HTTP pública estável Work/Agent | **GAP** |
| Ports internos (ExecutionRunnerPort, stores) | Existem como módulos TS, não produto API |

**Postura:** API futura consome contratos do Persistent Work Runtime — **depois** do domínio estável (Meta ≥06/09). Não expor JSON legado como “API V5”.

---

## 3. Matriz de não-equivalência

| | CLI | MCP | ACP | API |
|--|-----|-----|-----|-----|
| **CLI** | — | Host tools ≠ comandos evolve | Protocolo ≠ UX terminal | Ports ≠ REST/RPC público |
| **MCP** | — | — | Protocolos diferentes; inventário host ≠ ACP | MCP tool call ≠ API Work |
| **ACP** | — | — | (**GAP**) | ACP session ≠ API resource |
| **API** | — | — | — | (**GAP** produto) |

---

## 4. Model providers (eixo ortogonal)

FreeLLMAPI / Ollama / OpenRouter são **ModelProviders**, não modos harness/native e não MCP/ACP.

- Path: `model-providers/freellmapi.ts` (`provider_id = "freellmapi"`)
- CLI: `evolve freellm catalog|health`
- Ligação a Agent: campos opcionais `provider_id` / `model_id` em `AgentRecord` — **sem** fundir identidades (ADR-002)

---

## 5. Estratégia de evolução (só planeamento)

1. **Congelar honesty** do catalog + Delivery + harness paths (já forte pós-REMED).  
2. **Documentar** cada adapter capability como `full|partial|unsupported|unknown` (já parcialmente feito).  
3. **Não** implementar bridge MCP “completo” só para marketing.  
4. **Avaliar ACP** só após Work/Attempt estáveis — senão ACP fala de entidades erradas.  
5. **API** = thin layer sobre PWR; versionada; sem bypass de provenance.  
6. Manter **CLI-first** (princípio V4.0 #1/#7) como UX principal.

---

## 6. Palavras-chave

`harness mode` · `native mode` · `MCP` · `ACP` · `GAP` · `capability honesty` · `EVOLVELOOP_HARNESS_CONSENT`
