# Brev Instance Setup & SSH Quick Start

## Step 1: Launch Instance on Brev

1. Go to https://brev.dev/environment/new?gpu=A6000
2. Select: **HYPERSTACK A6000** at **$0.60/hr**
3. Ensure specs show: **28 CPUs, 58 GB RAM, 100 GB SSD**
4. Click **Launch** (takes ~3 minutes to spin up)
5. Once ready, you'll see SSH connection info

## Step 2: SSH Into Instance

```bash
# Brev will give you a command like:
ssh -i ~/.ssh/brev_key ubuntu@1.2.3.4

# Or using the Brev CLI (if installed):
brev start ami-builder
```

## Step 3: Clone AMI Browser Repository

```bash
# On the Brev instance:
cd /root
git clone https://github.com/yourusername/ami-browser.git
cd ami-browser

# Initialize Chromium submodule
git submodule update --init chromium

# This takes ~10 minutes (30 GB download)
```

## Step 4: Run the Build Script

```bash
bash build_ami_brev.sh 2>&1 | tee full_build.log

# Or run with explicit path:
bash build_ami_brev.sh /root/ami-browser
```

**Expected output:**
```
=== AMI Browser V3 Build for Brev ===
Instance: HYPERSTACK A6000 (28 CPUs, 58 GB RAM, 100 GB SSD)
Budget: $2.00 max | Estimated: $1.50

[1/7] Pre-flight checks...
  Available disk: 98 GB (need ~80 GB)
  CPUs detected: 28
  RAM available: 56 GB
  
[2/7] Cleaning old build artifacts...
...
[7/7] Building AMI Browser (this will take 2-2.5 hours)...
```

## Step 5: Monitor Build (In Another Terminal)

```bash
# In a second SSH session to the same instance:
watch -n 5 'df -h /; du -sh /root/ami-browser/out/Default/'
```

## Step 6: After Build Completes

When successful, you'll see:
```
=== BUILD SUCCESSFUL ===
Build artifacts size: 48 GB
Remaining disk space: 32 GB

Binary location: chromium/out/Default/chrome
Sandbox location: chromium/out/Default/chrome_sandbox

Next steps:
  1. Test the binary: chromium/out/Default/chrome --version
  2. Package for distribution (see §36 in V3 BUILD PLAN)
```

## Step 7: Download Build Artifacts (Optional)

To download the compiled binary back to your local machine:

```bash
# On your LOCAL machine (not the Brev instance):
scp -i ~/.ssh/brev_key ubuntu@1.2.3.4:/root/ami-browser/chromium/out/Default/chrome ~/Downloads/ami-browser-v1.0.0

# Or entire build directory:
scp -r -i ~/.ssh/brev_key ubuntu@1.2.3.4:/root/ami-browser/chromium/out/Default/ ~/Downloads/ami-build/
```

## Step 8: Terminate Instance (Save Money)

Once build is complete and you've downloaded artifacts:

```bash
# On Brev dashboard or CLI:
brev stop  # or delete the instance

# You pay by the SECOND, so stopping saves money immediately
```

---

## Troubleshooting

### Build Hangs or Takes Too Long

**Check if linking phase is stuck:**
```bash
# In another SSH session:
ps aux | grep ninja
top -b | head -20
```

If you see `clang++ ... chrome` running for >5 minutes on a single core, the linking phase is slow. This is normal for the first compile. It can take 30+ minutes to link all the .o files together.

**If you're concerned about time/cost:**
- Stop with `Ctrl+C`
- Run with `-j 4` (reduced parallelism):
  ```bash
  ninja -C chromium/out/Default chrome -j 4
  ```
- This trades build speed for lower RAM usage (safer for OOM)

### Disk Space Warning

If you see: `[ERROR] Disk space critical! Build will fail.`

1. Stop the build: `Ctrl+C`
2. Clean ninja temp: `ninja -C chromium/out/Default -t clean`
3. Clear `out/Default/obj/` oldest files: `find chromium/out/Default/obj -type f -mtime +1 -delete`
4. Restart with `-j 2` (even lower parallelism)

### Out of Memory

If the system starts swapping heavily (top shows high swap %), the linking phase may crash.

**Solutions:**
1. Close other SSH sessions (to reduce load)
2. Restart with `-j 2` or `-j 1` (single-threaded)
3. Ensure no other large processes: `ps aux | grep -v bash`

---

## Cost Tracker

| Phase | Time | Cost |
|-------|------|------|
| Source clone | 10 min | $0.10 |
| Patches + setup | 10 min | $0.10 |
| Build (compilation) | 120 min | $1.20 |
| Build (linking) | 30 min | $0.30 |
| Testing + download | 20 min | $0.20 |
| **Total** | **190 min** | **$1.90** ✅ |

**You stay well under $2 budget.**

---

## Next After Build

See `AMI-BROWSER-V3-BUILD-CHANGES.md` §36 for:
- How to package the binary into `.deb`, `.rpm`, AppImage
- How to sign and distribute
- Testing checklist before release
