# Support

Agent Chaos Monkey is a community-maintained open-source project. It ships with no
service-level agreement, no paid support tier, and no warranty — see [`LICENSE`](LICENSE).

## Where to ask

| Need | Channel |
| --- | --- |
| Question about usage or interpretation of a run | [GitHub Discussions](https://github.com/charles2ke/Agent-Chaos-Monkey/discussions) |
| Suspected bug or wrong evidence | [Open a bug report](https://github.com/charles2ke/Agent-Chaos-Monkey/issues/new/choose) |
| Feature or new fault mode | [Open a feature request](https://github.com/charles2ke/Agent-Chaos-Monkey/issues/new/choose) |
| Security vulnerability | **Do not open an issue.** Follow [`SECURITY.md`](SECURITY.md) |
| Contributing a change | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Before opening an issue

1. Reproduce on the latest `main`.
2. Collect the failing command, the `X-Correlation-Id` response header (or run id),
   and the sanitized output — never paste tokens, endpoints with credentials, or
   customer data.
3. Search existing issues and discussions for the same symptom.

## Response expectations

Maintainers triage on a best-effort basis. Security reports follow the response
targets documented in [`SECURITY.md`](SECURITY.md); all other issues have no
guaranteed response time. Pull requests that include a reproduction test are
usually resolved fastest.

## Running it yourself

Operational guidance for internal deployments — authentication, request budgets,
probes, logging and upgrade expectations — is in
[`docs/ENTERPRISE.md`](docs/ENTERPRISE.md).
