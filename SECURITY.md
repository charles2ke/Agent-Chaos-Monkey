# Security Policy

Agent Chaos Monkey is a development harness for testing AI agent resilience by
deliberately injecting connector failures. It is not a public multi-tenant service
or a security certification tool.

## Supported Versions

Security fixes target the latest code on the `main` branch. Please reproduce
suspected vulnerabilities on the latest revision when it is safe to do so.
Older commits, branches, and forks do not have a guaranteed backport policy.

## Reporting a Vulnerability

Do not disclose vulnerabilities, exploit details, or credentials in public issues,
pull requests, discussions, or CI logs.

Use GitHub's **Report a vulnerability** option on this repository's
[Security tab](https://github.com/charles2ke/Agent-Chaos-Monkey/security), or open the
[private vulnerability report form](https://github.com/charles2ke/Agent-Chaos-Monkey/security/advisories/new).
If private reporting is unavailable, open a public issue asking the maintainers
for a private reporting channel, without including vulnerability details.

Include the following in your private report:

- Affected component and commit SHA, plus relevant runtime and deployment details.
- A description of the vulnerability, its impact, and required access or configuration.
- Minimal reproduction steps or a proof of concept using disposable test data.
- Expected versus observed behavior, with sanitized logs or screenshots if useful.
- Suggested mitigations or a fix, if known.

Never include live tokens, API keys, personal data, or production payloads. If a
credential has been exposed, revoke or rotate it before sharing sanitized evidence.

Maintainers will assess the report, may request clarification, and will coordinate
remediation and disclosure through the private reporting channel. If a report is
not considered a vulnerability, the reasoning can be discussed there. Response and
fix times depend on maintainer availability; no fixed response SLA is guaranteed.
Please coordinate public disclosure with maintainers so users can apply a fix or
mitigation first.

## Scope and Responsible Testing

Reports concerning the backend API, frontend, Laboratory gateway, CLI, MCP server,
dependencies, or repository workflows are welcome. Examples include unintended
network access, credential disclosure, unauthorized gateway use, and unsafe
handling of untrusted inputs.

Injected HTTP errors, malformed responses, latency, and deliberately imperfect
demo-agent behavior are expected features, not vulnerabilities by themselves.
Report cases where those features cross a trust boundary or expose data.

Test only systems you own or have explicit permission to assess. Use a local
instance and disposable upstreams; do not run disruptive tests against the public
demo, third-party services, or production systems.

## Safe Deployment and Data Handling

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
