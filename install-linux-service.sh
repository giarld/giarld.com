#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="${SERVICE_NAME:-aimake-blog}"
SERVICE_USER="${SERVICE_USER:-${SUDO_USER:-$(id -un)}}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn "$SERVICE_USER")}"
SERVICE_HOST="${SERVICE_HOST:-127.0.0.1}"
SERVICE_PORT="${SERVICE_PORT:-8080}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NODE_SCRIPT="${PROJECT_DIR}/tools/local-server.mjs"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

normalize_service_name() {
  if [[ "${SERVICE_NAME}" == *.service ]]; then
    SERVICE_NAME="${SERVICE_NAME%.service}"
  fi
  UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
}

usage() {
  cat <<EOF
Usage: sudo $0 [options]

Options:
  --name=<service_name>     systemd service name (default: aimake-blog)
  --user=<service_user>     run as which Linux user (default: current user)
  --group=<service_group>   run as which Linux group (default: primary group of user)
  --host=<listen_host>      service host (default: 127.0.0.1)
  --port=<listen_port>      service port (default: 8080)
  --node=<node_path>        node binary path (default: result of 'command -v node')
  --project=<project_dir>   project directory path
  -h, --help                show this help

Example:
  sudo $0 --name=aimake-blog --user=www-data --host=127.0.0.1 --port=8080
EOF
}

for arg in "$@"; do
  case "$arg" in
    --name=*)
      SERVICE_NAME="${arg#*=}"
      ;;
    --user=*)
      SERVICE_USER="${arg#*=}"
      ;;
    --group=*)
      SERVICE_GROUP="${arg#*=}"
      ;;
    --host=*)
      SERVICE_HOST="${arg#*=}"
      ;;
    --port=*)
      SERVICE_PORT="${arg#*=}"
      ;;
    --node=*)
      NODE_BIN="${arg#*=}"
      ;;
    --project=*)
      PROJECT_DIR="${arg#*=}"
      NODE_SCRIPT="${PROJECT_DIR}/tools/local-server.mjs"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

normalize_service_name

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer only supports Linux with systemd." >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root, e.g.: sudo $0" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This host may not use systemd." >&2
  exit 1
fi

if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "Node binary not found or not executable. Pass --node=/usr/bin/node" >&2
  exit 1
fi

if [[ ! -f "${NODE_SCRIPT}" ]]; then
  echo "Node service script not found: ${NODE_SCRIPT}" >&2
  exit 1
fi

if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  echo "User not found: ${SERVICE_USER}" >&2
  exit 1
fi

if ! getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
  echo "Group not found: ${SERVICE_GROUP}" >&2
  exit 1
fi

cat > "${UNIT_PATH}" <<EOF
[Unit]
Description=AIMake Blog Node Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NODE_BIN} ${NODE_SCRIPT} --host=${SERVICE_HOST} --port=${SERVICE_PORT}
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo "Installed and started: ${SERVICE_NAME}"
echo "Unit file: ${UNIT_PATH}"
echo "Check status: systemctl status ${SERVICE_NAME} --no-pager"
echo "View logs: journalctl -u ${SERVICE_NAME} -f"
