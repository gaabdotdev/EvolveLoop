# Coordinator supervision (V3.0)

## What is guaranteed

- Durable state under `--data-dir` survives closing the `evolve` CLI / TUI.
- `scripts/v3/coordinator-supervise.sh` can keep calling `evolve coordinator tick` in a background shell process.
- After stop/crash of the supervisor, state remains on disk for resume.

## What is not claimed

- Execution while the machine is powered off, suspended, or after logout (unless an OS service is configured by the operator).
- Exactly-once work execution.
- Full multi-agent runtime of leaders/planners (spawn creates registry + tasks; LLM agents are not auto-invoked here).

## Commands

```bash
cd orchestrator && npm run build
../scripts/v3/coordinator-supervise.sh start --data-dir ./v3-data --work-id w1 --interval 30
../scripts/v3/coordinator-supervise.sh status --data-dir ./v3-data
../scripts/v3/coordinator-supervise.sh stop --data-dir ./v3-data
```

## Optional systemd user unit (template)

A sample unit lives at `scripts/v3/systemd/evolveloop-coordinator@.service`.

- Instance name = `work-id` (e.g. `evolveloop-coordinator@w1.service`).
- Requires operator-provided `EVOLVELOOP_ROOT` + `EVOLVELOOP_DATA_DIR` (drop-in).
- Build orchestrator first (`npm run build`) so `dist/cli/evolve.js` exists.
- User units stop on logout unless lingering is enabled; they still do not run while the machine is powered off.

```bash
mkdir -p ~/.config/systemd/user
cp scripts/v3/systemd/evolveloop-coordinator@.service ~/.config/systemd/user/
# add drop-in with EVOLVELOOP_ROOT / EVOLVELOOP_DATA_DIR — see comments in the unit file
systemctl --user daemon-reload
systemctl --user enable --now evolveloop-coordinator@w1.service
systemctl --user status evolveloop-coordinator@w1.service
```

EvolveLoop ships the template; it does not auto-install a portable cross-OS daemon.
