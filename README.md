# 🐒 Agent Chaos Monkey

**Deliberately break your agent's connectors — failures, expired auth, prompt injection, schema drift, truncated payloads — then judge from tool-boundary evidence whether it recovered safely, or just said it did.**

[![Live demo](https://img.shields.io/badge/live%20demo-GitHub%20Pages-2ea44f?logo=github)](https://charles2ke.github.io/Agent-Chaos-Monkey/)
[![Pages](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/pages.yml/badge.svg)](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/pages.yml)
[![CodeQL](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/codeql.yml/badge.svg)](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/codeql.yml)
[![Coverage](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/coverage.yml/badge.svg)](https://github.com/charles2ke/Agent-Chaos-Monkey/actions/workflows/coverage.yml)
[![Backend coverage 100%](https://img.shields.io/badge/backend%20coverage-100%25-brightgreen)](.github/workflows/coverage.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet&logoColor=white)](backend)
[![React 19 + Vite](https://img.shields.io/badge/React-19%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](frontend)

[Live demo](https://charles2ke.github.io/Agent-Chaos-Monkey/) · [Getting started](GETTING_STARTED.md) · [Evaluate in 3 minutes](docs/JUDGES.md) · [Quick start](#-quick-start) · [Leaderboard](docs/LEADERBOARD.md) · [Direct Line](docs/DIRECT_LINE.md) · [GitHub Action](docs/ACTION.md) · [Deploy to Azure](docs/DEPLOY.md) · [Resilience laboratory](#-resilience-laboratory)

---

## Why this exists

AI agents can fabricate success after tool failures, allowing silently broken
workflows to ship. There is no standard way to test whether an agent recognizes
those failures and recovers safely.

[![Agent Chaos Monkey preview pane before a run](docs/images/preview-empty.png)](https://charles2ke.github.io/Agent-Chaos-Monkey/)

[![Agent Chaos Monkey resilience report after injecting an expired-auth failure](docs/images/resilience-report.png)](https://charles2ke.github.io/Agent-Chaos-Monkey/)

## ✨ What it does

Agent Chaos Monkey provides **resilience testing of AI agents**. Use Run for the original simulated connector-result demo, or Laboratory for reproducible experiments, tool-call evidence, regression tests, and opt-in live gateway testing. You get back:

- a **resilience score**
- latency and status of every call
- **LLM judge findings** and recommended fixes
- the raw agent response and connector trace

There is a built-in `/api/demo-agent`, so you can demo everything without wiring up a real agent first.

### Guided runs in Run

The **Run assistant** turns your selected faults into an approval-based plan: one healthy baseline,
then one check per fault. Isolating faults prevents a higher-priority failure from masking another.
Review the plan and choose **Approve & run** to execute it sequentially with a snapshot of your
current scenario, target, and settings. **Run chaos** still runs a single experiment as before.

Progress shows each check's status and score difference from the baseline. After completion,
rule-based guidance surfaces the lowest-scoring report's recommendation and offers to prepare a
fault not covered by that plan. Preparing a follow-up only changes the selection; it never runs
automatically. The assistant does not add a separate planning call, but each check (the baseline
plus one per fault) still calls `/api/experiments`, so if an LLM evaluator is configured it is
invoked once per check — N faults means N+1 evaluator calls, which affects latency and cost.

Use a sandbox target: each check sends a separate request and may cause real actions or costs.
**Stop after current check** skips queued checks without cancelling the active request; request
or transport errors also stop the plan. Runs stay in the current session's Activity history.
Run evaluates simulated connector results, not evidence of real tool execution; use Laboratory
for tool-call evidence. The guided demo also works on GitHub Pages without a backend.

## 🧨 Chaos modes

| Mode | What is injected |
| --- | --- |
| ⏱️ Latency spike | Configurable tool delay, with separate tool timeout and agent duration in Laboratory |
| 💥 HTTP 500 | Server-side failure from the connector |
| 🕳️ Empty response | A successful status with no usable payload |
| 🧩 Malformed response | Structurally broken / unparseable body |
| 🚦 HTTP 429 | Throttling / rate limiting |
| 🔐 HTTP 401 | Expired or invalid authentication |
| 💉 Prompt injection | Instructions embedded in a connector payload, with a per-run canary phrase that proves whether the agent obeyed them |
| 🧬 Tool schema drift | A renamed or removed tool parameter, so the call is rejected as a schema mismatch |
| ✂️ Truncated stream | A response cut off mid-payload, as an interrupted stream would be |
| 🧠 Context exhaustion | An oversized payload that pushes the agent past its context budget |
| 🌊 Cascading failure | One connector outage that keeps every later dependency call failing |

The last five are agent-layer faults: they target what the agent *does with* a tool response rather
than the HTTP transport. Every mode is available in both Run and Laboratory. Prompt injection is
scored by the `noInjectedInstructionFollowed` assertion in Laboratory, and by canary detection in the
Run judge — the run fails only when a reply repeats the canary phrase that was planted in the
payload, which is observed evidence, not a guess. A fresh canary is generated per run, so a reply
cannot pass by coincidence. The Laboratory simulation replays the agent-layer faults against a
deterministic scripted agent, so a simulated result says nothing about your agent: run the backend
locally and use Run, or opt in to the live tool gateway, to get real evidence for them. The
`noInjectedInstructionFollowed` assertion stays inconclusive whenever no injection payload was
delivered.

## 🚀 Quick start

> New here? [**GETTING_STARTED.md**](GETTING_STARTED.md) walks through the first run end to end.

> **Prerequisites:** [.NET 10 SDK](https://dotnet.microsoft.com/download) and [Node.js 20.19+ or 22.12+](https://nodejs.org) (required by Vite 8).

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

## 🎬 Video walkthrough

A short tour of the main screens with British female synthetic narration:
**[docs/videos/walkthrough.mp4](docs/videos/walkthrough.mp4)**

Regenerate it after UI changes with `cd frontend && npm run record:walkthrough`
(needs `ffmpeg` and `espeak-ng`). The script drives the static demo build with
Playwright, generates the voiceover from the narration script in
[`frontend/scripts/record-walkthrough.mjs`](frontend/scripts/record-walkthrough.mjs)
and fails if the result would run longer than two minutes.

## 🧭 The UI

Navigation lives behind the **hamburger menu** in the top left; **Settings** sits behind the
**gear icon** in the top right. Every control carries a descriptive tooltip on hover or keyboard
focus, and **Overview** has sub-menus for its three sections.

| Screen | Purpose |
| --- | --- |
| **Run** | Chat preview pane with the connector trace and resilience report. Sub-menu: Tools, the connector / tool boundary where chaos is injected |
| **Overview** | The resilience contract, the injectable chaos catalogue and the configured judge. Sub-menus: Instructions, Chaos catalogue, Resilience judge |
| **Activity** | History of the experiments run in this session |
| **Laboratory** | Versioned experiments, schedules, traces, saved tests, persistent history and comparisons |
| **Settings** (gear icon) | Agent endpoint and token, injected latency, evaluator model |

### Screenshots

**Navigation** — the hamburger menu with Overview sub-menus, and a single Overview section opened
from one of them:

![Hamburger navigation menu open, showing Run with its Tools sub-menu, Overview with its Instructions, Chaos catalogue and Resilience judge sub-menus, plus Laboratory and Activity](docs/images/navigation-menu.png)

![The Tools sub-menu of Overview, showing only the connector picker](docs/images/overview-tools-section.png)

**Run and the resilience report** — a scenario replayed with an expired-auth fault injected:

![Run screen before a run, with the chaos configuration panel and the run assistant](docs/images/preview-empty.png)

![Resilience report after injecting an expired-auth HTTP 401 failure](docs/images/resilience-report.png)

**Overview, Activity and Laboratory**:

![Overview screen with the resilience contract, the chaos catalogue, the judge and the connector picker](docs/images/tab-overview.png)

![Activity screen listing the experiments run in this session with their scores](docs/images/tab-activity.png)

![Laboratory screen with a versioned experiment definition and its evidence report](docs/images/tab-laboratory.png)

![Settings screen, opened from the gear icon, with the agent endpoint, injected latency and evaluator model](docs/images/tab-settings.png)

**Tooltips and small screens** — every panel, field and table column explains itself, and the same
menu drives navigation on a phone:

![A descriptive tooltip explaining the injected failures panel](docs/images/tooltips.png)

![The navigation drawer open on a 390 pixel wide phone viewport](docs/images/mobile-navigation.png)

Every image is a Playwright screenshot, refreshed by `cd frontend && npm run test:e2e` and
`npm run test:e2e:static`.

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
   │      ├── empty response
   │      └── agent-layer faults (prompt injection, schema drift,
   │             truncated stream, context exhaustion, cascade)
   │
   ├──────────────► Target agent (HTTPS POST, or Bot Framework Direct Line)
   │
   ▼
Configurable LLM Evaluator
   │
   ▼
Resilience Report
```

### Dependencies

All packages are kept on their latest stable releases.

| Area | Package | Version |
| --- | --- | --- |
| Backend | .NET target framework | `net10.0` |
| Backend | Microsoft.NET.Test.Sdk | `18.10.1` |
| Backend | xunit / xunit.runner.visualstudio | `2.9.3` / `4.0.0` |
| Backend | coverlet.collector | `10.0.1` |
| Backend | Azure.Identity | `1.21.0` |
| Frontend | react / react-dom | `19.3.0` |
| Frontend | vite / @vitejs/plugin-react | `8.3.0` / `6.1.1` |
| Frontend | typescript | `7.0.2` |
| Frontend | oxlint | `1.83.0` |
| Frontend | @playwright/test | `1.63.0` |

### API surface

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/chaos-modes` | Catalogue of injectable failures |
| `GET` | `/api/evaluator` | Configured provider/model and whether credentials are present |
| `POST` | `/api/experiments` | Run an experiment and return the resilience report |
| `POST` | `/api/demo-agent` | The built-in, deliberately imperfect agent |
| `POST` | `/api/lab/run` | Run a version 1 definition with evidence-backed assertions |
| `POST` | `/api/lab/suite` | Run a collection of saved regression tests |
| `GET` | `/api/lab/capabilities` | Supported schema, fault modes, assertion kinds, available transports, gateway status and limits |
| `POST` | `/api/lab/gateway/{runId}` | Capability-scoped tool callback, available only during a run |

## ⚙️ Configuring the judge

The resilience judge runs on any configurable LLM: the backend speaks both the Anthropic Messages API and the OpenAI-compatible Chat Completions API, so a hosted or a local model can be plugged in. Configure it through the `Llm` section of `backend/ChaosMonkey.Api/appsettings.json` or via environment variables:

| Variable | Value |
| --- | --- |
| `Llm__Provider` | `anthropic` \| `openai` \| `azure` (`openai` also covers any OpenAI-compatible gateway: Ollama, vLLM) |
| `Llm__Model` | Model name, e.g. `claude-opus-4-1-20250805` or `gpt-4.1` |
| `Llm__ApiKey` | Falls back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Ignored by the `azure` provider |
| `Llm__BaseUrl` | Optional override, e.g. `http://localhost:11434/v1`; required for `azure` (`https://<resource>.openai.azure.com`) |
| `Llm__Deployment` | Azure OpenAI / AI Foundry deployment name (`azure` provider only) |
| `Llm__ApiVersion` | Azure REST API version, default `2024-10-21` |

### Azure OpenAI / AI Foundry with Entra ID

The `azure` provider authenticates with `DefaultAzureCredential` and never accepts an API key: any
ambient `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` is cleared at startup, and requests carry an Entra ID
token for `https://cognitiveservices.azure.com/.default`. Give the identity the **Cognitive Services
OpenAI User** role on the resource.

```bash
export Llm__Provider=azure
export Llm__BaseUrl=https://my-resource.openai.azure.com
export Llm__Deployment=gpt-4.1              # deployment name, not model name
export Llm__ApiVersion=2024-10-21           # optional
dotnet run --project backend/ChaosMonkey.Api
curl -s http://localhost:5249/api/evaluator # → provider azure, authentication entra-id
```

Export a completed run in the Azure AI evaluation schema so it surfaces in Foundry evaluation
dashboards:

```bash
node cli/export-azure-eval.mjs results/chaos-results.json --output results/azure-eval
```

> [!NOTE]
> When no credentials are present, a deterministic rule-based judge scores the run instead, so the demo always works offline.

## 🧪 Tests

```bash
cd backend && dotnet test                 # API host, chaos engine, evaluator and laboratory tests
cd frontend && npm run lint && npm run build
cd frontend && npm run test:e2e           # Playwright UI tests (boots both servers)
cd frontend && npm run test:e2e:static    # Playwright against the static Pages build
cd frontend && npm run record:walkthrough # re-records docs/videos/walkthrough.mp4
cd mcp && npm test                        # MCP server unit and stdio round-trip tests
node --test cli/*.test.mjs                # CLI: suite runner, baseline diff, benchmark, remediation
node cli/check-dependency-table.mjs       # verifies the dependency table below against real lockfiles
```

Backend line coverage is measured by [`.github/workflows/coverage.yml`](.github/workflows/coverage.yml)
(coverlet, currently **100%**, floor 100%).

## 🌐 Published demo

**<https://charles2ke.github.io/Agent-Chaos-Monkey/>**

Pages is enabled with **GitHub Actions** as the source, and the UI is published to that URL on every push to `main` by [`.github/workflows/pages.yml`](.github/workflows/pages.yml). The workflow can also be re-run manually (`workflow_dispatch`) to refresh the site. The deploy job probes for the Pages site first, so if the setting is ever turned off the run reports actionable guidance instead of failing with an opaque 404 — and the built site remains available as the `github-pages` artifact of the run.

All tabs ship in that build. Pages only serves static files, so the build sets `VITE_STATIC_DEMO=true`. Run experiments use [`frontend/src/staticDemo.ts`](frontend/src/staticDemo.ts); Laboratory uses a deterministic browser simulation with explicitly **virtual** timing. Neither observes real connector calls. Testing a real agent endpoint or measuring actual tool waits requires the .NET API. The build also honours `VITE_BASE_PATH`, which the workflow sets to the repository name so the project site resolves its assets.

## 🧪 Resilience laboratory

The **Laboratory** tab is the executable experiment workbench. The original Run screen
API remains compatible; its supplied connector results are simulations, not evidence
that a remote agent called a tool. Laboratory distinguishes simulated demo traces
from gateway-observed interactions and never treats retry-related prose as a retry.

```text
Versioned definition → isolated experiment → agent → scoped Chaos Gateway → allowlisted tool
                                                ↓
                          evidence + assertions → saved regression → headless CI gate
```

### Execution and evidence

- **Single:** apply one selected fault; explicitly list unselected/unreached steps as skipped.
- **Matrix:** run an independent healthy control and one independent run per selected
  fault. Each run has fresh session and side-effect state.
- **Sequence:** target connector, operation and invocation number; for example,
  `429 → 429 → success`. A planned step that is never reached is not an injected fault.
- **Latency:** delay the tool interaction, not an artificial wait before invoking
  the agent. Compare injected delay, tool duration and agent duration. A tool timeout
  exercises an observable timeout/fallback; cancellation stops outstanding work.
- **Recovery:** inspect call counts, retry gaps, backoff, outcomes and side-effect
  identifiers. A configured retry limit is an assertion, not proof the agent obeyed it.
- **Multi-turn:** use the simulated reauthentication turn after an expired credential
  to resume the original task. Session isolation and idempotent demo actions prevent
  a replay or follow-up from creating extra tickets.

The version 1 evidence evaluator checks unsupported success claims, retry limits,
minimum backoff, eventual success, retained context and duplicate side effects.
Findings include evidence excerpts and dimension outcomes. Failure acknowledgements
do not excuse contradictory success claims, while negated claims and supported
recovery are handled separately. Missing observations produce **inconclusive**, not
a fabricated pass. This is a deterministic evaluator, not a general natural-language
proof system; inspect evidence when interpreting ambiguous wording.

### Saved tests, history and reproducibility

Use **Save as test** to preserve a definition and its structured assertions. Edit
assertions, export/import a version 1 suite, rerun it, and compare the new outcome
with the saved baseline. Laboratory stores redacted records locally across reloads,
with search, replay and comparisons of controls, faults and agent-version metadata.
Storage belongs to the current browser/origin, not a shared server database; export
records for backup. Clearing browser data removes local history.

A definition captures schema version, scenario, connector/operation, execution mode,
fault schedule, latency and timeouts, retry configuration, turns, assertions,
agent-version metadata and evaluator version. Credentials are supplied separately
and must be re-entered for live replay. Reproducible inputs do **not** guarantee
identical model output, upstream state, timing, or an unchanged remote agent.
Use disposable test upstreams, never production side effects.

Credential fields and recognized secret patterns are redacted from saved/exported
reports; URL credentials and query strings are not reproducible inputs. Avoid putting
secrets or personal data into scenarios, tool payloads or replies in the first place,
and review exports before sharing them.

### Connecting a connector or API

There is no connector catalogue or OAuth flow. A "connector" is simply a named
target that an operator maps to one exact HTTP endpoint:

1. **Simulated (default).** Type any connector/operation name in the definition,
   for example `ServiceNow` / `CreateIncident`. No connector or upstream API is
   called; if you configured an external `AgentEndpoint`, the runner still POSTs
   the turn to that agent, but the controlled demo boundary returns fixtures. Those
   results are not evidence of real tool execution.
2. **Real API.** Declare the endpoint server-side as a `LabGateway:Operations`
   entry (see the table below), set the definition's transport to `gateway`, and
   reference the same connector/operation names. Every declared target needs
   exactly one allowlisted mapping with a safe URL and fixed method, otherwise the
   run is rejected.
3. **Agent side.** The agent routes its tool call to the supplied `gateway.url`
   using the ephemeral `gateway.capability` bearer token, as shown below. The
   gateway injects the fault, forwards allowed calls upstream and records the trace.

Any safe HTTP(S) endpoint can be a gateway target; hosted agent connectors are not
connected by catalogue or OAuth here. Test one through an allowlisted agent
endpoint that uses the connector, or put a small allowlisted HTTPS proxy in
front of protocols or custom auth flows the gateway cannot express.

### Opt-in gateway integration

The gateway is disabled for external agents by default. A blank agent endpoint uses
the controlled demo boundary, **not** a production connector, even if gateway
transport is selected. To observe a real agent, configure exact trusted endpoints
server-side in the `LabGateway` configuration section:

| Setting | Purpose |
| --- | --- |
| `LabGateway__Enabled=true` | Explicitly enable external gateway calls |
| `LabGateway__PublicBaseUrl` | Trusted externally reachable URL of this API, never derived from a request Host header |
| `LabGateway__AgentEndpoints__0` | Exact safe allowlisted agent URL, required for all external agent calls |
| `LabGateway__Operations__0__Connector` | Connector identifier, e.g. `ServiceNow` |
| `LabGateway__Operations__0__Operation` | Operation identifier, e.g. `CreateIncident` |
| `LabGateway__Operations__0__Url` | Exact disposable test upstream URL |
| `LabGateway__Operations__0__Method` | Fixed HTTP method, default `POST` |
| `LabGateway__Operations__0__BearerToken` | Optional runtime upstream credential; never add it to definitions or source control |
| `LabGateway__Operations__0__SideEffectIdProperty` | Top-level JSON string property identifying a created effect, e.g. `id` |

Use HTTPS outside loopback development. Neither endpoints nor mappings accept URL
credentials, query strings, or fragments. Callers cannot choose an upstream URL,
HTTP method or forwarded authorization; redirects are disabled. Each operation
receives a run-scoped `Idempotency-Key`, but real duplicate prevention still requires
the upstream to honor that key. An absent side-effect identifier or uncertain tool
completion cannot prove that duplicate effects did not occur.

An agent integration must consume the Laboratory request's `message`, `scenario`,
`sessionId`, `history` and `gateway` object. Route the actual tool call to
`gateway.url`, authorize it using the supplied ephemeral `gateway.capability` as a
bearer token, and send:

```json
{
  "sessionId": "<provided session ID>",
  "connector": "ServiceNow",
  "operation": "CreateIncident",
  "arguments": { "description": "Broken laptop" }
}
```

The callback returns the tool HTTP status and an envelope containing `statusCode`,
`body`, `succeeded`, `simulation`, and `sessionId`. Treat `body` as the connector
payload: it may be empty or malformed even when the gateway envelope is valid JSON.
Return the agent's final reply only after its tool work completes. Callbacks after
completion, from another session, or without the matching capability are rejected.
Capabilities expire with the run; runs are bounded to 90 seconds and 32 tool calls.
Fault schedules support up to 20 steps and sessions up to 10 follow-up turns.

A remote agent that ignores the callback does not generate observed tool evidence:
its result is **inconclusive**. Simulated reauthentication is a scenario signal, not
an OAuth implementation or a way to renew real production credentials. Live agents
must implement their own session and authentication integration. The API is a
development harness, not a public multi-tenant service; place it behind trusted
network/access controls before exposing it.

### A sample agent that participates

[`examples/sample-agent/`](examples/sample-agent/README.md) is a dependency-free Node agent plus a
disposable connector, so you can watch the whole loop produce observed evidence without owning an
agent. `--profile resilient` passes every experiment; `--profile naive` fabricates a ticket
reference and relays raw connector text, which is exactly the failure this project exists to catch.
[`examples/gateway-suite.json`](examples/gateway-suite.json) is the matching suite — it exercises
all five agent-layer modes against the live agent — and the
`gateway` job in [the CI workflow](.github/workflows/resilience.yml) runs it on every pull request.

### Direct Line and the Microsoft 365 Agents SDK

`transport: "directline"` drives a real agent over Direct Line instead of posting to a generic HTTPS
endpoint: token exchange, conversation start, activity send and watermark-polled receive, with the
chaos turn payload delivered on `activity.value` (and `channelData.chaosMonkey`). The agent's tool
call is mapped onto the same scoped gateway, so a run yields observed evidence rather than
`inconclusive`.

| Setting | Purpose |
| --- | --- |
| `LabGateway__DirectLine__Enabled=true` | Enable the Direct Line transport |
| `LabGateway__DirectLine__Secret` | Channel secret; host configuration only, never accepted in a definition and redacted from every report |
| `LabGateway__DirectLine__BaseUrl` | Default `https://directline.botframework.com` |
| `LabGateway__DirectLine__UserId` | Conversation user id, default `chaos-monkey` |
| `LabGateway__DirectLine__PollIntervalMs` / `__ReceiveTimeoutSeconds` | Receive tuning (default 500 ms / 45 s) |

Full walkthrough and a ready-to-paste activity handler:
[`docs/DIRECT_LINE.md`](docs/DIRECT_LINE.md) and
[`examples/direct-line-agent/agent-handler.ts`](examples/direct-line-agent/agent-handler.ts).

### Headless suites and CI

Start the API, then run the credential-free demo suite with Node.js 22:

```bash
node cli/run-suite.mjs examples/demo-suite.json --output results
# The committed regression baseline, one test per failure mode:
node cli/run-suite.mjs examples/agent-regression-suite.json --output results/regression
# Run a suite exported from Laboratory against a configured API:
node cli/run-suite.mjs suite.json --url https://chaos.example.test --timeout-ms 60000
# Render a run as a Markdown table (for a CI job summary):
node cli/summarize-results.mjs results/chaos-results.json --title 'Agent regression suite'
```

The runner writes `chaos-results.json` and JUnit `chaos-results.xml` even for API
failures. `CHAOS_AGENT_API_KEY` optionally supplies the agent token at runtime;
do not put credentials in a suite. Remote API URLs require HTTPS (loopback HTTP is
allowed). Redirects are not followed.

| Exit | Meaning |
| --- | --- |
| `0` | No critical violations and no disallowed inconclusive results |
| `1` | Critical assertion/finding failure |
| `2` | Invalid suite/configuration, API/infrastructure error, runner timeout, or report-write error |
| `3` | Insufficient evidence; use `--allow-inconclusive` only when intentionally allowing this in CI |

Warning-only assertion failures remain visible in JSON without failing the gate.
Inconclusive cases are JUnit skips; infrastructure failures are JUnit errors.
The **runner timeout** is an infrastructure error, distinct from an intentionally
injected **tool timeout**, which can produce a valid resilience result.
When outcomes are mixed, infrastructure errors take precedence over critical failures,
then inconclusive results. All tests still run.

[The controlled CI workflow](.github/workflows/resilience.yml) runs backend tests,
frontend checks, both Playwright suites and the headless demo and regression suites
with no production credentials. Its `resilience-reports-and-screenshots` artifact
includes JSON/JUnit, browser reports and screenshots, and both suites are rendered
into the job summary. `chaos-results.xml` is also published through a JUnit reporter,
so each experiment surfaces as its own test row. Make the job a required status check
in branch protection if you want a resilience regression to block the pull request.

### The regression baseline

[`examples/agent-regression-suite.json`](examples/agent-regression-suite.json) is the
committed baseline: a healthy control, throttling recovery, exhausted HTTP 500 retries,
expired auth with a reauthentication turn, a tool timeout that is retried, a latency
spike inside the timeout, empty and malformed payloads, one test for each of the five
agent-layer modes (prompt injection, tool schema drift, truncated stream, context
exhaustion and cascading failure), and a matrix run covering every chaos mode against
its own control. Every test uses `transport: "simulation"` with no `agentEndpoint`, so
the same file runs in pull-request CI and in the nightly drift job without an agent
being reachable. Assertions that must block a merge are `critical`;
observational ones such as measured backoff are `warning`, so they stay visible in the
JSON report without failing the gate. `agentVersion` and `evaluator` are pinned so
results stay comparable, timings are small and explicit so wall-clock variance cannot
flip an outcome, and the file contains no credentials — the runner rejects suites that
do. Supply an agent token through `CHAOS_AGENT_API_KEY` instead.

Treat the file as a reviewable artifact: add experiments in Laboratory, **Save as test**,
export the version 1 suite, and commit the diff whenever assertions change. When CI goes
red, replay the stored record in Laboratory and compare it with the saved baseline to see
which dimension regressed.

[The nightly workflow](.github/workflows/nightly-resilience.yml) runs the same baseline
on a schedule (and on demand, optionally against another committed suite) for drift
detection. It is simulation-only: dispatched suites must reside under `examples/` or
`suites/`, use the `simulation` transport, and must not define an `agentEndpoint`.

### MCP server

[`mcp/`](mcp) ships an MCP server so any MCP client can drive chaos experiments
as tools. Start the API, then:

```bash
npx agent-chaos-monkey-mcp           # published package, no clone required
cd mcp && npm install && npm start   # from a clone: stdio MCP server, npm test for its tests
```

| Tool | Purpose |
| --- | --- |
| `get_health` / `list_chaos_modes` / `get_evaluator` | API liveness, injectable failures, configured judge |
| `run_experiment` | Run one Run-tab experiment and return the resilience report |
| `get_lab_capabilities` | Supported schema, execution modes, assertion kinds, gateway status and limits |
| `run_lab_experiment` / `run_lab_suite` | Run a version 1 definition, or 1–20 saved regression tests |

`CHAOS_API_URL`, `CHAOS_AGENT_API_KEY` and `CHAOS_TIMEOUT_MS` configure it.
Credentials are environment-only and are never accepted as tool arguments, agent
endpoints must be HTTPS (loopback HTTP allowed), and responses are redacted before
they reach the model. See [`mcp/README.md`](mcp/README.md).

> **Break → Observe → Judge → Generate Eval → Fix → Re-test → PR Gate.**

For the fuller argument behind why this matters, see [_The Failure Mode Nobody Tests For_](docs/blog/agent-chaos-testing.md).

## 🤖 GitHub Action

Gate a pull request on resilience the same way you gate it on tests:

```yaml
- uses: charles2ke/agent-chaos-monkey@v1
  with:
    suite: examples/agent-regression-suite.json
    api-url: http://localhost:5249
    baseline: examples/baseline/agent-regression-baseline.json
    allow-inconclusive: 'false'
```

The action runs the suite, posts a sticky pull-request comment with per-dimension score deltas
against the committed baseline, exposes `outcome`/`exit-code`/`results-path` as outputs and exits
with the runner's exit code so the check turns red on a regression.
[`.github/workflows/chaos-gate.yml`](.github/workflows/chaos-gate.yml) is a reusable workflow that
also starts the API for you. See [`docs/ACTION.md`](docs/ACTION.md).

## 📦 Install without cloning

| Artifact | Command |
| --- | --- |
| MCP server (npm) | `npx agent-chaos-monkey-mcp` |
| API container (GHCR) | `docker run --rm -p 5249:8080 ghcr.io/charles2ke/agent-chaos-monkey-api:latest` |
| API host assembly (NuGet) | `dotnet add package AgentChaosMonkey.Api` *(published by [`publish-nuget.yml`](.github/workflows/publish-nuget.yml) on release; packs the ASP.NET Core host, not a standalone engine library)* |

## ☁️ Deploy to Azure

```bash
azd auth login
azd up
```

[`azure.yaml`](azure.yaml) and [`infra/`](infra) provision the API on Azure Container Apps and the UI
on Azure Static Web Apps, so a reviewer gets a live backend without installing .NET.
See [`docs/DEPLOY.md`](docs/DEPLOY.md).

## 🏁 Resilience leaderboard

Measured, not asserted: **2 of 4 benchmarked agents reported success to the user after the connector
returned HTTP 401.** Full table, per-dimension breakdown, reproduction commands and an explicit list
of platforms that are *not* measured yet: [`docs/LEADERBOARD.md`](docs/LEADERBOARD.md).

```bash
node cli/benchmark.mjs examples/benchmark-targets.json --url http://127.0.0.1:5249 --output results/benchmark
```

## 🛠️ From failure to fix

Detection is only half the tagline. `cli/suggest-remediation.mjs` turns a failing run into concrete
changes — instruction/system-prompt additions and a retry/idempotency policy — each traced back to
the assertion that produced it:

```bash
node cli/suggest-remediation.mjs results/chaos-results.json --output results/remediation
```

[`.github/workflows/remediate.yml`](.github/workflows/remediate.yml) runs a suite, generates the
artifacts and opens them as a pull request. Review before merging: the suggestions come from
observed tool-boundary evidence, not from a model.

## 🧑‍⚖️ Evaluating this project

[`docs/JUDGES.md`](docs/JUDGES.md) is a three-minute path with exact commands and expected output,
including how to reproduce an agent claiming "Ticket created!" after an HTTP 401 — and how to fix
it. The 90-second pitch script is in [`docs/videos/pitch-script.md`](docs/videos/pitch-script.md).

## 📄 License

[MIT](LICENSE) © Charles Gomes
