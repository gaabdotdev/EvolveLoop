# Relatório final — seção 9

| Campo | Valor |
|-------|-------|
| **task_id** | V22-GAP-P0-2 |
| **Norma** | `docs/v22/GOALS-OFFICIAL.md` seções 8 e 9 |
| **HEAD deste clone** | `51e5bed` (`51e5bed67a96d8b10597602f938c74df9a6fe75c`) |
| **Base da release (citação histórica)** | `f611780` (merge do PR #19) |
| **Commit ausente neste clone** | `9ac0e84` |
| **tree_sha medido da baseline** | `76cc11e6cf4eed30f6c6be68cc599eff8a7df88a` |
| **Baseline citada** | `docs/v22/baseline/raw/p0-baseline-report.json` |
| **Handoff citado** | `docs/v22/baseline/raw/p0-handoff-report.json` |
| **Auditoria antiga** | `docs/v22/TRACEABILITY-AUDIT.md` contra `7ca568f`. Não foi reescrita |

`ENTREGUE_CI` em `docs/architecture/v2.2/CONSOLIDATION-REPORT.md` é vocabulário interno de CI verde. Não é `PASS`. O `tree_sha` lido em `docs/v22/baseline/raw/p0-baseline-report.json` é `76cc11e6cf4eed30f6c6be68cc599eff8a7df88a`. É o SHA medido nessa corrida. O HEAD deste clone é `51e5bed`. `f611780` permanece a citação histórica da base da release. `9ac0e84` está ausente neste clone. Os outros números de tokens da baseline e do handoff ficam nos JSON. As frações de `quality_checks` abaixo foram lidas nesse baseline, nas três repetições de cada braço.

`memory/v22-close-100/evidence/explore-live-runs.json`, campo `live_not_in_final_report`, cita dois paths que este relatório ainda não usa para fechar saída, cache ou custo:

- `docs/internal/historical/evals/docs-evals/experiments/V22-BENCH/raw/battery-held-out-official-hybrid/`
- `docs/internal/historical/evals/docs-evals/experiments/V22-BENCH/raw/battery-held-out-real-engine/OFFICIAL-STATUS.json`

O directório híbrido está no tree. Nenhum número desses JSON entra aqui.

`OFFICIAL-STATUS.json` foi lido por inteiro. Não contém `output_tokens`, `cache_read_tokens`, `cache_write_tokens` nem `cost`. O campo `retrieval_mode_declared` é `bm25_degraded (Ollama unavailable — ADR-0005)`. O campo `index_mode` é `full_index_ollama`. Esse ficheiro não fecha saída, cache nem custo.

GOAL-001, GOAL-003 e GOAL-004 ficam `PASS` nos critérios que a norma fecha com a evidência já no tree. Não há `PASS` global dos objetivos 001–006. O que mudou desde a auditoria de `7ca568f` é a baseline P0 (entrada determinística das seis tarefas) e a medição de handoff P0-5. O JSON determinístico mantém `output_tokens`, cache e `cost` em `NOT_MEASURED` e o `model_id` `deterministic-provider`. A corrida generativa é outra, em `memory/v22-close-100/evidence/openrouter-usage.json`. `product_percent_gate` continua `NOT_MEASURED`.

## Quality checks da baseline

Fonte: `docs/v22/baseline/raw/p0-baseline-report.json`. Em cada linha, as repetições 1, 2 e 3 de cada braço repetem a mesma fração.

| Tarefa | B0 | V2.2 | Agregado lido |
|--------|----|------|----------------|
| `curta` | 1/1 | 1/1 | `quality_b0` 1, `quality_v22` 1 |
| `retomada` | 2/2 | 2/2 | `quality_b0` 1, `quality_v22` 1 |
| `fontes_conflitantes` | 2/3 | 3/3 | `quality_b0` 0.6666666666666666, `quality_v22` 1 |
| `projeto_grande` | 0/1 | 1/1 | `quality_b0` 0, `quality_v22` 1 |
| `delegada` | 0/2 | 2/2 | `quality_b0` 0, `quality_v22` 1 |

`fontes_conflitantes`: 2/3 no B0 é o `quality_b0` 0.6666666666666666; 3/3 no V2.2 é o `quality_v22` 1. Em `projeto_grande` e `delegada`, o `quality_v22` 1 é o agregado do braço V2.2 (1/1 e 2/2). O B0 dessas duas tarefas fica 0/1 e 0/2.

## GOAL-001 — contexto persistente e recuperação

Estado: **`PASS`**.

`memory/v22-close-100/goal001-options.md` continua sem opção marcada. Isso não reabre os critérios da seção 2.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Working context persistente ou contrato que o declara descartável | `PASS` | `docs/adr/0013-context-ownership-working-context.md`: o working context é efémero e, após a resposta, descartável. A retomada lê checkpoint, memory da feature e páginas `.ai/` com `status: atual` (perguntas 1, 5 e 6). Teste `orchestrator/tests/unit/context-ownership.test.ts` | — |
| Recuperação entre processos e checkpoint adulterado | `PASS` | `orchestrator/tests/integration/v22-session-continuity.integration.test.ts` retoma noutro processo e rejeita checkpoint adulterado | Não recupera o prompt bruto |
| Memória episódica | `PASS` | `profiles/default.yaml` `memory.enabled: false`. Desligada, isto não é recuperação episódica | — |

## GOAL-002 — redução mensurável de tokens face a V2

Estado: **`LIMITED`**. A auditoria em `7ca568f` dizia `NOT_MEASURED` porque as seis tarefas não existiam. A baseline P0 mediu a entrada. Isso não fecha saída, cache, custo nem a frase de produto.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Entrada, dois braços, mesmo verificador, seis tarefas | `PASS` | JSON da baseline. B0 = leitura `rg` até 45 paths. V2.2 = pickup com budget 22000. Tokenizer `tiktoken:cl100k_base`. `n=3`. Dispersão de entrada 0, declarada `zero_expected_deterministic` | Não é modelo generativo |
| Economia de entrada | `PASS` | Seção 5.3: só conta quando a qualidade V2.2 ≥ B0. O JSON traz `deterministic_context_savings_status` por tarefa | Não autoriza percentual de produto |
| Saída | `NOT_MEASURED` | Campo `output_tokens` no JSON da baseline, nos dois braços, valor `NOT_MEASURED` | Este JSON determinístico não muda. A saída generativa está na corrida OpenRouter, à parte |
| Cache de leitura e de escrita | `NOT_MEASURED` | Campos `cache_read_tokens` e `cache_write_tokens` no JSON, valor `NOT_MEASURED` | Este JSON determinístico não muda. O cache devolvido pelo OpenRouter está na corrida à parte e não é o experimento TD-13 |
| Custo | `NOT_MEASURED` | Campo `cost` no JSON, valor `NOT_MEASURED` | O provedor determinístico não devolve moeda. O custo da corrida OpenRouter está à parte |
| Latência | `LIMITED` | `latency_ms` da baseline é tempo de parede do retrieval, estado `LIMITED` | Não é a latência da API do modelo. `model_latency_ms` deste JSON continua `NOT_MEASURED`. A latência da API está na corrida OpenRouter |
| Releituras | `PASS` | `reread_count` 0 nos dois braços, dispersão 0 | Contagem determinística, não de sessão de modelo |
| Restrições sob compactação | `UNAVAILABLE` | Corrida default: `orchestrator/src/context/compaction-contract.ts` com `status` `NOT_IMPLEMENTED` e `reinject_allowed: false`. `EVOLVELOOP_COMPACTION` ausente. Seções 3.5 e 5.2 da norma | P0-6, com a flag ligada, é outra corrida em `docs/v22/baseline/raw/p0-compaction-report.json`. A flag não foi ligada neste ciclo |
| Frase «a V2.2 gasta menos tokens» | `NOT_MEASURED` | `product_percent_gate` no JSON determinístico e na corrida OpenRouter, que não publica esse campo | §3.4 e §5.3. A qualidade das respostas do modelo não foi pontuada. Dono: utilizador. Nenhum teste vira percentual em critério de falha |

### Corrida generativa OpenRouter

Ficheiro canónico: `memory/v22-close-100/evidence/openrouter-usage.json`. Não substitui o JSON da baseline nem o `model_id` `deterministic-provider`. Não preenche `docs/v22/baseline/raw/p0-handoff-report.json`: os prompts são os assemblers do harness B0 e V2.2 das seis tarefas, fora do repositório e não versionados. Não é um transcript novo de handoff.

60 chamadas, todas HTTP 200. `error` null em cada chamada. `stopped` null. `retries_429` 0. `n_requested` 5. `max_tokens` 1024. `model_requested` e `model_ids_returned`: `google/gemini-2.5-flash-lite`. `tree_sha` `51e5bed67a96d8b10597602f938c74df9a6fe75c`. `secret_in_tree` false. `ceiling_usd` 2.5. `stop_at_usd` 2.3. `spent_for_stop_usd` 0.07868716. A soma de `cost` das 60 chamadas é o mesmo 0.07868716. `cache_write_tokens` medido 0 em todas as chamadas, não ausente.

A corrida anterior `max_tokens` 64 está em `memory/v22-close-100/evidence/openrouter-usage-cap64.json` (`spent_for_stop_usd` 0.09684043999999996, 60 chamadas). O campo `prior_capped_run_usd` deste ficheiro é 0.09684044. Essa corrida não substitui esta.

`output_tokens_at_or_above_1000` conta censura do teto. No B0 esse contador é 5, 4, 5, 5, 5 e 5 nas seis tarefas (29 de 30). A média de saída B0 é um piso, não o comprimento real. Entrada, saída e cache não se somam. O `summary` não publica média de entrada; cada chamada tem `prompt_tokens_reported`, e este texto não calcula essa média.

Dispersão é o campo `*_dispersion` do `summary` (desvio-padrão amostral já gravado). Médias por grandeza, separadas:

| Tarefa | Braço | n | saída média | saída dispersão | saída ≥1000 | cache leitura média | cache leitura dispersão | cache escrita média | custo médio | custo dispersão | latência API média (ms) | latência API dispersão |
|--------|-------|---|-------------|-----------------|-------------|---------------------|-------------------------|---------------------|-------------|-----------------|-------------------------|------------------------|
| curta | B0 | 5 | 1018.2 | 3.3466401061363023 | 5 | 172024.0 | 0.0 | 0.0 | 0.00219842 | 1.3386560424545081e-06 | 4598.557286200048 | 195.72061130893042 |
| curta | V2.2 | 5 | 479.8 | 369.00230351584526 | 1 | 25592.0 | 0.0 | 0.0 | 0.0005244399999999999 | 0.00014760092140633812 | 2103.7288036000973 | 749.4009476807554 |
| projeto_grande | B0 | 5 | 843.2 | 405.40189935420875 | 4 | 86008.0 | 0.0 | 0.0 | 0.00153646 | 0.00016216075974168347 | 4325.343693799914 | 1359.3267570732228 |
| projeto_grande | V2.2 | 5 | 526.4 | 301.90528316013285 | 0 | 24568.0 | 0.0 | 0.0 | 0.00047434 | 0.00012076211326405313 | 2039.7634293998635 | 509.95548097295983 |
| retomada | B0 | 5 | 1021.8 | 6.418722614352485 | 5 | 30304.0 | 16940.450997538406 | 0.0 | 0.00149916 | 0.0015224498310289242 | 3253.79473780049 | 370.07437107715936 |
| retomada | V2.2 | 5 | 999.4 | 51.80057914734159 | 4 | 20473.6 | 11445.090336034924 | 0.0 | 0.001122236 | 0.001036196182814818 | 4071.548228800202 | 560.1332168560266 |
| delegada | B0 | 5 | 1021.4 | 2.1908902300206643 | 5 | 94200.0 | 0.0 | 0.0 | 0.00159136 | 8.763560920082227e-07 | 3729.5439600002283 | 310.1121509603949 |
| delegada | V2.2 | 5 | 526.8 | 180.96049292594228 | 0 | 18835.2 | 10529.19689245101 | 0.0 | 0.000958752 | 0.0009931695518490284 | 2294.334648400036 | 441.6832694396878 |
| fontes_conflitantes | B0 | 5 | 1024.4 | 2.6076809620810595 | 5 | 41772.8 | 23351.705102625805 | 0.0 | 0.001974108 | 0.0021020114584654388 | 3865.9357021997494 | 423.24585824566356 |
| fontes_conflitantes | V2.2 | 5 | 998.4 | 34.00441147851261 | 4 | 19654.4 | 10987.143614242967 | 0.0 | 0.001157564 | 0.0009753384075693933 | 3522.050554999987 | 188.99766719466143 |
| restricoes_compactacao_handoff | B0 | 5 | 1018.8 | 3.420526275297414 | 5 | 44230.4 | 24725.545268001675 | 0.0 | 0.001958784 | 0.002224673307719585 | 3374.147577799704 | 276.0295794371104 |
| restricoes_compactacao_handoff | V2.2 | 5 | 295.8 | 214.12426298763995 | 0 | 17196.8 | 9613.303448867096 | 0.0 | 0.000741808 | 0.0008796467083551215 | 1686.1657731999003 | 624.6330262933731 |

| Grandeza desta corrida | Estado | Ponteiro |
|------------------------|--------|----------|
| `output_tokens` | `LIMITED` | `summary[].arms.*.output_tokens_mean`. O B0 é piso por censura do teto |
| `cache_read_tokens` | `PASS` | `cache_read_tokens_mean`. Uso devolvido pelo OpenRouter neste modelo. Não é o experimento TD-13 |
| `cache_write_tokens` | `PASS` | `cache_write_tokens_mean` 0.0 e `cache_write_tokens_dispersion` 0.0 em todos os braços. Medido, não ausente. Não é o experimento TD-13 |
| `cost` | `PASS` | `cost_mean` e `spent_for_stop_usd` 0.07868716. Tarifa não estimada |
| Latência da API do modelo | `PASS` | `latency_ms_mean`. Não substitui a linha `LIMITED` da latência de retrieval da baseline |
| `product_percent_gate` | `NOT_MEASURED` | Campo ausente neste JSON. Dono: utilizador |
| Qualidade das respostas | `NOT_MEASURED` | Não pontuada. §5.3 não conta a diferença de saída como economia |

Híbrido Ollama: `NOT_MEASURED`. Decisão `nao_tomada`. Classe do braço V2.2 da baseline: `PROJECT_WIKI_PICKUP_BUDGET`, não `OFFICIAL_WIKI_GROUND`. Esta corrida não mede Ollama. Dono: utilizador.

## GOAL-003 — integridade, proveniência, obsolescência e conflito

Estado: **`PASS`**.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Item sem proveniência não entra | `PASS` | `orchestrator/tests/unit/knowledge/truth-source-fence.test.ts` | Host Cursor fora do contrato testado |
| Página obsoleta não é injetada | `PASS` | O mesmo teste | — |
| Conflito código vs wiki na cerca | `PASS` | O mesmo teste, código prevalece | — |
| Isolamento entre projetos | `PASS` | O mesmo teste, canário não cruza raiz | Fixture de unidade |
| Índice marca fonte stale | `PASS` | `test_stale_after_source_change` em `fixtures/evolveloop-wiki-vault/tests/test_index.py` exige hit com `source.stale` depois da mutação da fonte. `memory/v22-close-100/evidence/gate.testing.json`: 2/2, exit 0, no venv `/tmp/v22-close-100-venv`. O passo `pytest wiki index` está no working tree de `.github/workflows/ci.yml` e não numa corrida do GitHub | — |
| Fontes conflitantes com repetição | `PASS` | Cartão `fontes_conflitantes` em `docs/v22/baseline/raw/p0-baseline-report.json`. `n=3` nos dois braços. Dispersão medida de `input_tokens`: `sample_stddev` 0, status `PASS`. Dispersão de `reread_count`: 0, status `PASS`. `latency_ms` tem dispersão com status `PASS`. `quality_checks`: B0 2/3 e V2.2 3/3 nas três repetições | Nesse JSON determinístico, tokens de modelo, `output_tokens`, cache e custo continuam `NOT_MEASURED`. A corrida OpenRouter publica essas grandezas à parte e não altera este cartão |

## GOAL-004 — handoff medido

Estado: **`PASS`** na seção 5.1. A corrida não teve modelo generativo (`model_id` `deterministic-provider`). Publica entrada (`reference_tokens` 1773 e `transferred_tokens` 2180, ambos `PASS`), restrições (`payload_present` true e `missing` vazio nas três repetições), `n=3` e dispersão de `transferred_tokens` 0 (`status` `PASS`). `output_tokens` não é exigido e permanece `NOT_MEASURED`. O `volume_ratio_status` `LIMITED` é observação, não gate.

O rácio 26,91 do P0-5 saía de `2180 / 81`. O denominador era o checklist `required_resume_payload`, uma sonda de sobrevivência. O método de referência passa a ser o dump dos stores do emissor. O pickup medido fica acima desse dump porque a montagem acrescenta chrome. O runtime não tem uma transcrição de chat fora desses stores.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Restrições sobrevivem no pickup | `PASS` | `orchestrator/tests/integration/context-budget-pickup.test.ts` e o payload de `p0-handoff-report.json` | — |
| Volume transferido vs referência | `LIMITED` | `reference_kind` `sender_complete_context`: briefing, DoD, restrições, decisões, próximo passo, grafo, conhecimento recuperado e evidência do emissor, sem `saved_at`. `transferred_tokens` é o pickup normalizado. `n=3`. O rácio 26,91 do P0-5 dividia o pickup por um checklist de 81 tokens (`required_resume_payload`). Esse checklist continua em `fidelity_checklist_tokens` e não é o denominador. `volume_ratio_status` = `LIMITED` (observação, não gate) | Observação. Não segura a seção 5.1 |
| Retomada pelo agente receptor | `PASS` | O receptor faz `loadSessionContinuity` e `applySessionContinuityToMemory` e recupera `run_id`, `node_id` e a decisão. O teste é `orchestrator/tests/unit/v22-p0-handoff.test.ts` | Um handoff, não todos os papéis |
| Saída, cache, custo | `NOT_MEASURED` | `output_tokens`, `cache_read_tokens`, `cache_write_tokens` e `cost` em `docs/v22/baseline/raw/p0-handoff-report.json` | A corrida OpenRouter enviou os prompts do harness das seis tarefas, não um transcript novo de handoff. Estes campos do handoff não foram preenchidos. Dono: utilizador |
| Compactação no handoff | `UNAVAILABLE` | `p0-handoff-report.json`: `compaction` `UNAVAILABLE`. `EVOLVELOOP_COMPACTION` ausente. `compaction-contract.ts`: `NOT_IMPLEMENTED`, `reinject_allowed: false` | P0-6 é outra corrida e não altera este default |

## GOAL-005 — adoção ou rejeição rastreável de ferramentas

Estado: **`LIMITED`**.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Rejeições com motivo | `LIMITED` | `docs/architecture/v2.2/TECH-DECISIONS-MATRIX.md` | Várias rejeições não têm experimento local com modelo e repetição |
| Graphify | `LIMITED` | ADR-0014. Subset em `.cursor/skills/graphify/SKILL.md` adoptado como hard gate à frente da wiki. `EVOLVELOOP_GRAPHIFY` default OFF. Esta corrida OpenRouter não exercitou a flag. Decisão em `memory/v22-close-100/goal005-register.md` | Modelo e `n` do Graphify ausentes. A corrida das seis tarefas não os preenche. A flag não foi ligada |
| Caveman e cache de vendor | `NOT_MEASURED` | Flags default OFF. Hit de vendor `NOT_MEASURED`. TD-07 e TD-13 copiados em `memory/v22-close-100/goal005-register.md` | Caveman continua `NOT_MEASURED`. O experimento TD-13 continua `NOT_MEASURED`. `cache_read_tokens` e `cache_write_tokens` do JSON OpenRouter são uso devolvido por esse modelo, não esse experimento. Dono de Caveman e do TD-13: utilizador |
| Um registo por ferramenta no formato do brief | `LIMITED` | `memory/v22-close-100/goal005-register.md` | Graphify: adoptar o subset como hard gate e rejeitar ligar `EVOLVELOOP_GRAPHIFY` por omissão. Caveman copia TD-07. Cache de vendor copia TD-13. Ollama híbrido continua `nao_tomada`. Modelo e `n` ausentes |

## GOAL-006 — benchmarks com configuração, modelo, repetições e limitações

Estado: **`LIMITED`**.

| Critério | Estado | Evidência | O que falta |
|----------|--------|-----------|-------------|
| Configuração da baseline | `PASS` | `docs/v22/baseline/tasks.json`: scorer `v22-anchor-scorer-1.0.0`, 45 paths, 22000 tokens, tiktoken | O manifest híbrido continua a ser outra corrida |
| Modelo | `LIMITED` | `model_id` `deterministic-provider` na baseline e no handoff | Esta linha é a baseline determinística. O modelo generativo está na corrida OpenRouter, que não substitui este `model_id` |
| Repetições e dispersão | `LIMITED` | `n=3`. Dispersão 0 de entrada é a esperada no determinístico. Dispersão de modelo deste JSON `NOT_MEASURED` | O plano pede ≥5 quando o modelo não é determinístico. `n=3` não cumpre essa regra. A corrida OpenRouter é outro benchmark (`n=5`) e não faz este `n=3` cumprir a regra |
| Limitações escritas | `PASS` | Campo `limitation` nos JSON da baseline e do handoff, com `tree_sha`. A corrida OpenRouter traz o seu `limitation` em `openrouter-usage.json` | — |

Outro benchmark, não a baseline: `memory/v22-close-100/evidence/openrouter-usage.json`. Modelo `google/gemini-2.5-flash-lite`. `n=5` por braço. Dispersão = os campos `*_dispersion` desse JSON. Limitação = o campo `limitation` desse ficheiro (`max_tokens` 1024; saída ≥ 1000 conta censura do teto). Isto não altera o critério `LIMITED` da baseline com `n=3`.

## Entregáveis da seção 8

| # | Entregável | Estado | Onde |
|---|------------|--------|------|
| 1 | Metas 001–006 | `PASS` | `docs/v22/GOALS-OFFICIAL.md` |
| 2 | Matriz de rastreabilidade no grão do brief | `PASS` | Este relatório lista cada critério com estado e evidência. `docs/architecture/v2.2/TRACEABILITY-MATRIX.md` é a matriz interna |
| 3 | Auditoria da ponta | `PASS` | `docs/v22/STATE-AUDIT-TIP.md` nomeia o HEAD `51e5bed`. O dossiê de outubro não foi reescrito |
| 4 | Plano de benchmark com as seis tarefas | `PASS` | `docs/v22/baseline/tasks.json`: seis tarefas, `n_min` 3, `dispersion` em `required_fields`, campo `limitation`. `docs/architecture/v2.2/BENCHMARK-PLAN.md` continua a ser outra corrida |
| 5 | Matriz de decisão | `PASS` | `docs/architecture/v2.2/TECH-DECISIONS-MATRIX.md` |
| 6 | Plano incremental com rollback | `PASS` | `docs/architecture/v2.2/IMPLEMENTATION-ROADMAP.md`, secção Rollback por fase |
| 7 | Relatório final no vocabulário da seção 9 | `PASS` | Este ficheiro. Fechar o relatório não torna os objetivos `PASS` |

## O que continua de fora

P0-6 mede o condenser extrativo numa tarefa, com a flag ligada só nessa corrida. O default continua OFF. Reinject continua `NOT_IMPLEMENTED`. `EVOLVELOOP_GRAPHIFY` permanece por definir, default OFF (ADR-0014). O subset da skill é hard gate. A flag não foi ligada. Nenhuma chave de vendor entra no tree. Os números estão nos JSON. Este texto não os copia.

A corrida generativa correu fora do clone em 2026-10-24, sem cliente OpenRouter no repositório e sem segredo na árvore. Compactação default continua `UNAVAILABLE`. Ollama híbrido continua `nao_tomada` e `NOT_MEASURED`. Ficam com o utilizador o que este JSON não mede: Ollama, compactação default, `product_percent_gate`, qualidade das respostas, campos do handoff, Caveman e o experimento TD-13.
