# Security policy

## Supported versions

Agent Chaos Monkey is under active development. Security fixes are applied to
the `main` branch and, where applicable, to the most recent tagged release of
each publishable artifact:

| Artifact | Supported versions |
| --- | --- |
| `main` branch (source) | :white_check_mark: |
| `agent-chaos-monkey-mcp` npm package | Latest `0.x` release |
| `ghcr.io/charles2ke/agent-chaos-monkey-api` container | Latest `api-v*` tag and images built from `main` |
| Older tags / images | :x: |

Prior to a `1.0.0` release, only the latest minor version receives fixes.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Report vulnerabilities privately through GitHub Security Advisories:

- https://github.com/charles2ke/Agent-Chaos-Monkey/security/advisories/new

If you cannot use GitHub Security Advisories, you may open a minimal public
issue asking for a private contact channel — do **not** include vulnerability
details in that issue.

When reporting, please include:

- A description of the issue and its potential impact.
- Steps to reproduce, ideally against a local checkout of `main`.
- Any suggested remediation.
- The commit SHA, tag, or package version you tested against.

**Never** include real secrets, API keys, customer data, or credentials in your
report. Redact them before sending. If a secret was accidentally exposed by
this project, mention that it was exposed without pasting the value.

## Response targets

We aim to:

- Acknowledge new reports within **3 business days**.
- Provide an initial assessment (accepted / needs info / not a vulnerability)
  within **10 business days**.
- Ship a fix or documented mitigation for accepted high-severity issues within
  **30 days** of acknowledgement, and coordinate a disclosure timeline with the
  reporter.

These are targets, not guarantees; complex issues may take longer, and we will
keep reporters updated.

## Scope

Security research is welcome on the following areas:

- **Chaos gateway boundary** — the allowlist enforcement, capability-token
  binding to a specific run/session, and rejection of requests outside a run
  window (see `LabGateway` in `backend/ChaosMonkey.Api`).
- **Capability tokens** — issuance, scoping, expiry, reuse across runs or
  sessions, and any way to obtain a token without an active run.
- **Redaction** — the redaction of credential-shaped fields from saved and
  exported records, both in the API and in the MCP server surface.
- **MCP server input validation** — `agent-chaos-monkey-mcp` tool arguments and
  the stdio transport handling.
- **Publish workflows** — supply-chain hardening of `publish-mcp.yml`,
  `publish-image.yml`, and `publish-nuget.yml`.

The following are **out of scope**:

- **The built-in demo agent is deliberately imperfect.** Its failure to retry,
  hallucinate less, or handle malformed tool payloads is the product being
  demonstrated, not a vulnerability. Reports of "the demo agent behaves badly
  when chaos is injected" will be closed as intended behaviour.
- Findings that require an attacker who already controls the machine running
  the API, the MCP client, or the CI runner.
- Missing security headers on the local dev server, denial-of-service against
  a locally-hosted `dotnet run`, or rate limiting on loopback endpoints.
- Vulnerabilities in third-party services referenced by documentation (Azure
  OpenAI, Anthropic, npm registry, GHCR) rather than in this repository.

If you are unsure whether an issue is in scope, please report it via the
advisory link above and we will triage it.
