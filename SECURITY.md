# Security policy

Agent Chaos Monkey is a development harness for testing AI agent resilience by
deliberately injecting connector failures. It is not a public multi-tenant service
or a security certification tool.

## Supported versions

Agent Chaos Monkey is under active development. Security fixes target the latest
code on the `main` branch and, where applicable, the most recent tagged release
of each publishable artifact:

| Artifact | Supported versions |
| --- | --- |
| `main` branch (source) | :white_check_mark: |
| `agent-chaos-monkey-mcp` npm package | Latest `0.x` release |
| `ghcr.io/charles2ke/agent-chaos-monkey-api` container | Latest `api-v*` tag and images built from `main` |
| Older tags / images | :x: |

Please reproduce suspected vulnerabilities on the latest revision when it is safe
to do so. Older commits, branches, and forks do not have a guaranteed backport
policy. Prior to a `1.0.0` release, only the latest minor version receives fixes.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.** Do not disclose
vulnerabilities, exploit details, or credentials in public issues, pull requests,
discussions, or CI logs.

Use GitHub's **Report a vulnerability** option on this repository's
[Security tab](https://github.com/charles2ke/Agent-Chaos-Monkey/security), or open the
[private vulnerability report form](https://github.com/charles2ke/Agent-Chaos-Monkey/security/advisories/new).
If private reporting is unavailable, open a minimal public issue asking the
maintainers for a private reporting channel — do **not** include vulnerability
details in that issue.

Include the following in your private report:

- Affected component and commit SHA, tag, or package version you tested against,
  plus relevant runtime and deployment details.
- A description of the vulnerability, its impact, and required access or configuration.
- Minimal reproduction steps or a proof of concept using disposable test data,
  ideally against a local checkout of `main`.
- Expected versus observed behavior, with sanitized logs or screenshots if useful.
- Suggested mitigations or a fix, if known.

**Never** include live tokens, API keys, personal data, customer data, or production
payloads in your report. Redact them before sending. If a credential has been
exposed, revoke or rotate it before sharing sanitized evidence, and mention the
exposure without pasting the value.

## Response targets

Maintainers will assess the report, may request clarification, and will coordinate
remediation and disclosure through the private reporting channel. We aim to:

- Acknowledge new reports within **3 business days**.
- Provide an initial assessment (accepted / needs info / not a vulnerability)
  within **10 business days**.
- Ship a fix or documented mitigation for accepted high-severity issues within
  **30 days** of acknowledgement, and coordinate a disclosure timeline with the
  reporter.

These are targets, not guarantees; complex issues may take longer, response times
depend on maintainer availability, and we will keep reporters updated. Please
coordinate public disclosure with maintainers so users can apply a fix or
mitigation first.

## Scope and responsible testing

Reports concerning the backend API, frontend, Laboratory gateway, CLI, MCP server,
dependencies, or repository workflows are welcome. Security research is
particularly welcome on the following areas:

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

- **The built-in demo agent is deliberately imperfect.** Injected HTTP errors,
  malformed responses, latency, and the demo agent's failure to retry or handle
  malformed tool payloads are the product being demonstrated, not vulnerabilities.
  Report cases where those features cross a trust boundary or expose data.
- Findings that require an attacker who already controls the machine running
  the API, the MCP client, or the CI runner.
- Missing security headers on the local dev server, denial-of-service against
  a locally-hosted `dotnet run`, or rate limiting on loopback endpoints.
- Vulnerabilities in third-party services referenced by documentation (Azure
  OpenAI, Anthropic, npm registry, GHCR) rather than in this repository.

Test only systems you own or have explicit permission to assess. Use a local
instance and disposable upstreams; do not run disruptive tests against the public
demo, third-party services, or production systems.

If you are unsure whether an issue is in scope, please report it via the
advisory link above and we will triage it.

## Safe deployment and data handling

- **Restrict access.** Keep the API on a trusted development network. Before
  exposing it, add authentication and network/access controls; CORS is not
  authentication. Use HTTPS outside loopback development.
- **Limit live calls.** Laboratory external gateway integration is opt-in. Configure
  exact trusted agent endpoints and fixed connector/operation mappings server-side.
  Keep it disabled when not needed. Gateway callback capabilities are short-lived
  credentials, not general API authentication.
- **Expect side effects.** Live agent and upstream requests may create real actions
  and costs, including during retries or multi-check runs. Use least-privilege test
  credentials and disposable data. An idempotency key only prevents duplicate
  effects if the upstream honors it.
- **Keep secrets out of source and artifacts.** Supply credentials at runtime through
  environment variables or a secret store, never committed settings or suite files.
  For CLI/MCP agent credentials, use `CHAOS_AGENT_API_KEY`; do not embed credentials
  in MCP tool arguments.
- **Minimize sensitive inputs.** Configured remote agents receive experiment inputs.
  The optional LLM judge receives scenario, connector-result, and agent-response
  content. Review the destination and its data-handling policy before enabling it.
- **Review stored and exported data.** Laboratory history is stored in the current
  browser/origin. Redaction of recognized secret patterns is not a guarantee that
  all sensitive data is removed. Inspect reports, exports, screenshots, and CI
  artifacts before sharing; avoid secrets and personal data in scenarios or replies.
- **Treat results as evidence, not guarantees.** Simulated connector results do not
  prove real tool execution, and a resilience score does not establish that an agent
  is secure or safe for production.

See the [README](README.md) for gateway configuration, evaluator settings, and
data-handling limitations, and the [MCP documentation](mcp/README.md) for MCP safety
and runtime configuration.
