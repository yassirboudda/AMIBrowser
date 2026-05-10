# AMI Browser V3 Preparation Tracker

Last updated: 2026-05-10

## Goal

Track what is prepared vs. missing from AMI Browser V3 requirements before the next full rebuild and release.

## Verified Current State

1. Local installed binary is AMI Browser 146.0.7680.80.
2. Published GitHub release exists for v3.0.0.
3. Hub extension version has been bumped to 3.0.0.
4. Build scripts now include broader logo replacement logic for SVG, PNG, and ICO assets.
5. Build scripts now report logo replacement counts at build time.

## Phase 1 Foundation Status (from V3 plan)

| Item | Requirement Source | Status | Notes |
|---|---|---|---|
| V2 critical bug fixes (9 items) | AMI-BROWSER-V3-BUILD-CHANGES.md section 1 | PARTIAL | Some fixes applied ad-hoc in prior iterations, no full verification matrix yet |
| Embedded core extensions (non-removable) | section 20 | PARTIAL | Extensions are loaded, but still launcher-based, not fully force-installed component extensions |
| Default settings and privacy hardening | section 21 | PARTIAL | Some runtime flags exist; full compile-time parity not verified |
| Color system and logo replacements | sections 22.1 and 22.20 | PARTIAL | Build scripts upgraded; needs fresh rebuild to take effect in binary resources |
| Tab strip overhaul | sections 22.2 and 22.3 | NOT STARTED | Requires C++ UI work |
| Omnibox floating rounded UI | section 22.4 | NOT STARTED | Requires C++ UI work |
| Toolbar compact custom icons | section 22.5 | NOT STARTED | Requires C++ UI work |
| Window frame and title bar | section 22.12 | NOT STARTED | Requires native frame UI work |
| Typography bundle and usage | section 22.21 | NOT STARTED | Requires font packaging plus UI wiring |
| Chat-first native NTP WebUI | section 5 | NOT STARTED | Current behavior still extension-driven |

## High Priority Gaps To Prepare Next

1. Build-time verification script for section 1 critical bugs (automated pass/fail checks).
2. Rebuild-run checklist for logo and internal page resource replacement proof.
3. Post-build visual smoke tests for chrome://settings, chrome://history, chrome://downloads, chrome://extensions.
4. Force-installed core extension migration plan from launcher flags to component loader path.

## Build Script Preparation Completed In This Repo

1. build/build-ami-browser.sh
   - Added AMI logo source support.
   - Added chrome_logo SVG replacement sweeps.
   - Added PNG and ICO logo replacement sweeps.
   - Added replacement counters for SVG, PNG, and ICO.
2. build/resume-build.sh
   - Added same logo replacement coverage and counters as full build script.

## Next Execution Batch Once New Build Server Is Ready

1. Sync latest main branch.
2. Run resume or full build script with updated branding logic.
3. Capture and store replacement counters from build logs.
4. Package and publish new tarball to v3.0.0 (or v3.0.1).
5. Install on local machine.
6. Validate visual identity pages and extension badge version.
