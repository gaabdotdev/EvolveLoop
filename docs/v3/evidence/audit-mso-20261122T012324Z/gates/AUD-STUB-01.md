# AUD-STUB-01 — Auditoria de Fallbacks Silenciosos em Segurança

**Status:** PASS  
**UTC:** 2026-11-22T01:38:23Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 2/3

## Escopo

Inspecionar ExecutionRunner, sandbox (bwrap/Landlock), Credential Proxy e cgroups v2.
Garantir que nenhum caminho degrada silenciosamente para spawn host sem aviso explícito e bloqueio de política.

## Wiki grounding

- Scout: silent fallback / sandbox / fail-closed → hits fora de EvolveLoop (OrbitBot/Kernel).
- **GAP:** contratos AUD-STUB-01 não estavam sintetizados na wiki; classificação baseada no código verificado neste repo.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `orchestrator/src/v3/execution-runner/runner.ts:70-100` (`resolveOsSandboxSpawn`) | **SILENT_FALLBACK → FIXED** | Antes: `os_sandbox === true` degradava para `argv` host com `gaps` mas **sem** `blocked`. Agora: qualquer `os_sandbox` truthy + plan unavailable → `status: blocked`, `code: OS_SANDBOX_UNAVAILABLE`, `stderr` explícito, `limitations` inclui `silent_host_fallback_forbidden`. |
| A2 | `orchestrator/src/v3/execution-runner/runner.ts` (`runSync`) | **SILENT_FALLBACK → FIXED** | Antes: `runSync` ignorava `os_sandbox` e fazia `spawnSync` host. Agora: chama `resolveOsSandboxSpawn`; bloqueia ou executa sob bwrap. |
| A3 | `orchestrator/src/v3/execution-runner/types.ts:39-44` | **OK** (doc atualizada) | Contrato documenta fail-closed; soft host fallback removido. |
| B1 | `orchestrator/src/v3/sandbox/bwrap-wrapper.ts:55-176` | **OK** | Planner puro; `available:false` + `gaps` explícitos; sem spawn. |
| B2 | `orchestrator/src/v3/sandbox/backends/bubblewrap.ts:205-258` | **OK** | Indisponível / setup fail → `blocked: true` + `block_reason`; sem host fallback. |
| B3 | `orchestrator/src/v3/sandbox/manager.ts:33-85` | **OK** | Fail-closed; `sandbox_required_unavailable_no_host_fallback`. |
| B4 | `orchestrator/src/v3/sandbox/backends/unavailable.ts:21-37` | **OK** | Sempre `blocked`; nota proíbe silent host fallback. |
| C1 | `orchestrator/src/v3/sandbox/landlock.ts:59-83` | **STUB** | `enforceable: false` + gap `no_nodejs_landlock_binding`; enforcement real via bwrap (documentado). Não é spawn host silencioso. |
| D1 | `orchestrator/src/v3/sandbox/cgroup-v2.ts:179-204` | **PARCIAL** | Sem perms → `mocked: true` + `reason: mock_fallback_*` + `gaps`. Não degrada para spawn; callers devem ler `mocked`/`gaps`. Sem flag `require_live` neste módulo (fora do escopo de spawn). |
| E1 | `orchestrator/src/v3/security/credential-proxy.ts:172-233`, `478-603` | **OK** | Fail-closed (SSRF / deny-by-default / DLP). `catch` em parse → blocked/throw; sem bypass de política. |

### try/catch revisados (não-SILENT para isolamento)

| Local | Classificação | Motivo |
|-------|---------------|--------|
| `runner.ts` `safeRealpath` / cleanup `rmSync` / kill best-effort | **OK** | Path resolve / cleanup / signal — não alteram isolamento OS. |
| `bubblewrap.ts` / `bwrap-wrapper.ts` `safeRealpath`/`isDir` | **OK** | Probes FS locais. |
| `cgroup-v2.ts` probes write | **OK** / **PARCIAL** | Falha → gaps/`mocked`, não host spawn. |
| `credential-proxy.ts:136` / `515` | **OK** | Invalid URL → error/blocked. |

## Correção aplicada

1. **Fail-closed unificado** em `resolveOsSandboxSpawn`: `true` e `"require"` bloqueiam se bwrap/plan indisponível.
2. **`runSync`** passa pelo mesmo planner; sem skip silencioso de `os_sandbox`.
3. Testes AUD-STUB-01 em `v1-sec-01-bwrap-wrapper.test.ts`.

## Testes

Arquivo: `gates/AUD-STUB-01-tests.txt`

```
Test Files  8 passed (8)
Tests       91 passed | 1 skipped (92)
EXIT_CODE=0
```

Suites: `v1-sec-01`, `v1-sec-02`, `v1-sec-03`, `v2-sec-02`, `v3-sec-01`, `v3-sec-02`, `v0-execution-runner`, `v35-security`.

## Diffstat

Ver `gates/AUD-STUB-01-diffstat.txt`.

## Veredito

- SILENT_FALLBACK de spawn host removidos nos módulos ExecutionRunner.
- SandboxManager / Bubblewrap / Credential Proxy já fail-closed.
- Landlock permanece STUB honesto (enforcement via bwrap).
- cgroup mock permanece PARCIAL (explícito; não é spawn).

**PASS** — critérios da meta satisfeitos para o escopo de spawn/isolamento OS.
