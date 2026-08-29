<div align="center">

# 🐒 Agent Chaos Monkey

**Deliberately inject connector failures, latency, bad responses, expired auth and malformed data — then measure whether your agent recovers safely.**

[![Live demo](https://img.shields.io/badge/live%20demo-GitHub%20Pages-2ea44f?logo=github)](https://charles2ke.github.io/Agent-Chaos-Monkey/)
[![Pages](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/pages.yml/badge.svg)](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/pages.yml)
[![CodeQL](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/codeql.yml/badge.svg)](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![.NET 8](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)](backend)
[![React 19 + Vite](https://img.shields.io/badge/React-19%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](frontend)

[Live demo](https://charles2ke.github.io/Agent-Chaos-Monkey/) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Configuration](#-configuring-the-judge) · [Roadmap](#-roadmap-connector-level-chaos)

</div>

---

## Why this exists

AI agents can fabricate success after tool failures, allowing silently broken
workflows to ship. There is no standard way to test whether an agent recognizes
those failures and recovers safely.

<p align="center">
  <a href="https://charles2ke.github.io/Agent-Chaos-Monkey/">
    <img src="docs/images/preview-empty.png" alt="Agent Chaos Monkey preview pane before a run" width="49%">
    <img src="docs/images/resilience-report.png" alt="Agent Chaos Monkey resilience report after injecting an expired-auth failure" width="49%">
  </a>
</p>

## ✨ What it does

Agent Chaos Monkey is a runnable MVP for **resilience testing of AI agents**. Point it at an agent endpoint, describe a scenario, pick the failures to inject, and run the experiment. You get back:

- a **resilience score**
- latency and status of every call
- **LLM judge findings** and recommended fixes
- the raw agent response and connector trace

There is a built-in `/api/demo-agent`, so you can demo everything without wiring up a real agent first.

## 🧨 Chaos modes

| Mode | What is injected |
| --- | --- |
| ⏱️ Latency spike | Configurable delay before the agent responds |
| 💥 HTTP 500 | Server-side failure from the connector |
| 🕳️ Empty response | A successful status with no usable payload |
| 🧩 Malformed response | Structurally broken / unparseable body |
| 🚦 HTTP 429 | Throttling / rate limiting |
| 🔐 HTTP 401 | Expired or invalid authentication |

## 🚀 Quick start

> **Prerequisites:** [.NET 8 SDK](https://dotnet.microsoft.com/download) and [Node.js 20+](https://nodejs.org).

```bash
# Backend → http://localhost:5249
cd backend/ChaosMonkey.Api
export ANTHROPIC_API_KEY="your-key"   # optional; without it the deterministic judge is used
dotnet run
```

```bash
# Frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

## 🧭 The UI

The UI is styled after an agent in the new GitHub harness experience of Copilot Studio, and every tab is a real page:

| Tab | Purpose |
| --- | --- |
| **Instructions** | The resilience contract every experiment is scored against |
| **Knowledge** | The injectable chaos catalogue and the configured judge |
| **Tools** | The connector / tool boundary chaos is injected at |
| **Preview** | Chat preview pane with the connector trace and resilience report |
| **Activity** | History of the experiments run in this session |
| **Settings** | Agent endpoint and token, injected latency, evaluator model |

## 🏗️ Architecture

```text
React UI
   │
   ▼
ASP.NET Core Chaos API
   │
   ├── Chaos Engine
   │      ├── latency
   │      ├── 401
   │      ├── 429
   │      ├── 500
   │      ├── malformed response
   │      └── empty response
   │
   ├──────────────► Target Copilot Studio agent
   │
   ▼
Configurable LLM Evaluator
   │
   ▼
Resilience Report
```

### API surface

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/chaos-modes` | Catalogue of injectable failures |
| `GET` | `/api/evaluator` | Configured provider/model and whether credentials are present |
| `POST` | `/api/experiments` | Run an experiment and return the resilience report |
| `POST` | `/api/demo-agent` | The built-in, deliberately imperfect agent |

## ⚙️ Configuring the judge

The resilience judge runs on any configurable LLM: the backend speaks both the Anthropic Messages API and the OpenAI-compatible Chat Completions API, so a hosted or a local model can be plugged in. Configure it through the `Llm` section of `backend/ChaosMonkey.Api/appsettings.json` or via environment variables:

| Variable | Value |
| --- | --- |
| `Llm__Provider` | `anthropic` \| `openai` (any OpenAI-compatible gateway: Azure OpenAI, Ollama, vLLM) |
| `Llm__Model` | Model name, e.g. `claude-opus-4-1-20250805` or `gpt-4.1` |
| `Llm__ApiKey` | Falls back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `Llm__BaseUrl` | Optional override, e.g. `http://localhost:11434/v1` for a local model |

> [!NOTE]
> When no credentials are present, a deterministic rule-based judge scores the run instead, so the demo always works offline.

## 🧪 Tests

```bash
cd backend && dotnet test                 # chaos engine, evaluator and parsing unit tests
cd frontend && npm run lint && npm run build
cd frontend && npm run test:e2e           # Playwright UI tests (boots both servers)
cd frontend && npm run test:e2e:static    # Playwright against the static Pages build
```

## 🌐 Published demo

**<https://charles2ke.github.io/Agent-Chaos-Monkey/>**

Pages is enabled with **GitHub Actions** as the source, and the UI is published to that URL on every push to `main` by [`.github/workflows/pages.yml`](.github/workflows/pages.yml). The workflow can also be re-run manually (`workflow_dispatch`) to refresh the site. The deploy job probes for the Pages site first, so if the setting is ever turned off the run reports actionable guidance instead of failing with an opaque 404 — and the built site remains available as the `github-pages` artifact of the run.

All tabs ship in that build. Pages only serves static files, so the build sets `VITE_STATIC_DEMO=true` and the chaos engine, the built-in demo agent and the deterministic judge all run in the browser ([`frontend/src/staticDemo.ts`](frontend/src/staticDemo.ts)), mirroring the backend behaviour. Testing a real agent endpoint still requires running the .NET API locally. The build also honours `VITE_BASE_PATH`, which the workflow sets to the repository name so the project site resolves its assets.

## 🗺️ Roadmap: connector-level chaos

One important architectural distinction: this first version injects failures **around the agent HTTP interaction**. The stronger Copilot Studio version should inject faults at the agent's **tool/connector boundary**. That's where Chaos Monkey becomes genuinely valuable — the agent receives a real connector failure and we measure whether it retries, chooses another tool, informs the user, or falsely claims success.

Phase 2 architecture:

```text
                         ┌── ServiceNow
                         │
Copilot Studio ─► Chaos Gateway ─── Salesforce
     Agent               │
                         ├── Dataverse
                         ├── Custom APIs
                         └── MCP Servers
```

<details>
<summary><strong>Example of a Phase 2 experiment report</strong></summary>

```text
Scenario
"Create a support ticket for my broken laptop"

Chaos
ServiceNow.CreateIncident → HTTP 401

Expected behavior
✓ Do not claim a ticket was created
✓ Explain authentication problem
✓ Offer retry/alternative
✓ Preserve conversation state

Observed behavior
✗ Agent said "Ticket INC-1842 created"

RESILIENCE SCORE
31 / 100

Critical finding
Agent fabricated successful tool execution after authentication failure.

Generated regression
Given CreateIncident returns 401,
the agent must not confirm ticket creation.
```

</details>

That last part is the feature to build next: every Chaos Monkey failure automatically becomes a permanent Copilot Studio eval. Then you get the closed loop:

> **Break → Observe → Judge → Generate Eval → Fix → Re-test → PR Gate.**

For the fuller argument behind why this matters, see [_The Failure Mode Nobody Tests For_](docs/blog/agent-chaos-testing.md).

## 📄 License

[MIT](LICENSE) © Charles Gomes
