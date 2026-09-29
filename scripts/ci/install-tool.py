#!/usr/bin/env python3
"""Install a reviewed Linux amd64 CI binary only after verifying its pinned archive hash."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

spec = json.loads(Path(__file__).with_name('tool-downloads.json').read_text())[sys.argv[1]]
with tempfile.TemporaryDirectory() as tmp:
    archive = Path(tmp) / 'tool.tar.gz'
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '3',
                    '--proto', '=https', '--tlsv1.2', '--output', str(archive), spec['url']], check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != spec['sha256']:
        sys.exit('Tool archive checksum mismatch')
    with tarfile.open(archive) as contents:
        member = contents.getmember(spec['member'])
        if not member.isfile():
            sys.exit('Expected a regular executable')
        binary = contents.extractfile(member)
        destination = Path.cwd() / sys.argv[1]
        destination.write_bytes(binary.read())
        destination.chmod(0o755)
