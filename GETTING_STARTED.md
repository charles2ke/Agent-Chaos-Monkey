# 🚀 Getting started

This guide takes you from a fresh clone to your first resilience report.
Prefer to look before installing anything? The
[live demo](https://charles2ke.github.io/Agent-Chaos-Monkey/) runs the whole
harness in the browser, with no backend.

## 1. Prerequisites

| Tool | Version | Used by |
| --- | --- | --- |
| [.NET SDK](https://dotnet.microsoft.com/download) | 10.0 | Chaos API, evaluator, laboratory runner |
| [Node.js](https://nodejs.org) | 20.19+ or 22.12+ | React UI (Vite 8), CLI and MCP server |

An LLM API key is **optional**. Without one, a deterministic rule-based judge
scores every run, so everything below works offline.

## 2. Start the backend

```bash
cd backend/ChaosMonkey.Api
export ANTHROPIC_API_KEY="your-key"   # optional
dotnet run                            # → http://localhost:5249
```

Check it is up: `curl http://localhost:5249/api/health`.

## 3. Start the UI

```bash
cd frontend
npm install
npm run dev                           # → http://localhost:5173
```

## 4. Run your first experiment

1. Open <http://localhost:5173>. The app starts on **Preview**.
2. Open **Overview** to see the resilience contract the agent is scored
   against, the catalogue of faults that can be injected, the judge that grades
   the recovery, and the connector chaos is aimed at. Pick
   `ServiceNow.CreateIncident` (the default) or any other tool boundary.
3. Back on **Preview**, keep the scenario *"Create a support ticket for my
   broken laptop"*, leave **Expired auth (HTTP 401)** selected and choose
   **Run chaos**.
4. Read the resilience report: the score, the connector trace, and every
   finding — including whether the agent fabricated a ticket number that was
   never created.
5. Open **Activity** to compare the runs from this session.

Nothing is wired to a real agent yet: the built-in `/api/demo-agent` is
deliberately imperfect, so the first report usually fails.

## 5. Point it at your own agent

Open **Settings** and set:

- **Agent endpoint** — an HTTPS endpoint that accepts a JSON turn and replies
  with the agent's message. It must be allowlisted server-side in
  `LabGateway:AgentEndpoints`.
- **Agent API key** — sent as the bearer token for that endpoint.
- **Injected latency** and **evaluator model** — optional overrides.

Use a sandbox target: every check sends a real request and may cause real
actions or costs. For Copilot Studio agents, see
[docs/COPILOT_STUDIO.md](docs/COPILOT_STUDIO.md).

## 6. Go beyond a single run

- **Run assistant** (Preview) turns the selected faults into an approval-based
  plan: one healthy baseline, then one isolated check per fault.
- **Laboratory** adds versioned definitions, evidence-backed assertions, saved
  regression tests, history and comparisons, plus opt-in live gateway testing
  where real tool calls are observed.
- **CI gate** — run the same suites headlessly with the
  [GitHub Action](docs/ACTION.md).

## 7. Validate a change

```bash
(cd backend && dotnet test)                # chaos engine, evaluator, laboratory
(cd frontend && npm run lint && npm run build)
(cd frontend && npm run test:e2e)          # Playwright UI tests (boots both servers)
(cd frontend && npm run test:e2e:static)   # Playwright against the static Pages build
(cd mcp && npm test)                       # MCP server tests
node --test cli/*.test.mjs                # CLI tests
```

## Where to next

- [README](README.md) — chaos modes, architecture and API surface
- [docs/JUDGES.md](docs/JUDGES.md) — evaluate the project in three minutes
- [docs/DEPLOY.md](docs/DEPLOY.md) — deploy to Azure
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow
