# Brev Chromium Build — Disk Space Breakdown

**Target Instance:** HYPERSTACK A6000 ($0.60/hr)
**SSD Size:** 100 GB
**Estimated Total Usage:** ~80 GB
**Safety Buffer:** ~20 GB

## Disk Usage by Component

| Component | Size | Notes |
|-----------|------|-------|
| Chromium source (`chromium/`) | ~30 GB | Git repo + .git objects |
| Build output (`out/Default/`) | ~50 GB | Compiled objects, intermediate files |
| AMI patches & source | ~2 GB | `ami_src/`, `patches/` |
| Build logs & temp | ~1 GB | `build.log`, ninja temp files |
| **Total** | **~83 GB** | Leave 17 GB free for safety |

## Space Savings from Our Flags

| Flag | Space saved | Impact |
|------|-------------|--------|
| `symbol_level = 0` | 20–30 GB | No debug symbols (acceptable for release) |
| `is_component_build = true` | 5–10 GB | Splits monolithic binary into libs |
| `enable_nacl = false` | 1–2 GB | Removes deprecated Native Client |
| `use_lld = true` | 2–3 GB | LLVM linker is lighter than GNU ld |
| `blink_symbol_level = 0` | 3–5 GB | Blink JS engine symbols removed |
| **Total** | **31–50 GB** | Makes fit possible in 100 GB |

## Pre-Build Cleanup

If you're concerned about space, run on the Brev instance:

```bash
# Remove unnecessary packages
sudo apt-get autoremove -y
sudo apt-get clean

# Check current disk usage
df -h /
du -sh /* | sort -rh | head -10

# Ensure /tmp doesn't fill up (ninja uses it)
du -sh /tmp
rm -rf /tmp/ninja-*
```

## During Build — Live Monitoring

In **another SSH terminal** to the same instance:

```bash
# Monitor every 5 seconds (lightweight)
watch -n 5 'echo "=== Disk ===" && df -h / && echo "" && echo "=== Build artifacts ===" && du -sh /path/to/out/Default/'

# Or more detailed (CPU, memory, disk together):
while true; do
  clear
  echo "=== Chromium Build Progress ==="
  date
  echo ""
  echo "Disk:"
  df -h / | awk 'NR==2 {printf "  Used: %s / Available: %s (%.1f%%)\n", $3, $4, ($3/($3+$4))*100}'
  echo ""
  echo "Build artifacts:"
  du -sh out/Default/ 2>/dev/null || echo "  (not yet created)"
  echo ""
  echo "System load:"
  uptime | awk -F'load average:' '{print $2}'
  echo ""
  echo "Memory:"
  free -h | awk 'NR==2 {printf "  Used: %s / Total: %s\n", $3, $2}'
  sleep 5
done
```

## If Disk Fills During Build

If you hit >95% disk usage:

1. **Stop the build immediately:**
   ```bash
   pkill autoninja
   ```

2. **Identify space hogs:**
   ```bash
   du -sh out/Default/* | sort -rh | head -10
   ```

3. **Clear ninja temp files:**
   ```bash
   ninja -C out/Default -t clean
   rm -rf out/Default/.ninja_*
   ```

4. **Restart build with reduced parallelism** (uses less temp space):
   ```bash
   ninja -C out/Default chrome -j 4   # Limit to 4 parallel jobs
   ```

## Cost Calculation

**Scenario: Build takes 2.5 hours**
```
2.5 hours × $0.60/hr = $1.50
Remaining from $10 credit: $8.50
Remaining from $2 budget: $0.50
```

**Scenario: Build takes 3 hours (with -j 4 restart)**
```
3 hours × $0.60/hr = $1.80
Remaining from $2 budget: $0.20 (still within budget!)
```

---

## Quick Reference

**Command to run on Brev instance:**
```bash
cd /root/ami-browser  # or wherever you clone it
bash build_ami_brev.sh
```

This script automates all 7 steps, monitors disk, and gives you real-time feedback.
