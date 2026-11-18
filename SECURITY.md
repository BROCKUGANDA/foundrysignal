# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than via public
issues. Email: security@foundrysignal.example (replace with real contact before
public launch). Include reproduction steps, impact, and affected versions.

We aim to acknowledge within 72 hours and provide a fix or mitigation plan within
14 days for critical issues.

## Supported versions

Only the latest release on `main` is supported. `dev` and `staging` are
pre-release and may contain unpatched issues.

## Secrets

Never commit `.env` or any credential. See `.env.example`. If a secret is
accidentally committed, rotate it immediately and open a private report so
history can be rewritten.