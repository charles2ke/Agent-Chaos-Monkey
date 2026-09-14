# 🔌 Agent Chaos Monkey MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Agent Chaos Monkey as tools, so an MCP client (Copilot, Claude Desktop, any
agent framework) can inject connector failures into an agent under test and read
back the resilience report.

It is a thin, stdio transport front end for the .NET Chaos API — the same API the
UI and the headless suite runner use — so the backend must be running.

## Install and run

```bash
cd backend/ChaosMonkey.Api && dotnet run     # Chaos API → http://localhost:5249

cd mcp && npm install
npm start                                    # speaks MCP over stdio
npm test                                     # unit + stdio round-trip tests
```

## Configuration

Configuration is environment-only; credentials are never accepted as tool
arguments, so a model cannot exfiltrate or forge them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHAOS_API_URL` | `http://localhost:5249` | Base URL of the Chaos API. Must be HTTPS, or HTTP on loopback, with no credentials, query or fragment. |
| `CHAOS_AGENT_API_KEY` | _(unset)_ | Credential forwarded to the agent under test. |
| `CHAOS_TIMEOUT_MS` | `120000` | Per-request timeout in ms (1–600000). `run_lab_suite` applies it per test, not to the whole suite. |

Register it with an MCP client, for example in `.vscode/mcp.json` or a client's
`mcpServers` configuration:

```json
{
  "servers": {
    "agent-chaos-monkey": {
      "command": "node",
      "args": ["mcp/server.mjs"],
      "env": { "CHAOS_API_URL": "http://localhost:5249" }
    }
  }
}
```

## Tools

| Tool | Purpose |
| --- | --- |
| `get_health` | Check that the Chaos API is reachable |
| `list_chaos_modes` | Catalogue of injectable failures |
| `get_evaluator` | Configured judge provider/model and whether credentials are present |
| `run_experiment` | Run one Preview experiment and return the resilience report |
| `get_lab_capabilities` | Supported schema, execution modes, assertion kinds, gateway status and limits |
| `run_lab_experiment` | Run a version 1 laboratory definition with evidence-backed assertions |
| `run_lab_suite` | Run 1–20 saved regression tests and return the aggregate outcome |

`run_lab_suite` executes each test as its own laboratory run and aggregates the
outcomes, so every test gets a full timeout budget and the configured
`CHAOS_AGENT_API_KEY`.

Definitions accepted by `run_lab_experiment` and `run_lab_suite` use the same
version 1 schema as [`examples/demo-suite.json`](../examples/demo-suite.json).

## Safety

- Tool arguments are rejected when they carry credentials; use `CHAOS_AGENT_API_KEY`.
- An `agentEndpoint` must be HTTPS, or HTTP on loopback, without credentials,
  query or fragment — the same rule the headless runner applies.
- Responses are redacted before they reach the model: credential-shaped keys,
  bearer/basic headers and URL credentials or query strings are removed.
- Preview connector results are simulations. Only Laboratory runs distinguish
  gateway-observed evidence, and missing observations yield `inconclusive`
  rather than a fabricated pass.
