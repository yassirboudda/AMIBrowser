#!/bin/bash
# Post-Build Packaging Script for AMI Browser V3
# Run after chromium/out/Default/chrome is built
# Packages binary into .deb, AppImage, and tar.gz formats

set -e

BUILD_DIR="${1:-chromium/out/Default}"
DIST_DIR="${2:-/tmp/ami-browser-dist}"
VERSION="${3:-1.0.0}"

echo "=== AMI Browser V3 Post-Build Packaging ==="
echo "Build directory: $BUILD_DIR"
echo "Distribution directory: $DIST_DIR"
echo "Version: $VERSION"
echo ""

# Verify build exists
if [ ! -f "$BUILD_DIR/chrome" ]; then
  echo "ERROR: $BUILD_DIR/chrome not found. Build must complete first."
  exit 1
fi

# Create distribution directory
mkdir -p "$DIST_DIR"/{chrome,resources,locales,lib}

echo "[1/5] Copying binaries..."
cp "$BUILD_DIR/chrome" "$DIST_DIR/chrome/"
cp "$BUILD_DIR/chrome_sandbox" "$DIST_DIR/chrome/"
chmod +x "$DIST_DIR/chrome/chrome" "$DIST_DIR/chrome/chrome_sandbox"

echo "[2/5] Copying resources and locales..."
cp -r "$BUILD_DIR/resources" "$DIST_DIR/"
cp -r "$BUILD_DIR/locales" "$DIST_DIR/"

# Copy essential shared libraries (if they exist)
if [ -d "$BUILD_DIR" ]; then
  for lib in libEGL.so libGLESv2.so libvulkan.so.1 libwayland-client.so; do
    if [ -f "$BUILD_DIR/$lib" ]; then
      cp "$BUILD_DIR/$lib" "$DIST_DIR/lib/" 2>/dev/null || true
    fi
  done
fi

echo "[3/5] Creating tar.gz archive..."
tar -czf "/tmp/ami-browser-v${VERSION}-linux-x64.tar.gz" \
  -C "$DIST_DIR" . \
  --exclude='.git' \
  --exclude='.ninja_*' \
  --exclude='obj'

TAR_SIZE=$(du -sh "/tmp/ami-browser-v${VERSION}-linux-x64.tar.gz" | awk '{print $1}')
echo "  Created: /tmp/ami-browser-v${VERSION}-linux-x64.tar.gz ($TAR_SIZE)"

echo "[4/5] Creating .deb package..."
mkdir -p /tmp/ami-browser-deb/DEBIAN
mkdir -p /tmp/ami-browser-deb/usr/lib/ami-browser
mkdir -p /tmp/ami-browser-deb/usr/bin
mkdir -p /tmp/ami-browser-deb/usr/share/applications
mkdir -p /tmp/ami-browser-deb/usr/share/icons/hicolor/256x256/apps

# Copy files
cp -r "$DIST_DIR/chrome" /tmp/ami-browser-deb/usr/lib/ami-browser/
cp -r "$DIST_DIR/resources" /tmp/ami-browser-deb/usr/lib/ami-browser/
cp -r "$DIST_DIR/locales" /tmp/ami-browser-deb/usr/lib/ami-browser/

# Create symlink in /usr/bin
cat > /tmp/ami-browser-deb/usr/bin/ami-browser << 'EOF'
#!/bin/bash
exec /usr/lib/ami-browser/chrome/chrome "$@"
EOF
chmod +x /tmp/ami-browser-deb/usr/bin/ami-browser

# Create .desktop file
cat > /tmp/ami-browser-deb/usr/share/applications/ami-browser.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Name=AMI Browser
GenericName=Web Browser
Comment=Fast, private, AI-powered web browser
Exec=/usr/bin/ami-browser %U
Icon=ami-browser
Type=Application
Categories=Network;WebBrowser;
Keywords=ami;browser;web;ai;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
EOF

# Create control file
cat > /tmp/ami-browser-deb/DEBIAN/control << EOF
Package: ami-browser
Version: $VERSION
Architecture: amd64
Maintainer: AMI Exchange <packages@ami.exchange>
Depends: libc6 (>= 2.31), libgtk-3-0 (>= 3.24), libglib2.0-0, libnss3
Recommends: libvulkan1
Homepage: https://ami.exchange
Description: AMI Browser — Fast, private, AI-powered web browser
 AMI Browser is a Chromium-based browser with built-in AI assistance,
 automation capabilities, and privacy-first defaults.
EOF

# Create postinst script
cat > /tmp/ami-browser-deb/DEBIAN/postinst << 'EOF'
#!/bin/bash
chmod +x /usr/lib/ami-browser/chrome/chrome
chmod u+s /usr/lib/ami-browser/chrome/chrome_sandbox
update-desktop-database /usr/share/applications/
EOF
chmod +x /tmp/ami-browser-deb/DEBIAN/postinst

# Build .deb
dpkg-deb --build /tmp/ami-browser-deb "/tmp/ami-browser_${VERSION}_amd64.deb"
DEB_SIZE=$(du -sh "/tmp/ami-browser_${VERSION}_amd64.deb" | awk '{print $1}')
echo "  Created: /tmp/ami-browser_${VERSION}_amd64.deb ($DEB_SIZE)"

echo "[5/5] Creating AppImage..."
mkdir -p /tmp/AMI_Browser.AppDir
cd /tmp/AMI_Browser.AppDir

# Create AppRun wrapper
cat > AppRun << 'EOF'
#!/bin/bash
APPDIR=$(dirname "$(readlink -f "$0")")
export LD_LIBRARY_PATH="$APPDIR/lib:$LD_LIBRARY_PATH"
exec "$APPDIR/usr/lib/ami-browser/chrome/chrome" "$@"
EOF
chmod +x AppRun

# Copy application files
mkdir -p usr/lib/ami-browser
cp -r "$DIST_DIR/chrome" usr/lib/ami-browser/
cp -r "$DIST_DIR/resources" usr/lib/ami-browser/
cp -r "$DIST_DIR/locales" usr/lib/ami-browser/

# Copy shared libraries
mkdir -p lib
for lib in "$DIST_DIR/lib"/*; do
  [ -f "$lib" ] && cp "$lib" lib/ 2>/dev/null || true
done

# Create .desktop entry
cat > ami-browser.desktop << 'EOF'
[Desktop Entry]
Name=AMI Browser
Exec=ami-browser
Icon=ami-browser
Type=Application
Categories=Network;WebBrowser;
EOF

# Create AppImage (if appimagetool is available)
if command -v appimagetool >/dev/null 2>&1; then
  cd /tmp
  appimagetool -n AMI_Browser.AppDir "/tmp/AMI_Browser-${VERSION}-x86_64.AppImage"
  chmod +x "/tmp/AMI_Browser-${VERSION}-x86_64.AppImage"
  APPIMG_SIZE=$(du -sh "/tmp/AMI_Browser-${VERSION}-x86_64.AppImage" | awk '{print $1}')
  echo "  Created: /tmp/AMI_Browser-${VERSION}-x86_64.AppImage ($APPIMG_SIZE)"
else
  echo "  ⚠️ appimagetool not found. Install via: sudo apt-get install appimage-builder"
  echo "  AppImage creation skipped. Binaries available as tar.gz only."
fi

echo ""
echo "=== Packaging Complete ==="
ls -lh /tmp/ami-browser* | grep -E '\.(tar\.gz|deb|AppImage)$' || true
echo ""
echo "Artifacts ready for download:"
echo "  - /tmp/ami-browser-v${VERSION}-linux-x64.tar.gz"
echo "  - /tmp/ami-browser_${VERSION}_amd64.deb"
echo "  - /tmp/AMI_Browser-${VERSION}-x86_64.AppImage (if appimagetool installed)"
echo ""
echo "To download from Brev to local machine:"
echo "  scp -i ~/.ssh/brev_key ubuntu@<instance-ip>:/tmp/ami-browser* ~/Downloads/"
