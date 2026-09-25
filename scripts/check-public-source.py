#!/usr/bin/env python3
"""Reject private operational files in the Git index; never print file contents.

This is a regression guard, not a substitute for a secret/history audit before
publishing a formerly private repository.
"""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], text=True).strip())
entries = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root)
private_names = {
    'CLAUDE.md', 'AGENTS.md', 'OWNER_DECISIONS.md', 'DEPLOY_LOG.md',
    'MIGRATION_PROXMOX.md', 'CLOUD_GUARD.md', 'PRODUCT_BACKLOG.md',
    'WEB_DEBT.md', 'STATUS.md', 'TODO.md',
}
failures = []
for entry in entries.split(b'\0'):
    if not entry:
        continue
    metadata, raw_path = entry.split(b'\t', 1)
    mode, oid, stage = metadata.decode().split()
    path = raw_path.decode()
    parts = pathlib.PurePosixPath(path).parts
    name = parts[-1]
    reasons = []
    if name in private_names or name.endswith('PROGRESS.md'):
        reasons.append('private work journal')
    if any(part in {'.claude', '.codex', '.email-import', 'node_modules', 'backups', 'storage', '__pycache__', '.pytest_cache', '.vite'} for part in parts):
        reasons.append('local configuration, dependency, cache or user data directory')
    if (name == '.env' or name.startswith('.env.')) and not name.endswith('.example'):
        reasons.append('non-example environment file')
    if name.endswith(('.mbox', '.pem', '.p12', '.pfx', '.key')):
        reasons.append('mail archive or private key file')
    if name.endswith(('.pyc', '.pyo', '.pyd')):
        reasons.append('compiled Python bytecode')
    if name in {'eslint_report.json'} or (name.startswith('lint_') and name.endswith(('.json', '.txt'))):
        reasons.append('local lint report artifact')
    if mode == '120000':
        reasons.append('symlink: review and replace with portable source')
    content = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=root)
    if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', content):
        reasons.append('private key material')
    if reasons:
        failures.append(f'{path}: {", ".join(reasons)}')

if failures:
    print('\n'.join(failures), file=sys.stderr)
    sys.exit(1)
print('Public-source file guard passed (Git index).')
