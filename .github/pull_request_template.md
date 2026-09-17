## What changed

<!-- One logical change per PR. Describe the behaviour, not the diff. -->

## Why

<!-- Link the issue or explain the resilience question this answers. -->

## Evidence

<!-- Paste the sanitized run output, test names, or screenshots that prove the change works. -->

## Checklist

- [ ] Tests added or updated (`dotnet test backend/ChaosMonkey.slnx`, `mcp/server.test.mjs`, Playwright suites as relevant)
- [ ] Backend line coverage stays at 100%
- [ ] User-visible behaviour documented in `README.md` / `docs/`
- [ ] No secrets, tokens, customer data, or internal endpoints in the diff, tests, or logs
- [ ] The security boundary rules in [`CONTRIBUTING.md`](../CONTRIBUTING.md#security-boundary-rules-do-not-weaken) are intact
- [ ] CI is green (resilience suite, CodeQL, coverage)
