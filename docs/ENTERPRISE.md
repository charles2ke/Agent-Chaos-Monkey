# Running Agent Chaos Monkey inside an enterprise

Agent Chaos Monkey is a test harness for agent resilience, not a production service
for end users. This guide covers what an internal platform team needs in order to
host it for their own engineers: access control, request budgets, probes,
traceability, and the boundaries the harness deliberately keeps.

## Threat model in one paragraph

The API deliberately injects failures into calls made **to agents you own**. It never
accepts an arbitrary upstream URL from a caller: agent endpoints and connector
operations are exact-match allowlisted in configuration, the tool gateway is off by
default, and capability tokens are bound to a single run. Those invariants are listed
in [`CONTRIBUTING.md`](../CONTRIBUTING.md#security-boundary-rules-do-not-weaken) and must
not be relaxed by a deployment. The controls on this page sit *in front* of that
boundary; they do not replace it.

## Access control

The API ships with no authentication because the default experience is a local demo.
For any shared or hosted deployment, require a shared key:

```bash
# Preferred: an ambient variable, so the secret never lands in a config file or image.
export CHAOS_MONKEY_API_KEY='<generated-secret>'

# Equivalent, if your platform injects configuration instead of environment variables:
export Enterprise__ApiKey='<generated-secret>'
```

When a key is configured, every request must present it in the `X-Api-Key` header.
Two routes stay open by design:

| Route | Why it is exempt |
| --- | --- |
| `/api/health`, `/api/health/ready` | Orchestrator probes must work without a secret. |
| `/api/lab/gateway/{runId}` | The agent under test authenticates with its ephemeral, run-scoped capability token, not with your operator key. |

Keys are compared in fixed time. Rotate by updating the secret and restarting the
revision; there is no key list, so use a gateway or reverse proxy if you need
per-team keys, audit trails, or OAuth/Entra ID sign-in.

> The shared key is a deployment control, not an identity system. Put the API behind
> your existing ingress (App Gateway, Front Door, an API gateway, or a service mesh)
> when you need per-user identity, SSO, or IP allowlisting.

## Request budgets

A fixed-window budget is applied per calling IP address in each API process:

| Setting | Default | Meaning |
| --- | --- | --- |
| `Enterprise__RateLimitPermitsPerWindow` | `600` | Requests allowed per window. `0` disables limiting. |
| `Enterprise__RateLimitWindowSeconds` | `60` | Window length in seconds. |

Rejected callers receive `429 Too Many Requests` with a `Retry-After` header. Probes
and authenticated gateway callbacks are exempt — gateway callbacks come from the
agent under test and already carry their own per-run caps (90 seconds, 32 tool
calls), so throttling them would distort the experiment rather than protect the
host. Unauthenticated or invalid callback attempts remain in the per-caller
budget.

The built-in limiter is a per-instance backstop. On multi-replica deployments, or
when `RemoteIpAddress` is an ingress peer rather than the original client, enforce
organization-wide quotas at a trusted edge or proxy. If your ingress already
enforces quotas, set the permit count to `0` and let the edge own it.

## Probes

| Route | Purpose | Returns |
| --- | --- | --- |
| `GET /api/health` | Liveness | `{ "status": "ok" }` |
| `GET /api/health/ready` | Readiness | judge configuration, gateway state, whether a key is required, whether limiting is on |

The `azd` template wires both into the Container App (`infra/core/resources.bicep`), so
a revision only takes traffic once it reports the configuration it will serve with.
Readiness is also the fastest way to confirm a deployment is hardened:

```bash
curl -s https://<api-host>/api/health/ready
# {"status":"ready","evaluator":"heuristic-only","gatewayEnabled":false,
#  "apiKeyRequired":true,"rateLimited":true}
```

## Traceability

Every response carries a correlation identifier. Send your own value in
`X-Correlation-Id` (up to 128 characters) and it is echoed back; omit it and the host
returns its trace identifier. Include that value in bug reports and incident notes —
it links a user complaint to the request in your logs.

Set `Enterprise__CorrelationHeader` if your platform standardises on a different
safe header name. The API rejects invalid names and reserved headers such as
`X-Api-Key`, `Authorization`, cookies, rate-limit response headers, and the fixed
security headers.

## Response hardening

Every response also carries `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Resource-Policy: cross-origin`, and a `default-src 'none'` content
security policy. The API serves JSON only, and the cross-origin resource policy
allows the separate Static Web App origin to read API responses that pass CORS.

Browser access is restricted by CORS. Set `AllowedOrigins__0..n` to the exact origins
of your UI deployments — the wildcard is never used.

## Credentials for the judge

The LLM judge is optional; without it the harness falls back to a heuristic evaluator
and `/api/health/ready` reports `heuristic-only`. When you do configure it:

- Prefer **Azure OpenAI with Entra ID** (`Llm__Provider=azure`). The host refuses to use
  an API key for that provider, so a managed identity is the only credential in play.
- For key-based providers, inject `Llm__ApiKey` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`)
  from your secret store. Never bake it into an image or a config file in source control.

## Supply chain and change management

- Images are published to `ghcr.io/charles2ke/agent-chaos-monkey-api`; pin a digest or a
  released `api-v*` tag rather than `latest`, and mirror it into your own registry if
  your policy requires it.
- `.github/dependabot.yml` keeps NuGet, npm, Docker and Actions dependencies current.
- CodeQL, a controlled resilience suite, and a **100% backend line coverage** gate run on
  every pull request.
- Supported versions and the private vulnerability reporting process are documented in
  [`SECURITY.md`](../SECURITY.md); support expectations are in [`SUPPORT.md`](../SUPPORT.md).

## Data handling

Runs are ephemeral and held in memory; the API persists no transcripts. Saved tests and
history live in the browser's local storage of whoever uses the UI, and exported results
are written by the CLI to whatever path you choose. Credential-shaped fields are redacted
from saved and exported records, but the scenarios you write are your data: do not put
customer content or secrets into run definitions.

## Deployment checklist

- [ ] `CHAOS_MONKEY_API_KEY` (or `Enterprise__ApiKey`) set from a secret store
- [ ] `AllowedOrigins__*` limited to your UI origins
- [ ] Request budget tuned, or organization-wide quotas delegated to your ingress
- [ ] Liveness and readiness probes wired into the platform
- [ ] `LabGateway__Enabled` left `false` unless you are driving a real agent, and every
      `AgentEndpoints`/`Operations` entry reviewed as an exact allowlist entry
- [ ] Judge credentials injected at runtime, Entra ID preferred
- [ ] Container image pinned to a digest or released tag
- [ ] Correlation ids captured in your log pipeline
