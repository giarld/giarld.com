#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-aimake-blog}"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

usage() {
  cat <<EOF
Usage: sudo $0 [options]

Options:
  --name=<service_name>   systemd service name (default: aimake-blog)
  -h, --help              show this help

Example:
  sudo $0 --name=aimake-blog
EOF
}

for arg in "$@"; do
  case "$arg" in
    --name=*)
      SERVICE_NAME="${arg#*=}"
      UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
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

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This uninstaller only supports Linux with systemd." >&2
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

if systemctl list-unit-files | awk '{print $1}' | grep -qx "${SERVICE_NAME}.service"; then
  systemctl disable --now "${SERVICE_NAME}" || true
else
  echo "Service unit not registered: ${SERVICE_NAME}.service"
fi

if [[ -f "${UNIT_PATH}" ]]; then
  rm -f "${UNIT_PATH}"
  echo "Removed unit file: ${UNIT_PATH}"
else
  echo "Unit file not found: ${UNIT_PATH}"
fi

systemctl daemon-reload
systemctl reset-failed

echo "Uninstall completed for service: ${SERVICE_NAME}"
