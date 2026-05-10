# Local Machine Pre-Flight Checklist — Before SSH Access

Complete this checklist on your PC BEFORE you provide SSH access to the Brev instance. This ensures zero delays once the build starts.

---

## GitHub Setup

- [ ] **Create private GitHub repo** named `ami-browser-build-v3`
  - Go to https://github.com/new
  - Owner: your account
  - Repository name: `ami-browser-build-v3`
  - Visibility: **Private**
  - Initialize: ✅ Add .gitignore (Node.js or just leave empty)
  - Click **Create repository**

- [ ] **Create GitHub deploy key** (for passwordless push from Brev)
  1. Go to repo → Settings → Deploy keys
  2. Click "Add deploy key"
  3. Title: `Brev Build System`
  4. Paste your SSH public key (`cat ~/.ssh/id_rsa.pub`)
  5. ✅ Allow write access
  6. Click "Add key"

  **Alternative (if deploy key too complex):** Use your GitHub personal access token instead (less secure but simpler):
  1. Go to Settings → Developer settings → Personal access tokens (classic)
  2. Generate new token with `repo` scope
  3. Save token securely (you'll need it during build)

- [ ] **Verify repo is accessible:**
  ```bash
  # On your local machine
  git clone https://github.com/yourusername/ami-browser-build-v3.git
  cd ami-browser-build-v3
  echo "test" > README.md
  git add .
  git commit -m "test"
  git push origin main
  ```
  If push succeeds, you're ready. If it fails, fix auth before starting build.

---

## Local Machine Resources

- [ ] **Free disk space:** At least 200 GB available
  ```bash
  df -h /
  # Look for Available column — should show ≥200 GB
  ```

- [ ] **SSH key ready:**
  ```bash
  ls -la ~/.ssh/id_rsa
  # If file doesn't exist:
  ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
  ```

- [ ] **SSH client installed:**
  ```bash
  which ssh
  # Should output: /usr/bin/ssh (Linux/Mac) or C:\Windows\System32\OpenSSH\ssh.exe (Windows)
  ```

- [ ] **SCP available (for file download):**
  ```bash
  which scp
  # Should output: /usr/bin/scp (Linux/Mac)
  ```

---

## Create Local Download Directory

```bash
mkdir -p ~/Downloads/ami-browser-build-v3
cd ~/Downloads/ami-browser-build-v3
pwd  # Note this path
```

---

## Install Optional Tools (Recommended)

These tools help you work with the downloaded binary after the build:

### Linux (Ubuntu/Debian)

```bash
# For testing the binary
sudo apt-get install -y \
  libgtk-3-0 \
  libglib2.0-0 \
  libnss3 \
  libvulkan1 \
  fonts-liberation

# For creating/working with .deb packages
sudo apt-get install -y \
  dpkg-dev \
  fakeroot

# For working with AppImage files
sudo apt-get install -y appimage-builder
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install -y \
  gtk3 \
  glib2 \
  nss \
  vulkan-loader \
  liberation-fonts \
  rpm-build \
  rpmdevtools
```

### macOS

```bash
# Chromium on macOS needs Xcode command line tools
xcode-select --install

# If you want to test the Linux binary in Docker:
brew install docker
```

### Windows (WSL2)

If using Windows Subsystem for Linux 2:

```bash
# Install in Ubuntu on WSL2:
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libglib2.0-0 libnss3
```

---

## Network & Connectivity

- [ ] **Stable internet connection** — The build will take 1.5–2 hours. Ensure:
  - WiFi is stable (or use Ethernet if possible)
  - No scheduled network maintenance during build window
  - VPN (if used) is stable and won't disconnect

- [ ] **Firewall allows SSH:** 
  ```bash
  # Test SSH connectivity (we'll get the IP from Brev)
  ssh -v -i ~/.ssh/id_rsa ubuntu@test-ip 2>&1 | grep -i "refused\|timeout\|error"
  # Should succeed or show "Connection refused" (normal if IP not ready yet)
  ```

---

## Prepare SSH Connection Details

When you launch the Brev instance, Brev will provide a command like:

```bash
ssh -i /path/to/key ubuntu@1.2.3.4
```

**Save this somewhere handy:**
```bash
# Create a file for reference
cat > ~/brev-ssh-command.txt << 'EOF'
[PASTE SSH COMMAND FROM BREV HERE]
EOF

chmod 600 ~/brev-ssh-command.txt
```

---

## Summary Sheet (For Quick Reference During Build)

Print or bookmark this:

| Step | Command | Time |
|------|---------|------|
| SSH to Brev | `ssh -i ~/.ssh/key ubuntu@1.2.3.4` | — |
| Clone repo | `git clone ...` | 15 min |
| Run build | `bash build_ami_brev.sh` | 90–120 min |
| Monitor (2nd terminal) | `watch -n 5 'df -h /'` | Throughout |
| Verify binary | `./chromium/out/Default/chrome --version` | 1 min |
| Package | `bash package_ami_brev.sh` | 10 min |
| Push to GitHub | `git push origin main` | 2 min |
| Download to PC | `scp ubuntu@1.2.3.4:/tmp/ami-*.tar.gz ~/Downloads/` | 5–10 min |
| Terminate Brev | `brev delete` (or via dashboard) | — |

---

## Ready Signal

Once you've completed this checklist, you're ready to provide SSH access. When you do, include:

1. **SSH connection string** (e.g., `ssh -i ~/.ssh/id_rsa ubuntu@1.2.3.4`)
2. **GitHub repo URL** (e.g., `https://github.com/yourusername/ami-browser-build-v3.git`)
3. **GitHub authentication method:**
   - Deploy key fingerprint, OR
   - Personal access token (will be used in `git config --global credential.helper`)

---

## Troubleshooting Pre-Flight Issues

### Can't clone the private repo?
```bash
# If using SSH key:
ssh-add ~/.ssh/id_rsa
git clone git@github.com:yourusername/ami-browser-build-v3.git

# If using token:
git clone https://<TOKEN>@github.com/yourusername/ami-browser-build-v3.git
```

### SSH key permission error?
```bash
chmod 600 ~/.ssh/id_rsa
chmod 600 ~/.ssh/id_rsa.pub
```

### Not enough disk space?
```bash
# Check what's taking space:
du -sh ~/* | sort -rh | head -10

# Suggestions:
# - Move old downloads to external drive
# - Clear package manager cache: sudo apt clean
# - Delete old Docker images: docker system prune
```

---

## Final Confirmation

Once this checklist is 100% complete, reply with:

```
✅ Pre-flight checklist complete. Ready for SSH access.

Brev instance specs:
- 60 CPUs
- 116 GB RAM
- 300 GB SSD
- $1.20/hr

SSH details [PASTE when instance launches]:
```

Then paste the SSH command and GitHub repo URL, and I'll execute the build immediately.
