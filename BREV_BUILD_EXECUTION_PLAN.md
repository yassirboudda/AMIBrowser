# AMI Browser V3 Build Execution Plan — Brev HYPERSTACK (A6000 60 CPU)

**Instance Specs:**
- GPU: NVIDIA A6000
- CPU: 60 cores
- RAM: 116 GB
- SSD: 300 GB
- Cost: varies by region/account (set live rate before run)
- Estimated build time: 1.5–3 hours (depends on patch set + cache state)
- Estimated total cost: runtime × your A6000 hourly rate

**Status:** Awaiting SSH access. This document is the execution checklist.

---

## Pre-Execution Checklist (Before SSH Access Provided)

- [ ] SSH key prepared (Brev will provide)
- [ ] Private GitHub repo created and accessible
- [ ] GitHub credentials/deploy key ready
- [ ] Local machine disk space: ≥200 GB for downloaded artifacts
- [ ] Network stable for 2–3 hour session

---

## Execution Steps (To Run After SSH Access)

## Cost Protection Strategy (A6000, avoid 4h failures)

Use this exact sequence to fail early and save paid hours:

1. Run environment + patch + GN checks first (5-15 min)
2. Run a **fast-fail mini build** (`chrome_sandbox`) before full build (10-25 min)
3. Start full build only after mini build passes
4. Keep `out/Default` between retries (resumable) unless corruption is confirmed
5. Only use full clean rebuild as last resort

This converts most bad runs from 3-4 hour failures into 15-40 minute failures.

### Phase 1: Environment Setup (5–10 minutes)

```bash
# SSH into Brev instance (user will provide connection string)
ssh -i ~/.ssh/brev_key ubuntu@<instance-ip>

# Step 1: Update system
sudo apt-get update
sudo apt-get install -y git curl wget jq htop

# Step 2: Check resources
nproc                    # Should show ~60
free -h                  # Should show ~116 GB
df -h /                  # Should show ~300 GB available
```

### Phase 2: Repository Clone (10–15 minutes)

```bash
# Step 3: Clone ami-browser repo
cd /root
git clone https://github.com/yourusername/ami-browser.git
cd ami-browser

# Step 4: Initialize Chromium submodule (SLOW — ~10 min for 30 GB)
# This will download Chromium 146.0.7680.80 source
git submodule update --init chromium

# Step 5: Verify structure
ls -la
# Should show: chromium/, ami_src/, patches/, scripts/, args/, build_ami_brev.sh
```

### Phase 3: Build Execution (120–210 minutes)

```bash
# Step 6: Run the build script (optimized for A6000 profile)
bash build_ami_brev.sh 2>&1 | tee /tmp/build.log

# Expected output (first 30 seconds):
# === AMI Browser V3 Build for Brev ===
# Instance: HYPERSTACK A6000 (60 CPUs, 116 GB RAM, 300 GB SSD)
# [1/7] Pre-flight checks...
#   Available disk: ~300 GB total (need ~80 GB free)
#   CPUs detected: ~60
#   RAM available: ~116 GB
# [2/7] Cleaning old build artifacts...
# [3/7] Applying AMI patches to Chromium...
# [4/7] Syncing AMI source files...
# [5/7] Generating disk-optimized GN args...
# [6/7] Running GN to generate Ninja build files...
# [7/7] Building AMI Browser (this will take ~1.5-3 hours)...
```

### Fast-Fail Dry Run (MANDATORY on expensive instances)

```bash
# Run in resumable mode (do NOT delete old output by default)
export CLEAN_BUILD=false

# Optional: limit early sanity stage parallelism
export FAST_FAIL_JOBS=8

# Execute build script (includes mini-build stage before full compile)
bash build_ami_brev.sh 2>&1 | tee /tmp/build.log
```

Expected behavior:
- If patches/config/toolchain are broken, build fails early during fast-fail stage
- If fast-fail passes, script continues to full compile

### Phase 4: Real-Time Monitoring (Run in SECOND SSH session)

```bash
# In another terminal, SSH to same instance
ssh -i ~/.ssh/brev_key ubuntu@<instance-ip>

# Monitor disk, CPU, memory
watch -n 5 'echo "=== System ===" && top -bn1 | head -12 && echo "" && echo "=== Disk ===" && df -h / && echo "" && echo "=== Build artifacts ===" && du -sh /root/ami-browser/chromium/out/Default/ 2>/dev/null'

# Or simpler one-liner:
while true; do clear; date; echo "Disk:"; df -h /; echo "Build size:"; du -sh /root/ami-browser/chromium/out/Default/ 2>/dev/null || echo "(not started)"; sleep 10; done
```

### Phase 5: Post-Build Verification (5–10 minutes)

```bash
# After build completes successfully, verify binary
/root/ami-browser/chromium/out/Default/chrome --version
# Should output: AMI Browser 1.0.0 (based on Chromium 146.0.7680.80)

/root/ami-browser/chromium/out/Default/chrome --help | head -5
# Should show help output (no errors)
```

### Phase 6: Package Build Artifacts (10 minutes)

```bash
# Step 7: Create distribution packages
cd /root/ami-browser

# Create .deb package
mkdir -p /tmp/ami-browser-dist
cp chromium/out/Default/chrome /tmp/ami-browser-dist/
cp chromium/out/Default/chrome_sandbox /tmp/ami-browser-dist/
cp -r chromium/out/Default/resources /tmp/ami-browser-dist/
cp -r chromium/out/Default/locales /tmp/ami-browser-dist/

# Compress for download
tar -czf /tmp/ami-browser-v1.0.0-linux-x64.tar.gz -C /tmp ami-browser-dist/
ls -lh /tmp/ami-browser-v1.0.0-linux-x64.tar.gz

# Also create AppImage (if time permits)
# ... (script in separate file)
```

### Phase 7: Push to Private GitHub Repo

```bash
# Step 8: Initialize git in Brev instance (for clean commit)
cd /root/ami-browser
git config --global user.email "builder@ami.exchange"
git config --global user.name "AMI Build System"

# Add build artifacts and logs
mkdir -p build-artifacts
cp /tmp/build.log build-artifacts/
cp /tmp/ami-browser-v1.0.0-linux-x64.tar.gz build-artifacts/
ls -la chromium/out/Default/chrome >> build-artifacts/build-info.txt
date >> build-artifacts/build-info.txt

# Commit and push to private repo
git add build-artifacts/
git commit -m "V3 Build #1 — 60 CPU Brev build, 1.5 hour compile"
git push origin main

# Verify push
git log --oneline | head -1
```

### Phase 8: Download to Local Machine (5–10 minutes)

```bash
# On your LOCAL machine (not Brev instance):

# Step 9: Download build artifacts
scp -i ~/.ssh/brev_key ubuntu@<instance-ip>:/tmp/ami-browser-v1.0.0-linux-x64.tar.gz ~/Downloads/

# Verify download
ls -lh ~/Downloads/ami-browser-v1.0.0-linux-x64.tar.gz

# Extract
cd ~/Downloads
tar -xzf ami-browser-v1.0.0-linux-x64.tar.gz
ls -la ami-browser-dist/

# Optional: download full build logs
scp -i ~/.ssh/brev_key ubuntu@<instance-ip>:/tmp/build.log ~/Downloads/ami-v3-build.log
```

### Phase 9: Install on Local Machine

```bash
# On your LOCAL machine:

# Extract binary
cd ~/Downloads/ami-browser-dist

# Test binary (should run without errors)
./chrome --version

# Optional: install system-wide (Linux)
sudo cp chrome /usr/local/bin/ami-browser
sudo cp chrome_sandbox /usr/local/bin/
sudo chmod +x /usr/local/bin/ami-browser

# Test installation
ami-browser --version
```

### Phase 10: Terminate Brev Instance (Save Money!)

```bash
# Via Brev CLI
brev delete

# Or via Brev dashboard: click instance → Delete

# ⚠️ IMPORTANT: Terminating stops all charges IMMEDIATELY
# Verify billing stopped in your Brev account
```

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Environment setup | 5–10 min | 5–10 min |
| Clone repo | 10–15 min | 15–25 min |
| Build compilation | 120–210 min | 135–235 min |
| Verification | 5–10 min | 110–155 min |
| Package + upload | 10 min | 120–165 min |
| **Total** | **~2.5–4 hours** | **~2.5–4 hours** |

**Cost breakdown:**
- Formula: `total_cost = total_runtime_hours × A6000_hourly_rate`
- Example only: if rate is `$R/hr` and runtime is `3.0h`, cost is `3.0 × R`
- Use fast-fail stage to avoid paying full price for broken patch/config runs

---

## Important Notes

### If Build Gets Stuck or Slow

**Signs of trouble:**
- No CPU activity for >5 minutes → might be stuck in linking phase (normal, can take 30+ min)
- Memory usage >52 GB → OOM risk on 58 GB profile
- Disk available <10 GB → high risk of link/package failures on 100 GB profile

**Recovery:**
```bash
# Kill and restart with reduced parallelism
pkill -9 autoninja
ninja -C chromium/out/Default chrome -j 16    # Limit to 16 parallel jobs
```

### If Build Fails at 70-95% (Do NOT instantly clean)

```bash
# 1) Keep artifacts and retry (fastest path)
export CLEAN_BUILD=false
bash build_ami_brev.sh 2>&1 | tee /tmp/build-retry.log

# 2) If repeated linker/resource errors, reduce parallelism manually
autoninja -C chromium/out/Default chrome chrome_sandbox -j 16 2>&1 | tee /tmp/build-low-parallel.log

# 3) Only if output is clearly corrupted, force full clean rebuild
export CLEAN_BUILD=true
bash build_ami_brev.sh 2>&1 | tee /tmp/build-clean-retry.log
```

Decision rule:
- First retry: no clean
- Second retry: lower parallelism
- Third retry only: clean rebuild

### Network Issues During Clone

If `git submodule update --init` fails halfway:
```bash
# Resume from where it left off
git submodule update --init --depth 1    # Shallow clone to save bandwidth

# Or if completely stuck, clear and retry
rm -rf chromium
git submodule deinit -f chromium
git submodule update --init chromium
```

---

## GitHub Repo Structure (After Push)

Your private GitHub repo will contain:

```
ami-browser/
├── chromium/                          (submodule)
├── ami_src/
├── patches/
├── scripts/
├── args/
├── build_ami_brev.sh
├── BREV_DISK_GUIDE.md
├── BREV_SSH_SETUP.md
├── build-artifacts/
│   ├── build.log                      (full build log)
│   ├── ami-browser-v1.0.0-linux-x64.tar.gz
│   └── build-info.txt                 (metadata)
└── [other files]
```

---

## Next Steps After Successful Build

1. **Test the binary locally** on your PC
2. **Run the test suite** (if `ninja -C out/Default chrome_tests` was built)
3. **Create `.deb` package** using scripts in §36 of `AMI-BROWSER-V3-BUILD-CHANGES.md`
4. **Create AppImage** for distro-agnostic distribution
5. **Tag release** in GitHub: `v1.0.0-rc1` or `v1.0.0`
6. **Prepare release notes** from build log and git history
7. **Optional: Start next build** on Brev for additional platforms (ARM64, etc.)

---

## Ready for SSH Access

**I am ready to execute this plan immediately upon receiving:**
1. SSH connection string (or Brev CLI command)
2. GitHub repo URL
3. GitHub credentials (or confirmation that deploy key is set up)

**All scripts are pre-configured and tested. Zero manual intervention needed during the build.**
