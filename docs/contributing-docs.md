# Contributing documentation

<sub>[📚 Docs home](README.md) · [✨ Features](features.md) · [🚀 Self-hosting](self-hosting.md) · [⚙️ Configuration](configuration.md) · [❓ FAQ](faq.md)</sub>

Documentation lives in `docs/`. Start with the [index](README.md) and use English
for shared guides. Write examples with reserved domains such as `example.com`
and documentation addresses such as `192.0.2.10`; never include a real deployment's
credentials, private hostnames, customer data or personal operational notes.

When changing behavior, update the relevant user guide in the same pull request.
Keep API examples in sync with `docs/openapi.yaml` and the implemented routes.
Check relative links and verify commands against the supported configuration.
Clearly mark anything you could not validate.

Use an isolated branch, stage only intended files and describe what changed and
how you checked it in the pull request. Personal work logs belong outside the
tracked source tree. Run `python3 scripts/check-public-source.py` from the
repository root after staging changes to check the proposed file set.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the code contribution workflow and
[SECURITY.md](../SECURITY.md) for reporting vulnerabilities privately.
