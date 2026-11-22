# Evolve CLI — keybindings (V0-CLI-02)

Operational controls are **outside** the conversational text channel.

| Binding | Action | Notes |
|---------|--------|--------|
| `Ctrl+P` | Pause | Sets operational pause; type `continuar` to resume. Not inserted as chat text. |
| `Ctrl+C` | Graceful interrupt | Exit code `130`; does not delete `.evolveloop/` state. |

## Node TTY limits

- Raw-mode keypress requires `process.stdin.isTTY` and `setRawMode`.
- Under Vitest / pipes / non-TTY, raw mode is **off**.
- Tests inject the same actions via `KeybindingController.emit("pause"|"interrupt")` in `orchestrator/src/v3/evolve-shell/keybindings.ts`.
- `SIGINT` handler remains attached for interrupt even when raw mode is unavailable.

## Install

```bash
bash scripts/install-evolve-cli.sh
# or: PATH="$PWD/bin:$PATH" evolve
```
