#!/usr/bin/env python3
"""Check the complete hash lock, with one reviewed Semgrep/PyJWT security override."""
from importlib.metadata import distribution, version
from pathlib import Path
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

lock = Path(__file__).with_name('semgrep-requirements.txt')
for line in lock.read_text().splitlines():
    if not line or line.startswith(('#', '--')):
        continue
    locked = Requirement(line.split(' --hash=', 1)[0])
    installed = version(locked.name)
    if installed not in locked.specifier:
        raise SystemExit(f'{locked.name}: installed {installed}, expected {locked.specifier}')
    for text in distribution(locked.name).requires or []:
        required = Requirement(text)
        extras = ('', 'crypto') if canonicalize_name(locked.name) == 'semgrep' else ('',)
        if required.marker and not any(required.marker.evaluate({'extra': extra}) for extra in extras):
            continue
        dependency_version = version(required.name)
        if dependency_version in required.specifier:
            continue
        # Semgrep 1.178.0 unnecessarily caps PyJWT below the patched release.
        # CLI scans and token encode/decode are verified with this exact override.
        if (canonicalize_name(locked.name) == 'semgrep' and installed == '1.178.0'
                and canonicalize_name(required.name) == 'pyjwt'
                and str(required.specifier) == '~=2.13.0' and dependency_version == '2.15.0'):
            continue
        raise SystemExit(f'{locked.name}: {required} is incompatible with installed {dependency_version}')
# Exercise the patched whole-JWK-set failure and Semgrep's token-decoding dependency.
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
public_jwk = RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
malformed_jwk = {**public_jwk, 'd': 'AAAAAA'}
if len(jwt.PyJWKSet.from_dict({'keys': [malformed_jwk, public_jwk]}).keys) != 1:
    raise SystemExit('Malformed JWK must be skipped without losing the valid key')
token = jwt.encode({'sub': 'synthetic-ci-check'}, key, algorithm='RS256')
if jwt.decode(token, key.public_key(), algorithms=['RS256'])['sub'] != 'synthetic-ci-check':
    raise SystemExit('PyJWT token round trip failed')
print('Semgrep dependency closure and patched PyJWT regression checks passed.')
