# Agent Chaos Monkey frontend

The Agent Chaos Monkey UI is built with React 19 and Vite.

## Local development

```bash
npm install
npm run dev
```

The UI expects the backend API at <http://localhost:5249>.

## Static demo build

Set `VITE_STATIC_DEMO=true` when building for GitHub Pages. In this mode, the
chaos engine, demo agent, and deterministic judge run entirely in the browser;
no backend is required.

## Laboratory

The **Laboratory** tab adds single-fault, isolated matrix, and ordered sequence
experiments alongside the original Run screen. Schedule faults by connector,
operation, and 1-based invocation; configure virtual latency, timeout, retry
limits/backoff, and follow-up turns with explicit reauthentication.

Simulation always uses a deterministic reference agent, includes a healthy
control, and makes **no claims about a real agent**. Durations are virtual;
endpoint and version labels do not change the simulated behavior. Unreached
faults and missing evidence are marked inconclusive. Expand reports to inspect
assertion evidence, fault attribution, retry timing, side-effect receipts, and
session continuity.

With the local backend, explicitly opt into the live gateway and enter an agent
endpoint. The agent must implement the backend's tool-gateway protocol; an
ordinary endpoint response alone cannot demonstrate fault injection. Live mode
can have real side effects. GitHub Pages disables live mode. Reloading, replaying,
and one-click test reruns default to simulation; live access must be opted into
again. Reauthentication is a harness signal, not a browser OAuth workflow.

Save a definition as a regression test and edit its structured assertions.
Rerunning a failing baseline can mark it resolved, but simulation cannot resolve
a live failure. Suite files use `{ "schemaVersion": 1, "tests": [...] }`, shared
with the headless runner. Imports are size-, schema-, field-, and bounds-checked
and never execute automatically.

Browser storage `chaos-monkey.laboratory.v1` retains up to 100 redacted run
summaries, 100 tests, nonsecret configuration, and regression status. API keys
remain in memory. URL userinfo is rejected; saved URLs omit queries/fragments.
Known credentials and common token forms are redacted from user text. Raw agent
output, session identifiers, and trace text are **not persisted or exported**.
Do not put confidential data into scenarios; redaction cannot classify arbitrary
unlabeled prose as a secret. Replay may require replacing redacted values.
Legacy Run activity remains session-only.

Search, export/import, and compare history summaries across versions. Imported
outcomes are unverified; replay to gather current evidence. Comparisons are
descriptive, not proof of causation. Corrupt or unavailable storage leaves the
laboratory usable in memory, with a warning and export available.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build |
| `npm run lint` | Run Oxlint |
| `npm run test:e2e` | Run the Playwright end-to-end suite |
| `npm run test:e2e:static` | Run the static-demo Playwright suite |

See the [root README](../README.md) for the full project documentation.
