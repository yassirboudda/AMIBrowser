# Brev Build Credentials — Copy & Fill This In

**Use this template to provide the three required details for immediate build execution.**

---

## Step 1: Get SSH Connection Details

### From Brev Dashboard:
1. Go to https://brev.dev/dashboard
2. Find your HYPERSTACK instance
3. Click **"Open Terminal"** or **"SSH"**
4. Copy the SSH command shown

### Option A: Direct SSH
```
ssh -i ~/.ssh/brev_key ubuntu@1.2.3.4
```

### Option B: Using Brev CLI
```
brev open
```

---

## Step 2: Get GitHub Repo URL

### Create Private Repo:
1. Go to https://github.com/new
2. Name: `ami-browser-build-v3`
3. Visibility: **Private**
4. Create
5. Copy HTTPS URL: `https://github.com/yourusername/ami-browser-build-v3.git`

---

## Step 3: GitHub Authentication

### Option A: Deploy Key (Recommended - More Secure)
```bash
# Generate deploy key (if not already done):
ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_deploy_key

# Add to GitHub:
# 1. Go to repo → Settings → Deploy keys
# 2. Click "Add deploy key"
# 3. Paste contents of ~/.ssh/github_deploy_key.pub
# 4. ✅ Check "Allow write access"
# 5. Add key

# Status: ✅ READY
```

### Option B: Personal Access Token (Simpler)
```bash
# Create token at: https://github.com/settings/tokens/new
# Scopes needed: repo (full control)
# Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Will be used as: git clone https://<TOKEN>@github.com/yourusername/ami-browser-build-v3.git
```

---

## FILL IN BELOW & SEND TO AGENT

```
=== BREV BUILD CREDENTIALS ===

SSH Connection:
ssh -i ~/.ssh/brev_key ubuntu@

GitHub Repo URL:
https://github.com/yourusername/ami-browser-build-v3.git

GitHub Auth Method:
[ ] Deploy Key (fingerprint: ________________)
[ ] Personal Access Token (token: ghp_______________)

Ready to build: YES / NO
```

---

## What Happens Next

Once you send the three details above, I will:

1. **SSH into Brev** using your connection command
2. **Clone your repo** with Chromium submodule (~15 min)
3. **Run build_ami_brev.sh** (90–120 min, fully automated)
4. **Package binaries** into .deb, AppImage, tar.gz
5. **Push to GitHub** with full build logs
6. **Download artifacts** to your local machine
7. **Terminate Brev** to stop billing

**Total time:** ~2.5 hours
**Total cost:** $1.80–$2.40

---

## Pre-Build Checklist (Before Sending Credentials)

- [ ] Brev HYPERSTACK instance launched (Ready in 3 min)
- [ ] GitHub private repo created
- [ ] GitHub auth method configured (deploy key or token)
- [ ] Local disk: ≥200 GB free space available
- [ ] SSH key permissions: `chmod 600 ~/.ssh/brev_key`

---

## Send This Format

When ready, reply with:

```
SSH Connection: ssh -i ~/.ssh/brev_key ubuntu@1.2.3.4

GitHub Repo: https://github.com/yourusername/ami-browser-build-v3.git

GitHub Auth: Deploy Key

✓ Ready to build
```

**I will start immediately upon receiving this.**

---

## Support

- **SSH Issues?** See [BREV_SSH_SETUP.md](BREV_SSH_SETUP.md)
- **Disk Monitoring?** See [BREV_DISK_GUIDE.md](BREV_DISK_GUIDE.md)
- **Full Execution Plan?** See [BREV_BUILD_EXECUTION_PLAN.md](BREV_BUILD_EXECUTION_PLAN.md)
- **Local Setup?** See [LOCAL_PREFLIGHT_CHECKLIST.md](LOCAL_PREFLIGHT_CHECKLIST.md)

---

**Copy & fill in the section above, then send it. Build will start immediately.**
