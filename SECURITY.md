# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 1.0   | :x:                |

We actively maintain the `main` branch for bug fixes and security patches. Users running self-hosted deployments are encouraged to stay up to date with the latest `main` releases.

## Reporting a Vulnerability

We take the security of Pharos seriously. If you discover a security vulnerability, please report it **responsibly and privately**. **Do not open public GitHub issues or discussions for security vulnerabilities.**

### How to Report

1. **GitHub Private Vulnerability Reporting (Preferred)**:
   Navigate to the [Security Advisories](https://github.com/achilleasgkekas/pharos/security/advisories/new) tab of this repository and click **"Report a vulnerability"**. This allows encrypted, private discussion and coordinated disclosure directly with the maintainers.

2. **Email**:
   If you cannot use GitHub Advisories, you can contact the maintainer directly at `security@ph-aros.com` or `hello@ph-aros.com`.

### What to Include in Your Report

To help us investigate and triage quickly, please include:
- A description of the vulnerability and its potential impact.
- Step-by-step instructions or a minimal proof-of-concept (PoC) to reproduce the issue.
- The environment, affected component, and commit/version tested.
- Any suggested mitigations or patches if available.

### Response & Disclosure Process

- **Acknowledgment**: We aim to acknowledge receipt of security reports within **48 hours**.
- **Assessment**: We will confirm the vulnerability, assess its severity, and keep you informed of remediation progress.
- **Fix & Advisory**: Once a patch is ready and verified against our automated quality gate, we will publish a release and credit the reporter (unless you request to remain anonymous).

## Security Architecture & Best Practices

Pharos is designed as a private, self-hosted household hub. Core security layers include:

- **Authentication & Sessions**: Edge middleware gates application routes. Sessions use encrypted HTTP-only, `SameSite=Lax` cookies. Passwords use salted `scrypt` hashing.
- **SSRF Protection**: Outgoing HTTP requests (web scraping, image imports, webhooks) use `safeFetch` and IP verification to strictly reject private, link-local, loopback, or metadata endpoints across all redirect hops.
- **Path Traversal Protection**: Storage reads, writes, and deletions are strictly validated and constrained within `STORAGE_ROOT`.
- **Injection Defenses**: Database operations use strict Mongoose schemas with sanitized keys, and CSV exports neutralize formula injection prefixes (`=`, `+`, `-`, `@`).
- **Network Isolation**: When deployed via Docker Compose, database (`mongo`), search (`searxng`), and background workers are isolated within internal container bridge networks and do not expose unauthenticated ports to public interfaces.
- **Telemetry & Privacy**: Pharos contains zero mandatory third-party tracking, ads, or analytics beacons.
