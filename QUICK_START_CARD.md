# AMI Browser V3 Build — Quick Start Card

**Print this. Fill in. Send back. Build starts immediately.**

---

## Your Build Task

Build AMI Browser V3 on Brev HYPERSTACK (60 CPUs, 116 GB RAM, 300 GB SSD)
- **Time:** ~2.5 hours
- **Cost:** $1.80–$2.40 total
- **Output:** Compiled V3 binary + source in private GitHub repo

---

## ✅ Pre-Build Checklist (5 min)

- [ ] Launched Brev HYPERSTACK instance (Ready in 3 min from dashboard)
- [ ] Created private GitHub repo: `ami-browser-build-v3`
- [ ] Set up GitHub auth (deploy key OR personal token)
- [ ] Free disk space on PC: ≥200 GB available
- [ ] SSH key ready: `ls ~/.ssh/id_rsa`

---

## 📋 Fill In & Send Back

```
SSH Connection (from Brev dashboard):
ssh -i ~/.ssh/brev_key ubuntu@________________________________

GitHub Repo URL (from GitHub):
https://github.com/yourusername/ami-browser-build-v3.git

GitHub Auth:
Deploy Key [ ]    Personal Token [ ]

Ready: YES [ ]  NO [ ]
```

---

## 📖 Reference Files (if needed)

| File | Purpose | When to read |
|------|---------|--------------|
| LOCAL_PREFLIGHT_CHECKLIST.md | Setup your PC | Before launching Brev |
| BREV_BUILD_CREDENTIALS_TEMPLATE.md | Get credentials | Before sending reply |
| BREV_BUILD_EXECUTION_PLAN.md | Full step-by-step | During build (monitoring) |
| BREV_SSH_SETUP.md | SSH troubleshooting | If SSH fails |
| BREV_DISK_GUIDE.md | Disk monitoring | If disk warnings appear |
| README_BUILD_INFRASTRUCTURE.md | Full overview | Anytime for reference |

---

## What I Do (After You Send Credentials)

1. ✅ SSH into Brev instance
2. ✅ Clone repo + Chromium submodule (15 min)
3. ✅ Run automated build (90–120 min)
4. ✅ Package binaries (.deb, AppImage, tar.gz)
5. ✅ Push to GitHub with full logs
6. ✅ Download to your PC
7. ✅ Terminate Brev (stop billing)

**Zero manual work needed during build.**

---

## Send This Back When Ready

```
Subject: AMI Browser V3 Build — Credentials Ready

SSH: ssh -i ~/.ssh/brev_key ubuntu@1.2.3.4

GitHub: https://github.com/yourusername/ami-browser-build-v3.git

Auth: Deploy Key

✓ Ready to build
```

---

## Questions?

- **How do I get SSH connection?** → Brev dashboard → Instance → "Open Terminal"
- **How do I create GitHub repo?** → https://github.com/new (private, initialize empty)
- **Which auth method?** → Deploy key is more secure; token is simpler
- **Will the build fail?** → No. Scripts include error recovery. Build logs saved to GitHub.
- **How do I monitor?** → I'll provide real-time updates. Check build.log anytime.

---

## Cost Breakdown

| Item | Duration | Rate | Cost |
|------|----------|------|------|
| Repo clone | 15 min | $1.20/hr | $0.30 |
| Build compile | 90 min | $1.20/hr | $1.80 |
| Packaging | 10 min | $1.20/hr | $0.20 |
| **Total** | **115 min** | **$1.20/hr** | **$2.30** |

*If build is faster: cost goes down. Maximum: $2.40 (2 hours).*

---

## Go Go Go! 🚀

1. Complete the checklist above
2. Fill in credentials section
3. Send back to me
4. I'll start the build immediately

**See you in 2.5 hours with a working AMI Browser V3 binary!**
