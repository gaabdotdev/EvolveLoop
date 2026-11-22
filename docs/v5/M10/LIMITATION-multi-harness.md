# LIMITATION — Live multi-harness Cursor + Antigravity (M10)

**Status:** LIMITATION (honesta)  
**Meta:** V5-M10 integrated scenario

## O que foi exercitado

- ProcessSession **fixture** (registo em disco + `bindProcessSession`)  
- Adapter ids catalog (`cursor`, `claude-code`, …) em Attempts  
- Continuity replace / capability profiles unitários  
- Delivery `local_execution` via comando local (`true`) — sem APIs pagas

## O que NÃO foi corrido

- Sessão live Cursor CLI + Antigravity em paralelo no mesmo Work  
- Consent/real_eligible harness multi-provider end-to-end pago  
- Cross-provider auto-swap (continua `unsupported` no catalog)

## Porquê

Custo, credenciais e não-determinismo de CLIs externos. O cenário M10 exige persistência real **sem** paid APIs.

## Elevação

Só remover esta LIMITATION com teste mediado (exit codes + evidence) que prove duas harnesses live no mesmo `work_id` sem forjar PASS.
