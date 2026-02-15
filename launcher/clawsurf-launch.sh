#!/usr/bin/env bash
set -euo pipefail
URL="${1:-about:blank}"
nohup "$HOME/.local/bin/ClawSurf" "$URL" >/tmp/clawsurf.log 2>&1 &
exit 0
