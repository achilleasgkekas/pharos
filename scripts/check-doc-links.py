#!/usr/bin/env python3
"""Check every relative link and #anchor in the Markdown docs.

Run from the repository root: `python3 scripts/check-doc-links.py`. Exits non-zero and lists
each broken link. External (http/https/mailto) links are not fetched: CI must not fail because
someone else's site is down.
"""
import glob
import os
import re
import sys

FILES = sorted(
    set(glob.glob('docs/*.md'))
    | {f for f in ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'API.md', 'ROADMAP.md', 'CODE_OF_CONDUCT.md'] if os.path.exists(f)}
    | set(glob.glob('apps/*/README.md'))
    | set(glob.glob('services/*/README.md'))
    | set(glob.glob('deploy/*.md'))
)

FENCE = re.compile(r'```.*?```', re.S)
HEADING = re.compile(r'^#{1,6} (.+?)\s*#*\s*$', re.M)
MD_LINK = re.compile(r'\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
HTML_LINK = re.compile(r'(?:src|href)="([^"]+)"')


def slug(heading: str) -> str:
    """GitHub's anchor for a heading: lower case, punctuation dropped, spaces to dashes."""
    h = re.sub(r'`([^`]*)`', r'\1', heading.strip().lower())
    h = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', h)
    h = re.sub(r'[^\w\- ]', '', h)
    return h.replace(' ', '-')


def anchors(path: str) -> set:
    text = FENCE.sub('', open(path, encoding='utf-8').read())
    seen: dict = {}
    out = set()
    for h in HEADING.findall(text):
        s = slug(h)
        n = seen.get(s, 0)
        out.add(s if n == 0 else f'{s}-{n}')
        seen[s] = n + 1
    return out


def main() -> int:
    cache: dict = {}
    broken = []
    for f in FILES:
        text = FENCE.sub('', open(f, encoding='utf-8').read())
        for link in MD_LINK.findall(text) + HTML_LINK.findall(text):
            if link.startswith(('http://', 'https://', 'mailto:')):
                continue
            path, _, anchor = link.partition('#')
            target = os.path.normpath(os.path.join(os.path.dirname(f), path)) if path else os.path.normpath(f)
            if not os.path.exists(target):
                broken.append(f'{f}: missing file {link}')
                continue
            if anchor and target.endswith('.md'):
                if target not in cache:
                    cache[target] = anchors(target)
                if anchor not in cache[target]:
                    broken.append(f'{f}: missing anchor {link}')
    for b in broken:
        print(b)
    print(f'{len(FILES)} files checked, {len(broken)} broken link(s)')
    return 1 if broken else 0


if __name__ == '__main__':
    sys.exit(main())
