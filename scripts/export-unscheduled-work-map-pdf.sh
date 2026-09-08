#!/usr/bin/env bash
set -euo pipefail

# The mockup preview workflow must be running before this script is called.
# Override MOCKUP_BASE_URL when exporting outside the Replit workspace proxy.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROMIUM_BIN="${CHROMIUM_BIN:-/repl/tools/bin/chromium}"
MOCKUP_BASE_URL="${MOCKUP_BASE_URL:-http://127.0.0.1:80/__mockup}"
OUTPUT_PATH="${ROOT_DIR}/exports/pcc-gardens-unscheduled-work-system-map.pdf"
PREVIEW_URL="${MOCKUP_BASE_URL}/preview/infographics/UnscheduledWorkSystemMap"

if [[ ! -x "${CHROMIUM_BIN}" ]]; then
  echo "Chromium is not executable at ${CHROMIUM_BIN}" >&2
  exit 1
fi

if ! curl --fail --silent --show-error --head "${PREVIEW_URL}" >/dev/null; then
  echo "The mockup preview is not available at ${PREVIEW_URL}" >&2
  exit 1
fi

"${CHROMIUM_BIN}" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --virtual-time-budget=5000 \
  --print-to-pdf="${OUTPUT_PATH}" \
  --no-pdf-header-footer \
  "${PREVIEW_URL}"

echo "Exported vector PDF to ${OUTPUT_PATH}"