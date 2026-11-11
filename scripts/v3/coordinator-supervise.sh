#!/usr/bin/env bash
# Supervised coordinator tick loop for EvolveLoop V3.
#
# Purpose: keep ticking durable work state while an OS process is alive.
# Closing a TUI/CLI does NOT stop this script if it runs under systemd/nohup/tmux.
# This does NOT execute work while the machine is powered off or suspended.
#
# Usage:
#   scripts/v3/coordinator-supervise.sh start --data-dir ./v3-data --work-id w1 [--interval 30]
#   scripts/v3/coordinator-supervise.sh stop  --data-dir ./v3-data
#   scripts/v3/coordinator-supervise.sh status --data-dir ./v3-data
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORCH="$ROOT/orchestrator"
EVOLVE=(node "$ORCH/dist/cli/evolve.js")

CMD="${1:-}"
shift || true

DATA_DIR=""
WORK_ID=""
INTERVAL=30

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --work-id) WORK_ID="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$DATA_DIR" ]]; then
  echo "Required: --data-dir" >&2
  exit 2
fi

DATA_DIR="$(cd "$DATA_DIR" && pwd)"
RUN_DIR="$DATA_DIR/coordinator/supervise"
PID_FILE="$RUN_DIR/supervise.pid"
LOG_FILE="$RUN_DIR/supervise.log"
mkdir -p "$RUN_DIR"

if [[ ! -f "$ORCH/dist/cli/evolve.js" ]]; then
  echo "Build orchestrator first: (cd orchestrator && npm run build)" >&2
  exit 1
fi

case "$CMD" in
  start)
    if [[ -z "$WORK_ID" ]]; then
      echo "Required: --work-id" >&2
      exit 2
    fi
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Already running pid=$(cat "$PID_FILE")"
      exit 0
    fi
    "${EVOLVE[@]}" coordinator start --data-dir "$DATA_DIR" >/dev/null
    (
      echo "[supervise] start work=$WORK_ID interval=${INTERVAL}s"
      while true; do
        "${EVOLVE[@]}" coordinator tick --data-dir "$DATA_DIR" --work-id "$WORK_ID" >>"$LOG_FILE" 2>&1 || true
        sleep "$INTERVAL"
      done
    ) &
    echo $! >"$PID_FILE"
    echo "started pid=$(cat "$PID_FILE") log=$LOG_FILE"
    echo "limitation: stops on reboot/logout unless installed as a user/system service"
    ;;
  stop)
    if [[ -f "$PID_FILE" ]]; then
      PID="$(cat "$PID_FILE")"
      kill "$PID" 2>/dev/null || true
      rm -f "$PID_FILE"
      "${EVOLVE[@]}" coordinator stop --data-dir "$DATA_DIR" --reason supervise_stop >/dev/null || true
      echo "stopped pid=$PID"
    else
      echo "not running"
    fi
    ;;
  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "running pid=$(cat "$PID_FILE")"
    else
      echo "stopped"
    fi
    "${EVOLVE[@]}" coordinator status --data-dir "$DATA_DIR"
    ;;
  *)
    echo "Usage: $0 start|stop|status --data-dir DIR [--work-id ID] [--interval SEC]" >&2
    exit 2
    ;;
esac
