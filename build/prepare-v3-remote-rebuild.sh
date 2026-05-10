#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <ssh-host-alias> [remote-repo-dir]"
  echo "Example: $0 residential-violet-sparrow /ephemeral/builds/ClawSurf"
  exit 1
fi

HOST_ALIAS="$1"
REMOTE_REPO_DIR="${2:-/ephemeral/builds/ClawSurf}"
SSH_CONFIG="${SSH_CONFIG:-$HOME/.brev/ssh_config}"
REMOTE_BUILD_DIR="${REMOTE_BUILD_DIR:-/ephemeral/chromium-build}"
REMOTE_DEPOT_TOOLS_DIR="${REMOTE_DEPOT_TOOLS_DIR:-/ephemeral/depot_tools}"
REMOTE_PACKAGE_DIR="${REMOTE_PACKAGE_DIR:-/ephemeral/ami-browser-linux64}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "== Syncing local repo to remote host =="
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'build/dist' \
  -e "ssh -T -F $SSH_CONFIG" \
  "$REPO_ROOT/" "$HOST_ALIAS:$REMOTE_REPO_DIR/"

echo "== Running V3 resume build on remote host =="
ssh -T -F "$SSH_CONFIG" "$HOST_ALIAS" "sudo bash -lc '
  set -euo pipefail
  cd "$REMOTE_REPO_DIR"
  env \
    BUILD_DIR="$REMOTE_BUILD_DIR" \
    DEPOT_TOOLS_DIR="$REMOTE_DEPOT_TOOLS_DIR" \
    PACKAGE_DIR="$REMOTE_PACKAGE_DIR" \
    AMI_LOGO_SOURCE="$REMOTE_REPO_DIR/amibrowser/ami-logo.png" \
    bash build/resume-build.sh 2>&1 | tee /ephemeral/full-build.log
'"

echo "== Extracting branding coverage summary =="
ssh -T -F "$SSH_CONFIG" "$HOST_ALIAS" "grep -n 'Logo replacement complete' /ephemeral/full-build.log | tail -n 5 || true"

echo "Done. Build log on remote: /ephemeral/full-build.log"
