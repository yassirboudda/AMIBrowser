#!/usr/bin/env python3
import argparse
import os
import re
import sys
from typing import Tuple

# Keep replacements conservative: patch only user-visible message text.
TEXT_REPLACEMENTS = [
    ("Chromium", "AMI Browser"),
    ("chromium-browser", "ami-browser"),
    ("chromium", "ami-browser"),
]

MESSAGE_PATTERN = re.compile(r"(<message\b[^>]*>)(.*?)(</message>)", re.DOTALL | re.IGNORECASE)
TRANSLATION_PATTERN = re.compile(r"(<translation\b[^>]*>)(.*?)(</translation>)", re.DOTALL | re.IGNORECASE)


def apply_replacements(text: str) -> Tuple[str, int]:
    count = 0
    out = text
    for old, new in TEXT_REPLACEMENTS:
        c = out.count(old)
        if c:
            out = out.replace(old, new)
            count += c
    return out, count


def replace_text_outside_tags(fragment: str) -> Tuple[str, int]:
    parts = re.split(r"(<[^>]+>)", fragment)
    total = 0
    for idx in range(0, len(parts), 2):
        replaced, count = apply_replacements(parts[idx])
        parts[idx] = replaced
        total += count
    return "".join(parts), total


def patch_file(path: str, pattern: re.Pattern) -> Tuple[bool, int]:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            original = f.read()
    except OSError:
        return False, 0

    replaced_total = 0

    def repl(match: re.Match) -> str:
        nonlocal replaced_total
        open_tag, inner, close_tag = match.group(1), match.group(2), match.group(3)
        patched_inner, count = replace_text_outside_tags(inner)
        replaced_total += count
        return f"{open_tag}{patched_inner}{close_tag}"

    patched = pattern.sub(repl, original)
    if patched != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(patched)
        return True, replaced_total

    return False, replaced_total


def iter_targets(root: str, rel_paths):
    for rel in rel_paths:
        base = os.path.join(root, rel)
        if not os.path.isdir(base):
            continue
        for dirpath, _, filenames in os.walk(base):
            for name in filenames:
                if name.endswith((".grd", ".grdp", ".xtb")):
                    yield os.path.join(dirpath, name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely patch branding text in .grd/.grdp/.xtb message bodies only")
    parser.add_argument("--root", default=".", help="Chromium src root")
    parser.add_argument("--paths", nargs="+", default=["chrome", "components", "ui", "content"], help="Relative paths to scan")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    changed_files = 0
    total_replacements = 0

    for path in iter_targets(root, args.paths):
        pattern = TRANSLATION_PATTERN if path.endswith(".xtb") else MESSAGE_PATTERN
        changed, replaced_count = patch_file(path, pattern)
        total_replacements += replaced_count
        if changed:
            changed_files += 1

    print(f"safe_branding_patch: changed_files={changed_files} text_replacements={total_replacements}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
