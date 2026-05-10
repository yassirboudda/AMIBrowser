#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  echo "PASS: $1"
}

bad() {
  fail=$((fail + 1))
  echo "FAIL: $1"
}

contains() {
  local file="$1"
  local pattern="$2"
  grep -Fq "$pattern" "$file"
}

check_file() {
  local path="$1"
  [[ -f "$path" ]]
}

echo "== V3 Foundation Preparation Audit =="

audit_file_full="$REPO_ROOT/build/build-ami-browser.sh"
audit_file_resume="$REPO_ROOT/build/resume-build.sh"
launcher_file="$REPO_ROOT/launcher/clawsurf.sh"
hub_manifest="$REPO_ROOT/clawsurf-hub/manifest.json"

if check_file "$REPO_ROOT/build/safe_branding_patch.py"; then
  ok "safe_branding_patch.py exists"
else
  bad "safe_branding_patch.py missing"
fi

if contains "$audit_file_full" "safe_branding_patch.py"; then
  ok "build-ami-browser uses safe branding patcher"
else
  bad "build-ami-browser missing safe branding patcher call"
fi

if contains "$audit_file_resume" "safe_branding_patch.py"; then
  ok "resume-build uses safe branding patcher"
else
  bad "resume-build missing safe branding patcher call"
fi

if contains "$audit_file_full" "Keeping Chrome token in user_agent.cc"; then
  ok "build-ami-browser preserves UA Chrome token"
else
  bad "build-ami-browser UA handling not aligned"
fi

if contains "$audit_file_resume" "Keeping Chrome token in user_agent.cc"; then
  ok "resume-build preserves UA Chrome token"
else
  bad "resume-build UA handling not aligned"
fi

if grep -Fq 'path "*user_agent*"' "$audit_file_full"; then
  bad "build-ami-browser still has aggressive user_agent sed patch"
else
  ok "build-ami-browser has no aggressive user_agent sed patch"
fi

if grep -Fq 'path "*user_agent*"' "$audit_file_resume"; then
  bad "resume-build still has aggressive user_agent sed patch"
else
  ok "resume-build has no aggressive user_agent sed patch"
fi

if contains "$audit_file_full" "Logo replacement complete. SVG:"; then
  ok "build-ami-browser reports logo replacement counters"
else
  bad "build-ami-browser missing logo replacement counters"
fi

if contains "$audit_file_resume" "Logo replacement complete. SVG:"; then
  ok "resume-build reports logo replacement counters"
else
  bad "resume-build missing logo replacement counters"
fi

if contains "$launcher_file" "Chrome/146.0.0.0"; then
  ok "launcher uses Chrome token in runtime user-agent"
else
  bad "launcher runtime user-agent token missing"
fi

if grep -Fq '"version": "3.0.0"' "$hub_manifest"; then
  ok "hub manifest version is 3.0.0"
else
  bad "hub manifest version is not 3.0.0"
fi

echo ""
echo "Summary: PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]]
