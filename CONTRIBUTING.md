# Contributing to Agent Chaos Monkey

Thanks for your interest in improving Agent Chaos Monkey! This project is a
resilience-testing harness for AI agents, and its value depends on the chaos
gateway boundary and the redaction rules being trustworthy. Please read the
[security boundary rules](#security-boundary-rules-do-not-weaken) before
proposing changes to the backend.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Support
channels and expectations are described in [SUPPORT.md](SUPPORT.md), and guidance for
hosting the harness internally is in [docs/ENTERPRISE.md](docs/ENTERPRISE.md).

## Development setup

You need the following installed locally:

- **.NET SDK 10.0** — for the API and unit tests.
- **Node.js 20+** — for the frontend, the MCP server, and the headless CLI.
- **Playwright browsers** — installed on demand by the frontend tests
  (`npx playwright install --with-deps chromium`).
- **Docker** (optional) — only needed to build the API container image locally.

Clone the repo and install dependencies:

```bash
git clone https://github.com/charles2ke/Agent-Chaos-Monkey.git
cd Agent-Chaos-Monkey

# Backend restore happens on first build/test; nothing to install manually.

# Frontend
cd frontend && npm ci && cd ..

# MCP server
cd mcp && npm ci && cd ..
```

To run the API locally:

```bash
cd backend/ChaosMonkey.Api
dotnet run     # http://localhost:5249
```

The frontend dev server (`cd frontend && npm run dev`) and the MCP server
(`cd mcp && npm start`) both talk to that URL.

## Validation commands

Before opening a pull request, run the same commands CI runs. All commands are
executed from the repository root unless otherwise noted:

```bash
# Backend unit tests (xUnit, coverlet)
dotnet test backend/ChaosMonkey.slnx

# Frontend lint, build, and end-to-end tests
cd frontend
npm ci
npm run lint
npm run build
npm run test:e2e
npm run test:e2e:static
cd ..

# MCP server unit + stdio round-trip tests
cd mcp
npm ci
npm test
cd ..

# Headless demo suite (requires the API running on http://localhost:5249)
node cli/run-suite.mjs examples/demo-suite.json
```

If your change is scoped to one area, running the corresponding subset is fine
during iteration, but the full list above should be green before you request
review.

## Pull request expectations

- **Keep PRs focused.** One logical change per PR. Refactors should be
  separated from feature work.
- **Update or add tests** for behaviour you change. New backend endpoints or
  gateway rules must ship with `xUnit` coverage under
  `backend/ChaosMonkey.Tests/`. New MCP tools need coverage in
  `mcp/server.test.mjs`.
- **Document user-visible behaviour.** If you change the API surface, the
  dependency table, the gateway configuration, or the MCP tool list, update
  `README.md` in the same PR.
- **Do not commit secrets.** API keys, bearer tokens, and connector credentials
  belong in local environment variables or CI secrets, never in the tree or in
  example definitions. The MCP server and the API both redact
  credential-shaped fields from saved/exported records; do not rely on that as
  a substitute for keeping secrets out of the input.
- **CI must be green.** The controlled resilience suite, CodeQL, and the
  backend coverage workflow all run on pull requests and must pass.

## Commit style

Match the style already present in `git log`:

- Use a short, descriptive, imperative-mood subject line, e.g.
  `Add a committed agent regression suite, CI gate and nightly drift run`.
- No conventional-commit prefix (`feat:`, `fix:`) is required.
- Reference related issues or PRs in the body when useful.
- Keep unrelated changes out of the same commit — squash-merges rely on the
  final commit message being a faithful summary.

## Security boundary rules (do not weaken)

The chaos gateway is what makes it safe to point a real agent at Agent Chaos
Monkey. Contributions must not weaken any of the following invariants. If you
believe a change requires relaxing one of these rules, please open an issue
first and label it `security`.

1. **The gateway is off by default.** External gateway calls only happen when
   `LabGateway__Enabled=true` is explicitly set. A blank agent endpoint must
   continue to use the controlled demo boundary, not any real connector.
2. **Endpoints are exact-match allowlisted.** `LabGateway__AgentEndpoints__*`
   and `LabGateway__Operations__*__Url` must be exact URLs. Do not add
   wildcard, prefix, regex, or "host-only" matching. URL credentials, query
   strings, and fragments are rejected.
3. **`PublicBaseUrl` is trusted config, not a request header.** The public
   callback URL must never be derived from a `Host`, `X-Forwarded-*`, or other
   request header.
4. **HTTP method and authorization are fixed per operation.** Callers cannot
   choose the upstream URL, HTTP method, or forwarded `Authorization`. HTTP
   redirects are disabled.
5. **Capability tokens are ephemeral and run-scoped.** A capability is bound
   to a single run + session. It must expire with the run and must reject
   callbacks after completion, from another session, or without the matching
   capability. Runs stay bounded (currently 90 seconds and 32 tool calls);
   raising these limits is a policy change, not a bug fix.
6. **Redaction happens on the way out.** Credential fields and recognized
   secret patterns must be redacted from saved and exported reports. Do not
   remove or narrow the redaction; if you add a new field that could carry a
   secret, extend the redaction to cover it.
7. **HTTPS outside loopback.** Do not add code paths that permit plaintext
   HTTP to non-loopback hosts for gateway or agent endpoints.

The [security policy](./SECURITY.md) has more detail on scope and how to
report suspected weaknesses privately.
