#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.tmp"
PID_FILE="$RUNTIME_DIR/blog-service.pid"
LOG_FILE="$RUNTIME_DIR/blog-service.log"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"
NODE_SCRIPT="$ROOT_DIR/tools/local-server.mjs"

mkdir -p "$RUNTIME_DIR"

is_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  rm -f "$PID_FILE"
  return 1
}

start_service() {
  if is_running; then
    echo "Service already running (pid=$(cat "$PID_FILE"))"
    return 0
  fi

  nohup node "$NODE_SCRIPT" --host="$HOST" --port="$PORT" >>"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  sleep 0.3

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Service started"
    echo "PID: $pid"
    echo "URL: http://$HOST:$PORT"
    echo "Log: $LOG_FILE"
    return 0
  fi

  echo "Service failed to start. Check log: $LOG_FILE" >&2
  rm -f "$PID_FILE"
  return 1
}

stop_service() {
  if ! is_running; then
    echo "Service is not running"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      echo "Service stopped"
      return 0
    fi
    sleep 0.2
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
  echo "Service force stopped"
}

status_service() {
  if is_running; then
    echo "Service is running (pid=$(cat "$PID_FILE"))"
    echo "URL: http://$HOST:$PORT"
    echo "Log: $LOG_FILE"
  else
    echo "Service is not running"
  fi
}

logs_service() {
  touch "$LOG_FILE"
  tail -f "$LOG_FILE"
}

usage() {
  cat <<EOF
Usage: $0 {start|stop|restart|status|logs}

Environment variables:
  HOST   Listen host (default: 0.0.0.0)
  PORT   Listen port (default: 8080)

Examples:
  $0 start
  PORT=3001 $0 restart
  $0 logs
EOF
}

case "${1:-}" in
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    start_service
    ;;
  status)
    status_service
    ;;
  logs)
    logs_service
    ;;
  *)
    usage
    exit 1
    ;;
esac
