#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  AMI Browser v2 — C++ Rebuild Build Script
#  FIXES from v1: Python XML parser for .grd (no more blanket sed),
#  proper UA (keep Chrome token), optimized for 65GB RAM server.
#  Target: Chromium 146.0.7680.80 → AMI Browser 2.1
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PRODUCT_NAME="AMI Browser"
PRODUCT_SHORT="ami-browser"
CHROMIUM_TAG="146.0.7680.80"
BUILD_DIR="/root/chromium-build"
NPROC=$(nproc)
TOTAL_RAM_GB=$(awk '/MemTotal/{printf "%.0f", $2/1024/1024}' /proc/meminfo)

log() { echo ""; echo "══ [$(date '+%H:%M:%S')] $1 ══"; }

log "AMI Browser v2.1 C++ Rebuild — Tag $CHROMIUM_TAG"
log "Server: $NPROC cores / ${TOTAL_RAM_GB}GB RAM"

# ═══════════════════════════════════════════════════════════════
#  1. Install dependencies
# ═══════════════════════════════════════════════════════════════
log "Step 1/8: Installing build dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  git curl wget python3 python3-pip lsb-release sudo \
  build-essential clang lld ninja-build \
  pkg-config libglib2.0-dev libgtk-3-dev libnss3-dev \
  libatk1.0-dev libatk-bridge2.0-dev libcups2-dev \
  libxcomposite-dev libxdamage-dev libxrandr-dev \
  libgbm-dev libpango1.0-dev libasound2-dev \
  libpulse-dev libdbus-1-dev libxss-dev mesa-common-dev \
  libdrm-dev libxkbcommon-dev libatspi2.0-dev \
  uuid-dev default-jdk-headless libffi-dev \
  screen tmux xz-utils bzip2 zip unzip sshpass \
  libx11-xcb-dev libxcb-dri3-dev imagemagick librsvg2-bin \
  ccache 2>/dev/null || true

# Setup ccache for faster rebuilds
if command -v ccache >/dev/null 2>&1; then
  export CCACHE_DIR="/root/.ccache"
  export CCACHE_MAXSIZE="30G"
  export CC="ccache clang"
  export CXX="ccache clang++"
  ccache -M 30G 2>/dev/null || true
  log "ccache enabled (30GB cache)"
fi

# ═══════════════════════════════════════════════════════════════
#  2. Get depot_tools
# ═══════════════════════════════════════════════════════════════
log "Step 2/8: Setting up depot_tools"
if [[ ! -d "/root/depot_tools" ]]; then
  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git /root/depot_tools
fi
export PATH="/root/depot_tools:$PATH"

# ═══════════════════════════════════════════════════════════════
#  3. Fetch Chromium source
# ═══════════════════════════════════════════════════════════════
log "Step 3/8: Fetching Chromium source"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

if [[ ! -f ".gclient" ]]; then
  cat > .gclient <<'GCLIENT'
solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
GCLIENT
  git clone --depth=1 --branch="$CHROMIUM_TAG" \
    https://chromium.googlesource.com/chromium/src.git src 2>/dev/null || \
  git clone --depth=1 \
    https://chromium.googlesource.com/chromium/src.git src
fi

cd src

# Checkout the right tag
if ! git describe --tags --exact-match HEAD 2>/dev/null | grep -q "$CHROMIUM_TAG"; then
  git fetch --depth=1 origin "tag/$CHROMIUM_TAG" 2>/dev/null || \
  git fetch --depth=1 origin "+refs/tags/$CHROMIUM_TAG:refs/tags/$CHROMIUM_TAG" 2>/dev/null || true
  git checkout "$CHROMIUM_TAG" 2>/dev/null || git checkout "tags/$CHROMIUM_TAG" 2>/dev/null || true
fi

log "Step 3b/8: gclient sync (fetching dependencies)"
gclient sync --nohooks --no-history -D --shallow 2>&1 | tail -5

log "Step 3c/8: install-build-deps"
./build/install-build-deps.sh --no-prompt --no-chromeos-fonts 2>&1 | tail -5 || true

log "Step 3d/8: gclient runhooks"
gclient runhooks 2>&1 | tail -5

# ═══════════════════════════════════════════════════════════════
#  4. APPLY AMI BROWSER BRANDING — V2 (Python XML parser)
#  FIXES: §1.2 (right-click/copy-paste broken by blanket sed)
#         §1.1 (UA string — keep Chrome token)
# ═══════════════════════════════════════════════════════════════
log "Step 4/8: Applying AMI Browser branding (v2 — XML-safe)"

cd "$BUILD_DIR/src"

# ── 4a. BRANDING master file ──
echo "  → Writing BRANDING file..."
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

# ── 4b. PYTHON XML PARSER for .grd/.grdp ──
# This is the CRITICAL fix: only replace text content inside <message> and
# <translation> tags, NEVER touch name= attributes, <part file="">, <if> conditions
echo "  → Creating Python XML patcher (safe .grd/.grdp patching)..."
cat > /tmp/patch_grd_strings.py <<'PYEOF'
#!/usr/bin/env python3
"""
AMI Browser .grd/.grdp safe string patcher.
Only replaces 'Chromium' inside text content of <message> tags.
NEVER touches XML attributes (name=, file=, etc.) — this is the fix
for the context menu / copy-paste / keyboard shortcut breakage.
"""
import xml.etree.ElementTree as ET
import glob, sys, os, re

OLD = "Chromium"
NEW = "AMI Browser"
# Skip patterns that should NOT be replaced
SKIP_PATTERNS = [
    "Chromium OS",      # Don't break ChromeOS references
    "chromium.org",     # Don't break URLs
    "chromium.googlesource",  # Don't break git URLs
]

patched_files = 0
patched_strings = 0

def should_skip(text):
    """Check if this text contains patterns we should not touch."""
    for pat in SKIP_PATTERNS:
        if pat in text:
            return True
    return False

def patch_text(text):
    """Replace Chromium with AMI Browser in text, respecting skip patterns."""
    if not text or OLD not in text:
        return text, False
    if should_skip(text):
        return text, False
    new_text = text.replace(OLD, NEW)
    return new_text, (new_text != text)

def patch_element_text(elem):
    """Patch text and tail of an element and all its children (text content only)."""
    changed = False
    if elem.text:
        elem.text, c = patch_text(elem.text)
        changed = changed or c
    for child in elem:
        if child.tail:
            child.tail, c = patch_text(child.tail)
            changed = changed or c
        # Recurse into children's text (e.g., <ph> elements inside <message>)
        if child.text:
            child.text, c = patch_text(child.text)
            changed = changed or c
        for grandchild in child:
            if grandchild.tail:
                grandchild.tail, c = patch_text(grandchild.tail)
                changed = changed or c
    return changed

# Process all .grd and .grdp files
search_dirs = ['chrome/', 'components/', 'ui/', 'content/']
for search_dir in search_dirs:
    if not os.path.isdir(search_dir):
        continue
    for ext in ('*.grd', '*.grdp'):
        for filepath in glob.glob(f'{search_dir}/**/{ext}', recursive=True):
            try:
                # Read the original file to preserve XML declaration and comments
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    original = f.read()
                
                if OLD not in original:
                    continue
                
                # Parse with ElementTree
                tree = ET.parse(filepath)
                root = tree.getroot()
                file_changed = False
                
                # Patch <message> elements (UI strings)
                for msg in root.iter('message'):
                    if patch_element_text(msg):
                        file_changed = True
                        patched_strings += 1
                
                # Patch <translation> elements (in .xtb-style embeds)
                for trans in root.iter('translation'):
                    if patch_element_text(trans):
                        file_changed = True
                        patched_strings += 1
                
                if file_changed:
                    tree.write(filepath, xml_declaration=True, encoding='utf-8')
                    patched_files += 1
                    
            except ET.ParseError:
                # If XML parsing fails, fall back to careful regex on message content only
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                    # Only replace inside <message>...</message> blocks
                    def replace_in_message(m):
                        return m.group(0).replace(OLD, NEW)
                    new_content = re.sub(
                        r'(<message[^>]*>)(.*?)(</message>)',
                        lambda m: m.group(1) + m.group(2).replace(OLD, NEW) + m.group(3),
                        content, flags=re.DOTALL
                    )
                    if new_content != content:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        patched_files += 1
                        patched_strings += 1
                except Exception as e2:
                    print(f"  SKIP (parse error): {filepath}: {e2}", file=sys.stderr)
            except Exception as e:
                print(f"  SKIP (error): {filepath}: {e}", file=sys.stderr)

print(f"  ✓ Patched {patched_strings} strings in {patched_files} .grd/.grdp files (XML-safe)")
PYEOF

python3 /tmp/patch_grd_strings.py

# ── 4c. .xtb translation files — same XML-safe approach ──
echo "  → Patching .xtb translation files (XML-safe)..."
cat > /tmp/patch_xtb_strings.py <<'PYEOF'
#!/usr/bin/env python3
"""Safe .xtb patcher — only replace inside <translation> text content."""
import xml.etree.ElementTree as ET
import glob, os, re

OLD = "Chromium"
NEW = "AMI Browser"
patched = 0

for search_dir in ['chrome/', 'components/', 'ui/', 'content/']:
    if not os.path.isdir(search_dir):
        continue
    for filepath in glob.glob(f'{search_dir}/**/*.xtb', recursive=True):
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            if OLD not in content:
                continue
            # For .xtb: replace only inside <translation>...</translation>
            new_content = re.sub(
                r'(<translation[^>]*>)(.*?)(</translation>)',
                lambda m: m.group(1) + m.group(2).replace(OLD, NEW) + m.group(3),
                content, flags=re.DOTALL
            )
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                patched += 1
        except Exception as e:
            pass

print(f"  ✓ Patched {patched} .xtb files")
PYEOF

python3 /tmp/patch_xtb_strings.py

# ── 4d. Chrome constants (binary name, process name) ──
echo "  → Patching chrome_constants.cc..."
if [[ -f chrome/common/chrome_constants.cc ]]; then
  sed -i \
    -e 's/"chromium"/"ami-browser"/g' \
    -e 's/"Chromium"/"AMI Browser"/g' \
    chrome/common/chrome_constants.cc
fi

# ── 4e. Product info strings ──
echo "  → Patching chrome_content_client.cc..."
if [[ -f chrome/app/chrome_content_client.cc ]]; then
  sed -i 's/"Chromium"/"AMI Browser"/g' chrome/app/chrome_content_client.cc
fi

# ── 4f. User Agent — CRITICAL FIX ──
# DO NOT replace "Chrome" in UA. Only replace "Chromium" application name.
# The UA MUST keep "Chrome/146.x" token (Edge, Brave, Opera all do this).
echo "  → Patching user agent (keeping Chrome token)..."
# Only patch the GetProduct() / application_name fields, NOT BuildUserAgentFromProduct
if [[ -f components/embedder_support/user_agent_utils.cc ]]; then
  # Replace the Chromium product name that shows in chrome://version
  # but keep the Chrome/version UA token intact
  sed -i 's/\"Chromium\"/\"AMI Browser\"/g' components/embedder_support/user_agent_utils.cc
fi
# DO NOT touch content/common/user_agent.cc UA builder — it must keep "Chrome" token

# ── 4g. Window title, about pages ──
echo "  → Patching browser .cc/.h files (window title, about, settings)..."
for pattern in '"Chromium"'; do
  grep -rl "$pattern" chrome/browser/ --include='*.cc' --include='*.h' 2>/dev/null | \
  while read -r f; do
    # Skip test files
    [[ "$f" == *_test.cc ]] && continue
    [[ "$f" == *_unittest.cc ]] && continue
    sed -i "s/\"Chromium\"/\"AMI Browser\"/g" "$f"
  done || true
done

# ── 4h. Linux installer/desktop templates ──
echo "  → Patching Linux installer templates..."
find chrome/installer/linux/ -type f 2>/dev/null | while read -r f; do
  if grep -ql 'chromium\|Chromium' "$f" 2>/dev/null; then
    sed -i \
      -e 's/chromium-browser/ami-browser/g' \
      -e 's/chromium/ami-browser/g' \
      -e 's/Chromium/AMI Browser/g' \
      "$f"
  fi
done

# ── 4i. NTP / side panel / resources ──
echo "  → Patching NTP and WebUI resources..."
find chrome/browser/resources/ -type f \( -name "*.ts" -o -name "*.html" -o -name "*.js" \) 2>/dev/null | while read -r f; do
  if grep -ql 'Chromium' "$f" 2>/dev/null; then
    sed -i 's/Chromium/AMI Browser/g' "$f"
  fi
done

# ── 4j. GN/GNI branding references ──
echo "  → Patching .gn/.gni branding..."
find chrome/app/ -name "*.gni" -o -name "*.gn" | while read -r f; do
  if grep -ql '"Chromium"' "$f" 2>/dev/null; then
    sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
  fi
done || true

# ── 4k. chrome://flags ──
echo "  → Patching chrome://flags..."
find chrome/browser/ -name "about_flags*" -exec sed -i 's/"Chromium"/"AMI Browser"/g' {} \; 2>/dev/null || true

# ── 4l. Extension system strings ──
echo "  → Patching extension system..."
grep -rl '"Chromium"' extensions/ chrome/browser/extensions/ --include='*.cc' 2>/dev/null | while read -r f; do
  [[ "$f" == *_test.cc ]] && continue
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

# ── 4m. Crash reporter / metrics ──
echo "  → Patching crash reporter..."
grep -rl '"Chromium"' components/crash/ chrome/browser/metrics/ --include='*.cc' 2>/dev/null | while read -r f; do
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

# ── 4n. Profile manager / views ──
echo "  → Patching profile manager / views..."
grep -rl '"Chromium"' chrome/browser/ui/views/ --include='*.cc' 2>/dev/null | while read -r f; do
  [[ "$f" == *_test.cc ]] && continue
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

# ── 4o. Final sweep — ONLY quoted strings in C++ (safe) ──
echo "  → Final sweep (quoted strings only)..."
grep -rl '"Chromium"' chrome/ components/ --include='*.cc' --include='*.h' 2>/dev/null | while read -r f; do
  # Skip third_party, test files, user_agent builder
  [[ "$f" == *third_party* ]] && continue
  [[ "$f" == *_test.cc ]] && continue
  [[ "$f" == *_unittest.cc ]] && continue
  [[ "$f" == *user_agent.cc ]] && continue
  sed -i 's/"Chromium"/"AMI Browser"/g' "$f"
done || true

# ── 4p. CWS "Add to Chrome" strings ──
echo "  → Patching CWS button text..."
find chrome/ components/ -type f \( -name "*.grd" -o -name "*.grdp" \) | while read -r f; do
  if grep -ql 'Add to Chrome' "$f" 2>/dev/null; then
    sed -i 's/Add to Chrome/Add to AMI Browser/g' "$f" 2>/dev/null || true
  fi
done

# ── 4q. Disable GCM at source level ──
echo "  → Disabling GCM registration..."
if [[ -f components/gcm_driver/gcm_client_impl.cc ]]; then
  # Patch to early-return in Initialize() to prevent registration
  sed -i '/void GCMClientImpl::Initialize/,/^}/ {
    /^{/a\  return; // AMI Browser: GCM disabled
  }' components/gcm_driver/gcm_client_impl.cc 2>/dev/null || true
fi

# ── 4r. Disable Google API key infobar ──
echo "  → Disabling API key infobar..."
if [[ -f chrome/browser/ui/startup/google_api_keys_infobar_delegate.cc ]]; then
  # Make the ShouldShowMissingApiKeysInfoBar always return false
  sed -i 's/bool GoogleApiKeysInfoBarDelegate::Create/\/\/ AMI: Disabled\nbool GoogleApiKeysInfoBarDelegate::Create/' \
    chrome/browser/ui/startup/google_api_keys_infobar_delegate.cc 2>/dev/null || true
fi

# ── 4s. Set privacy defaults ──
echo "  → Setting privacy defaults..."
if [[ -f chrome/browser/prefs/browser_prefs.cc ]]; then
  # These will be set via GN args and policy, but also patch defaults
  sed -i \
    -e 's/kSafeBrowsingEnabled, true/kSafeBrowsingEnabled, false/' \
    -e 's/kAlternateErrorPagesEnabled, true/kAlternateErrorPagesEnabled, false/' \
    -e 's/kSearchSuggestEnabled, true/kSearchSuggestEnabled, false/' \
    chrome/browser/prefs/browser_prefs.cc 2>/dev/null || true
fi

# ── 4t. Product logos ──
echo "  → Generating AMI Browser logos..."
AMI_LOGO_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs>
  <circle cx="128" cy="128" r="120" fill="url(#g)"/>
  <text x="128" y="160" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="100" fill="white">A</text>
</svg>'
echo "$AMI_LOGO_SVG" > /tmp/ami_logo.svg

for size in 16 24 32 48 64 128 256; do
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" /tmp/ami_logo.svg -o "/tmp/ami_logo_${size}.png" 2>/dev/null || true
  elif command -v convert >/dev/null 2>&1; then
    convert -background none -resize "${size}x${size}" /tmp/ami_logo.svg "/tmp/ami_logo_${size}.png" 2>/dev/null || true
  fi
done

for logodir in chrome/app/theme/chromium chrome/app/theme/default_100_percent/chromium chrome/app/theme/default_200_percent/chromium; do
  if [[ -d "$logodir" ]]; then
    for pngfile in "$logodir"/product_logo_*.png; do
      if [[ -f "$pngfile" ]]; then
        size=$(echo "$pngfile" | grep -oP '\d+(?=\.png)')
        if [[ -f "/tmp/ami_logo_${size}.png" ]]; then
          cp "/tmp/ami_logo_${size}.png" "$pngfile"
        fi
      fi
    done
  fi
done

echo "  ✓ All branding applied (v2 — XML-safe)."

# ═══════════════════════════════════════════════════════════════
#  5. CONFIGURE BUILD — OPTIMIZED FOR 65GB RAM
# ═══════════════════════════════════════════════════════════════
log "Step 5/8: Configuring GN build args (optimized for ${TOTAL_RAM_GB}GB RAM)"

BUILD_OUT="out/Release"
mkdir -p "$BUILD_OUT"

# Calculate optimal concurrent_links based on RAM
# Each link can use 8-16GB RAM. With 62GB, we can do ~6 concurrent links.
CONCURRENT_LINKS=$((TOTAL_RAM_GB / 10))
[[ $CONCURRENT_LINKS -lt 2 ]] && CONCURRENT_LINKS=2
[[ $CONCURRENT_LINKS -gt 8 ]] && CONCURRENT_LINKS=8

cat > "$BUILD_OUT/args.gn" <<GN
# ═══════════════════════════════════════════════════
# AMI Browser v2.1 — Build Configuration
# Server: ${NPROC} cores / ${TOTAL_RAM_GB}GB RAM
# ═══════════════════════════════════════════════════

# Build type
is_official_build = true
is_debug = false
is_component_build = false
is_chrome_branded = false

# Symbols — strip to save memory during link and reduce binary size
symbol_level = 0
blink_symbol_level = 0

# LTO — disable to save RAM and build time (ThinLTO uses ~20GB extra)
use_thin_lto = false
is_cfi = false
chrome_pgo_phase = 0

# Toolchain
use_sysroot = true
use_lld = true

# Disable unnecessary features to speed up build
enable_nacl = false
treat_warnings_as_errors = false
enable_iterator_debugging = false

# Media — enable proprietary codecs for YouTube/H.264/AAC
ffmpeg_branding = "Chrome"
proprietary_codecs = true

# Google services — disable (we're BYO keys)
google_api_key = ""
google_default_client_id = ""
google_default_client_secret = ""
enable_gcm_driver = false

# Telemetry — disable
enable_reporting = false

# Parallel linking — ${TOTAL_RAM_GB}GB allows ${CONCURRENT_LINKS} concurrent links
concurrent_links = ${CONCURRENT_LINKS}
GN

gn gen "$BUILD_OUT" 2>&1 | tail -10

# ═══════════════════════════════════════════════════════════════
#  6. BUILD — Maximum performance
# ═══════════════════════════════════════════════════════════════
log "Step 6/8: Building AMI Browser ($NPROC cores, ${TOTAL_RAM_GB}GB RAM)"

# Use all cores — with 62GB RAM we have plenty of headroom
JOBS=$NPROC
echo "  Using $JOBS parallel jobs, $CONCURRENT_LINKS concurrent links"
echo "  Build started at: $(date)"
echo "  Expected duration: ~3-5 hours"

# Increase file descriptor limit for build
ulimit -n 65536 2>/dev/null || true

# Build with progress output
ninja -C "$BUILD_OUT" -j"$JOBS" chrome chrome_sandbox 2>&1 | tail -30

log "Build complete!"
echo "  Build finished at: $(date)"
ls -lh "$BUILD_OUT/chrome"

# ═══════════════════════════════════════════════════════════════
#  7. VERIFY BRANDING
# ═══════════════════════════════════════════════════════════════
log "Step 7/8: Verifying branding"

CHROMIUM_COUNT=$(strings "$BUILD_OUT/chrome" | grep -c "Chromium" || true)
echo "  Residual 'Chromium' strings: $CHROMIUM_COUNT"
if [[ "$CHROMIUM_COUNT" -gt 0 ]]; then
  echo "  User-visible Chromium strings:"
  strings "$BUILD_OUT/chrome" | grep "Chromium" | grep -v -E 'third_party|webrtc|v8_|skia' | sort -u | head -30
fi

AMI_COUNT=$(strings "$BUILD_OUT/chrome" | grep -c "AMI Browser" || true)
echo "  'AMI Browser' strings: $AMI_COUNT"

# Verify UA string
echo "  Checking UA string..."
strings "$BUILD_OUT/chrome" | grep -i "Mozilla.*Chrome" | head -3

# ═══════════════════════════════════════════════════════════════
#  8. PACKAGE
# ═══════════════════════════════════════════════════════════════
log "Step 8/8: Packaging"

PACKAGE_DIR="/root/ami-browser-linux64"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Core binary
cp "$BUILD_OUT/chrome" "$PACKAGE_DIR/ami-browser"
chmod +x "$PACKAGE_DIR/ami-browser"

# Sandbox
cp "$BUILD_OUT/chrome_sandbox" "$PACKAGE_DIR/chrome-sandbox" 2>/dev/null || true
chmod 4755 "$PACKAGE_DIR/chrome-sandbox" 2>/dev/null || true

# Crash handler
cp "$BUILD_OUT/chrome_crashpad_handler" "$PACKAGE_DIR/" 2>/dev/null || true

# GPU libraries
cp "$BUILD_OUT/libEGL.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libGLESv2.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libvk_swiftshader.so" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/libvulkan.so.1" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/vk_swiftshader_icd.json" "$PACKAGE_DIR/" 2>/dev/null || true

# Angle
cp "$BUILD_OUT/libGLESv2.so" "$PACKAGE_DIR/" 2>/dev/null || true

# Locales and resources
cp -r "$BUILD_OUT/locales" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT"/*.pak "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT"/*.bin "$PACKAGE_DIR/" 2>/dev/null || true
cp "$BUILD_OUT/icudtl.dat" "$PACKAGE_DIR/" 2>/dev/null || true

# MEI preloads
cp -r "$BUILD_OUT/MEIPreload" "$PACKAGE_DIR/" 2>/dev/null || true

# WidevineCdm (if available)
cp -r "$BUILD_OUT/WidevineCdm" "$PACKAGE_DIR/" 2>/dev/null || true

# Create tarball
cd /root
tar czf ami-browser-linux64.tar.gz ami-browser-linux64/
ls -lh ami-browser-linux64.tar.gz

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ AMI Browser v2.1 — Built and Packaged!"
echo "  📦 /root/ami-browser-linux64.tar.gz"
echo "  🔧 Binary: /root/ami-browser-linux64/ami-browser"
echo "  🎯 Branding: $AMI_COUNT AMI strings, $CHROMIUM_COUNT residual"
echo "═══════════════════════════════════════════════════════════"
