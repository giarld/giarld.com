#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
USERNAME="${1:-giarld}"
OUTPUT_FILE="${2:-data/github-data.json}"

node "$ROOT_DIR/tools/update-github-data.mjs" "$USERNAME" "$OUTPUT_FILE"
