#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  AMI Browser — Resume Build Script (fixed pipefail)
#  Resumes from Step 4 (branding) when source already fetched.
#  Server: 149.248.8.94 — 16 vCPU / 56GB RAM / 960GB NVMe
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BUILD_DIR="${BUILD_DIR:-/root/chromium-build}"
DEPOT_TOOLS_DIR="${DEPOT_TOOLS_DIR:-/root/depot_tools}"
PACKAGE_DIR="${PACKAGE_DIR:-/root/ami-browser-linux64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AMI_LOGO_SOURCE="${AMI_LOGO_SOURCE:-$REPO_ROOT/amibrowser/ami-logo.png}"
NPROC=$(nproc)

log() { echo ""; echo "══ [$(date '+%H:%M:%S')] $1 ══"; }
export PATH="$DEPOT_TOOLS_DIR:$PATH"
if [[ ! -f "$DEPOT_TOOLS_DIR/python3_bin_reldir.txt" ]]; then
  (cd "$DEPOT_TOOLS_DIR" && ./update_depot_tools >/dev/null 2>&1) || true
fi
if [[ ! -f "$DEPOT_TOOLS_DIR/python3_bin_reldir.txt" ]]; then
  (cd "$DEPOT_TOOLS_DIR" && ./ensure_bootstrap >/dev/null 2>&1) || true
fi

log "AMI Browser Resume Build — $NPROC cores"

cd "$BUILD_DIR/src"

# ═══════════════════════════════════════════════════════════════
#  4. APPLY FULL AMI BROWSER BRANDING
# ═══════════════════════════════════════════════════════════════
log "Step 4/8: Applying AMI Browser branding (full rebrand)"

cat > chrome/app/theme/chromium/BRANDING <<'BRAND'
COMPANY_FULLNAME=AMI Exchange
COMPANY_SHORTNAME=AMI Exchange
PRODUCT_FULLNAME=AMI Browser
PRODUCT_SHORTNAME=AMI Browser
PRODUCT_INSTALLER_FULLNAME=AMI Browser Installer
PRODUCT_INSTALLER_SHORTNAME=AMI Browser
COPYRIGHT=Copyright 2024-2026 AMI Exchange. All rights reserved.
MAC_BUNDLE_ID=exchange.ami.browser
MAC_TEAM_ID=AMI
BRAND

echo "  → Patching .grd/.grdp string resources..."
find chrome/ components/ ui/ -type f \( -name "*.grd" -o -name "*.grdp" \) | while read -r f; do
  grep -ql 'Chromium' "$f" 2>/dev/null && sed -i 's/Chromium/AMI Browser/g' "$f" || true
done

echo "  → Patching .xtb translation files..."
find chrome/ components/ ui/ -type f -name "*.xtb" | while read -r f; do
  grep -ql 'Chromium' "$f" 2>/dev/null && sed -i 's/Chromium/AMI Browser/g' "$f" || true
done

echo "  → Patching chrome_constants.cc..."
[[ -f chrome/common/chrome_constants.cc ]] && sed -i -e 's/"chromium"/"ami-browser"/g' -e 's/"Chromium"/"AMI Browser"/g' chrome/common/chrome_constants.cc || true

echo "  → Patching chrome_content_client.cc..."
[[ -f chrome/app/chrome_content_client.cc ]] && sed -i 's/"Chromium"/"AMI Browser"/g' chrome/app/chrome_content_client.cc || true

echo "  → Patching user_agent.cc..."
find content/ chrome/ -name "*.cc" -path "*user_agent*" -exec sed -i 's/"Chromium"/"AMIBrowser"/g; s/"chromium"/"ami-browser"/g' {} \; 2>/dev/null || true

echo "  → Patching browser .cc/.h (about_handler, version_ui, etc)..."
grep -rl '"Chromium"' chrome/browser/ --include='*.cc' --include='*.h' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

echo "  → Patching settings/help page..."
find chrome/browser/ui/webui/settings/ \( -name "*.cc" -o -name "*.h" \) -exec grep -ql '"Chromium"' {} \; -exec sed -i 's/"Chromium"/"AMI Browser"/g' {} \; 2>/dev/null || true

echo "  → Patching NTP / side panel..."
find chrome/browser/ui/ chrome/browser/new_tab_page/ chrome/browser/resources/new_tab_page/ \
  \( -name "*.cc" -o -name "*.h" -o -name "*.ts" -o -name "*.html" \) 2>/dev/null | while read -r f; do
  grep -ql '"Chromium"' "$f" 2>/dev/null && sed -i 's/"Chromium"/"AMI Browser"/g' "$f" || true
done

echo "  → Patching Linux installer/desktop templates..."
find chrome/installer/linux/ -type f 2>/dev/null | while read -r f; do
  grep -ql 'chromium\|Chromium' "$f" 2>/dev/null && sed -i 's/chromium-browser/ami-browser/g; s/chromium/ami-browser/g; s/Chromium/AMI Browser/g' "$f" || true
done

echo "  → Patching branding .gn/.gni..."
find chrome/app/ \( -name "*.gni" -o -name "*.gn" \) -exec grep -ql 'Chromium' {} \; -exec sed -i 's/"Chromium"/"AMI Browser"/g' {} \; 2>/dev/null || true

echo "  → Patching content/ .grd/.grdp..."
find content/ \( -name "*.grd" -o -name "*.grdp" \) | while read -r f; do
  grep -ql 'Chromium' "$f" 2>/dev/null && sed -i 's/Chromium/AMI Browser/g' "$f" || true
done

echo "  → Patching chrome://flags..."
find chrome/browser/ -name "about_flags*" -exec sed -i 's/"Chromium"/"AMI Browser"/g' {} \; 2>/dev/null || true

echo "  → Patching extension system strings..."
grep -rl '"Chromium"' extensions/ chrome/browser/extensions/ --include='*.cc' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

echo "  → Patching crash reporter / metrics..."
grep -rl 'Chromium' components/crash/ chrome/browser/metrics/ --include='*.cc' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

echo "  → Patching profile manager / welcome page..."
grep -rl 'Chromium' chrome/browser/ui/views/ --include='*.cc' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

echo "  → Final sweep..."
grep -rl '"Chromium"' chrome/ components/ --include='*.cc' --include='*.h' --include='*.mm' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

echo "  → Replacing Chromium logo assets (SVG + PNG + ICO)..."
AMI_LOGO_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs><circle cx="128" cy="128" r="120" fill="url(#g)"/><text x="128" y="160" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="100" fill="white">AMI</text></svg>'
AMI_LOGO_WORKDIR="/tmp/ami-logo-work"
AMI_LOGO_BASE="$AMI_LOGO_WORKDIR/ami-logo-base.png"
mkdir -p "$AMI_LOGO_WORKDIR"

if [[ -f "$AMI_LOGO_SOURCE" ]]; then
  cp "$AMI_LOGO_SOURCE" "$AMI_LOGO_BASE"
elif command -v convert >/dev/null 2>&1; then
  echo "$AMI_LOGO_SVG" > "$AMI_LOGO_WORKDIR/ami-logo.svg"
  convert -background none "$AMI_LOGO_WORKDIR/ami-logo.svg" "$AMI_LOGO_BASE" 2>/dev/null || true
fi

replace_logo_svg() {
  local file="$1"
  cat > "$file" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs><circle cx="128" cy="128" r="120" fill="url(#g)"/><text x="128" y="160" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="100" fill="white">AMI</text></svg>
SVG
}

render_logo_png() {
  local target="$1"
  local size="$2"
  if [[ -f "$AMI_LOGO_BASE" ]] && command -v convert >/dev/null 2>&1; then
    convert "$AMI_LOGO_BASE" -resize "${size}x${size}" "$target" 2>/dev/null || cp "$AMI_LOGO_BASE" "$target"
  elif [[ -f "$AMI_LOGO_BASE" ]]; then
    cp "$AMI_LOGO_BASE" "$target"
  fi
}

for svg in \
  chrome/browser/resources/images/chrome_logo.svg \
  chrome/browser/resources/images/chrome_logo_dark.svg \
  ui/webui/resources/images/chrome_logo.svg \
  ui/webui/resources/images/chrome_logo_dark.svg; do
  [[ -f "$svg" ]] && replace_logo_svg "$svg"
done

find chrome/ ui/ components/ -type f -name 'chrome_logo*.svg' 2>/dev/null | while read -r svg; do
  replace_logo_svg "$svg"
done

find chrome/app/theme -type f \( -name 'product_logo_*.png' -o -name '*chromium*logo*.png' -o -name 'chromium*.png' \) 2>/dev/null | while read -r pngfile; do
  size=$(basename "$pngfile" | sed -n 's/[^0-9]*\([0-9][0-9]*\).*/\1/p')
  [[ -z "$size" ]] && size=128
  render_logo_png "$pngfile" "$size"
  echo "    Replaced: $pngfile"
done

if [[ -f "$AMI_LOGO_BASE" ]] && command -v convert >/dev/null 2>&1; then
  find chrome/app/theme -type f -name '*.ico' 2>/dev/null | grep -Ei 'chrom|logo|product' | while read -r icofile; do
    convert "$AMI_LOGO_BASE" "$icofile" 2>/dev/null || true
    echo "    Replaced: $icofile"
  done || true
fi

echo "  ✓ Branding complete."

# ═══════════════════════════════════════════════════════════════
#  5. CONFIGURE BUILD
# ═══════════════════════════════════════════════════════════════
log "Step 5/8: Configuring GN build args"

BUILD_OUT="out/Release"
mkdir -p "$BUILD_OUT"
cat > "$BUILD_OUT/args.gn" <<'GN'
is_official_build = true
is_debug = false
is_component_build = false
is_chrome_branded = false
symbol_level = 0
blink_symbol_level = 0
use_thin_lto = true
is_cfi = false
chrome_pgo_phase = 0
use_sysroot = true
use_lld = true
enable_nacl = false
treat_warnings_as_errors = false
enable_iterator_debugging = false
ffmpeg_branding = "Chromium"
proprietary_codecs = false
GN

gn gen "$BUILD_OUT" 2>&1 | tail -5

# ═══════════════════════════════════════════════════════════════
#  6. BUILD
# ═══════════════════════════════════════════════════════════════
log "Step 6/8: Building AMI Browser ($NPROC cores)..."

JOBS=$((NPROC > 2 ? NPROC - 2 : NPROC))
echo "  Using $JOBS parallel jobs"
ninja -C "$BUILD_OUT" -j"$JOBS" chrome chrome_sandbox 2>&1 | tail -20

log "Build complete!"
ls -lh "$BUILD_OUT/chrome"

# ═══════════════════════════════════════════════════════════════
#  7. VERIFY BRANDING
# ═══════════════════════════════════════════════════════════════
log "Step 7/8: Verifying branding"

CHROMIUM_COUNT=$(strings "$BUILD_OUT/chrome" | grep -c "Chromium" || true)
echo "  Residual 'Chromium' strings: $CHROMIUM_COUNT"
if [[ "$CHROMIUM_COUNT" -gt 0 ]]; then
  strings "$BUILD_OUT/chrome" | grep "Chromium" | sort -u | head -20
fi

AMI_COUNT=$(strings "$BUILD_OUT/chrome" | grep -c "AMI Browser" || true)
echo "  'AMI Browser' strings: $AMI_COUNT"

# ═══════════════════════════════════════════════════════════════
#  8. PACKAGE
# ═══════════════════════════════════════════════════════════════
log "Step 8/8: Packaging"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

cp "$BUILD_OUT/chrome" "$PACKAGE_DIR/ami-browser"
cp "$BUILD_OUT/chrome_sandbox" "$PACKAGE_DIR/chrome-sandbox" 2>/dev/null || true
cp "$BUILD_OUT/chrome_crashpad_handler" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libEGL.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libGLESv2.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libvk_swiftshader.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libvulkan.so.1" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/vk_swiftshader_icd.json" "$PACKAGE_DIR/" 2>/dev/null || true
cp -r "$BUILD_OUT/locales" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT"/*.pak "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT"/*.bin "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/icudtl.dat" "$PACKAGE_DIR/" 2>/dev/null || true

chmod 4755 "$PACKAGE_DIR/chrome-sandbox" 2>/dev/null || true
chmod +x "$PACKAGE_DIR/ami-browser"

cd /root
tar czf ami-browser-linux64.tar.gz ami-browser-linux64/
ls -lh ami-browser-linux64.tar.gz

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ AMI Browser built and packaged!"
echo "  📦 /root/ami-browser-linux64.tar.gz"
echo "═══════════════════════════════════════════════════"
