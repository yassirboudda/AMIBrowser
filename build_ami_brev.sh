#!/bin/bash
# AMI Browser V3 Build Script for Brev HYPERSTACK A6000
# Optimized for 300 GiB SSD / 116 GiB RAM / 60 CPU constraint
# Estimated cost: runtime × hourly rate
# Expected build time: 1.5–3 hours (depends on cache + patch set)

set -Eeuo pipefail

on_error() {
  local exit_code=$?
  local line_no=${1:-unknown}
  echo ""
  echo "=== BUILD ABORTED ==="
  echo "Line: ${line_no} | Exit code: ${exit_code}"
  echo "Check build.log (if present) and the command output above."
}
trap 'on_error $LINENO' ERR

echo "=== AMI Browser V3 Build for Brev ==="
echo "Instance: HYPERSTACK A6000 (60 CPUs, 116 GiB RAM, 300 GiB SSD)"
echo "Budget: runtime × hourly rate"
echo ""

# Configuration
REPO_DIR="${1:-.}"
BUILD_DIR="out/Default"
DISK_MONITOR=true
CLEAN_BUILD="${CLEAN_BUILD:-false}"      # true => remove out/Default before build
FAST_FAIL=true                             # run a short compile before full build
FAST_FAIL_TARGET="chrome_sandbox"         # quick sanity target
FAST_FAIL_JOBS="${FAST_FAIL_JOBS:-8}"     # limit jobs for early sanity pass

check_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1"
    exit 1
  }
}

echo "Pre-checking required tools..."
for c in git rsync awk df free gn autoninja; do
  check_cmd "$c"
done
echo "  Tools OK"

# Step 1: Pre-flight checks
echo "[1/7] Pre-flight checks..."
if [ ! -d "chromium" ]; then
  echo "ERROR: chromium/ submodule not found. Run:"
  echo "  git submodule update --init chromium"
  exit 1
fi

if [ ! -f "scripts/apply_patches.sh" ]; then
  echo "ERROR: scripts/apply_patches.sh not found"
  exit 1
fi

DISK_AVAIL=$(df / | awk 'NR==2 {print $4}')
DISK_AVAIL_GB=$((DISK_AVAIL / 1024 / 1024))
echo "  Available disk: ${DISK_AVAIL_GB} GB (need ~80 GB)"
if [ "$DISK_AVAIL_GB" -lt 85 ]; then
  echo "  WARNING: Disk space tight. May fail during linking."
fi

CPU_COUNT=$(nproc)
echo "  CPUs detected: $CPU_COUNT"
echo "  RAM available: $(free -h | awk 'NR==2 {print $7}')"
echo ""

# Step 2: Clean old build (free space)
echo "[2/7] Cleaning old build artifacts..."
if [ -d "$BUILD_DIR" ]; then
  du -sh "$BUILD_DIR" || true
  if [ "$CLEAN_BUILD" = "true" ]; then
    rm -rf "$BUILD_DIR"
    echo "  CLEAN_BUILD=true -> removed old build artifacts"
  else
    echo "  CLEAN_BUILD=false -> keeping existing artifacts (resumable build mode)"
  fi
fi
echo ""

# Step 3: Apply patches
echo "[3/7] Applying AMI patches to Chromium..."
cd chromium
git checkout . 2>/dev/null || true
cd ..
bash scripts/apply_patches.sh || {
  echo "ERROR: Patch application failed. Check conflicts."
  exit 1
}
echo ""

# Step 4: Copy AMI source
echo "[4/7] Syncing AMI source files..."
rsync -a ami_src/ chromium/ || {
  echo "ERROR: rsync failed"
  exit 1
}
echo ""

# Step 5: Create disk-optimized args.gn
echo "[5/7] Generating disk-optimized GN args..."
mkdir -p chromium/$BUILD_DIR

cat > chromium/$BUILD_DIR/args.gn << 'EOF'
# === AMI Browser V3 — Brev Disk-Optimized Build ===
# HYPERSTACK A6000: 60 CPUs, 116 GiB RAM, 300 GiB SSD
# Target disk usage: keep ~80-100 GiB free buffer

# Disk optimization (PRIMARY GOAL)
is_debug = false
is_component_build = true               # ← KEY: Makes linking fast + smaller
symbol_level = 0                        # Removes debug symbols (saves 20-30 GB!)
blink_symbol_level = 0
enable_nacl = false                     # Disable deprecated component
use_custom_libcxx = false
strip_debug_info = true                 # Additional stripping
use_lld = true                          # LLVM linker is faster + less RAM

# Build target
target_os = "linux"
target_cpu = "x64"

# Compiler
cc = "clang"
cxx = "clang++"

# AMI branding
ami_branded = true
is_chrome_branded = false
is_chromium_branded = false

# Minimal feature set (remove space hogs)
enable_widevine = false                 # Saves space; can enable later if needed
enable_nacl = false
enable_remoting = false
enable_reporting = false
safe_browsing_mode = 1

# Google service disables
enable_google_now = false
google_api_key = ""
google_default_client_id = ""
google_default_client_secret = ""

# Security (no space impact)
is_cfi = true
use_cfi_icall = true
use_cfi_cast = true

# PGO disabled for first build (saves time + disk)
chrome_pgo_phase = 0

# LTO disabled (to save memory during linking on tight SSD)
use_thin_lto = false

# AMI server URLs
ami_exchange_api_url = "https://api.ami.exchange"
ami_sync_url = "https://sync.ami.exchange"
ami_webstore_url = "https://store.ami.exchange"
ami_updates_url = "https://updates.ami.exchange"
ami_devtools_mcp_port = 18793
EOF

echo "  Generated args.gn with disk optimizations"
echo ""

# Step 6: Configure build
echo "[6/7] Running GN to generate Ninja build files..."
cd chromium
gn gen "$BUILD_DIR" --args="$(cat $BUILD_DIR/args.gn)" || {
  echo "ERROR: GN generation failed"
  exit 1
}
echo ""

# Step 6.5: Fast-fail compile sanity check
if [ "$FAST_FAIL" = true ]; then
  echo "[6.5/7] Fast-fail sanity build (${FAST_FAIL_TARGET})..."
  echo "  This catches common config/patch/toolchain breakage before the long build."
  time autoninja -C "$BUILD_DIR" "$FAST_FAIL_TARGET" -j "$FAST_FAIL_JOBS" 2>&1 | tee -a build.log || {
    echo ""
    echo "ERROR: Fast-fail sanity build failed."
    echo "Stop now (cheap failure), fix issue, then rerun script."
    exit 1
  }
  echo "  Fast-fail sanity build passed"
  echo ""
fi

# Step 7: Build with monitoring
echo "[7/7] Building AMI Browser (this will take ~1.5-3 hours)..."
echo "  Tip: In another terminal, run: watch -n 5 'df -h /; du -sh out/Default/'"
echo "  Resume note: rerun this script with CLEAN_BUILD=false to avoid rebuilding from scratch."
echo ""

# Start build with automatic CPU detection
if [ "$DISK_MONITOR" = true ]; then
  # Monitor disk every 30 seconds in background
  (
    while true; do
      sleep 30
      USED=$(du -s "$BUILD_DIR" 2>/dev/null | awk '{print $1}')
      USED_GB=$((USED / 1024 / 1024))
      AVAIL=$(df . | awk 'NR==2 {print $4}')
      AVAIL_GB=$((AVAIL / 1024 / 1024))
      echo "[DISK] Build artifacts: ${USED_GB}GB | Available: ${AVAIL_GB}GB"
      if [ "$AVAIL_GB" -lt 5 ]; then
        echo "[ERROR] Disk space critical! Build will fail."
        pkill -P $$ autoninja || true
        exit 1
      fi
    done
  ) &
  MONITOR_PID=$!
  trap "kill $MONITOR_PID 2>/dev/null || true" EXIT
fi

# Run the build
time autoninja -C "$BUILD_DIR" chrome chrome_sandbox 2>&1 | tee -a build.log

if [ $? -eq 0 ]; then
  echo ""
  echo "=== BUILD SUCCESSFUL ==="
  BUILD_SIZE=$(du -sh "$BUILD_DIR" | awk '{print $1}')
  FINAL_DISK=$(df . | awk 'NR==2 {print $4}')
  FINAL_DISK_GB=$((FINAL_DISK / 1024 / 1024))
  echo "Build artifacts size: $BUILD_SIZE"
  echo "Remaining disk space: ${FINAL_DISK_GB} GB"
  echo ""
  echo "Binary location: chromium/$BUILD_DIR/chrome"
  echo "Sandbox location: chromium/$BUILD_DIR/chrome_sandbox"
  echo ""
  echo "Next steps:"
  echo "  1. Test the binary: chromium/$BUILD_DIR/chrome --version"
  echo "  2. Package for distribution (see §36 in V3 BUILD PLAN)"
  echo ""
else
  echo ""
  echo "=== BUILD FAILED ==="
  echo "Check build.log for errors"
  echo "Common issues:"
  echo "  - Out of disk space (monitor /dev/sda1 in another terminal)"
  echo "  - Out of RAM during linking (8 GB+ required)"
  echo "  - Patch conflicts (check chromium/.rej files)"
  exit 1
fi

cd ..
