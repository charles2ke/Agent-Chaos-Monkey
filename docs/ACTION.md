# Agent Chaos Monkey GitHub Action

`charles2ke/agent-chaos-monkey@v1` is a composite action that runs the Chaos
Monkey suite runner (`cli/run-suite.mjs`) against a running Chaos Monkey API,
compares the report against a committed baseline, posts a sticky score-delta
comment on pull requests, and fails the build when the resilience gate is
violated.

## Usage

Minimal example (assumes you have already started the API in an earlier step
and committed a baseline JSON):

```yaml
name: Chaos Monkey
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  chaos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-dotnet@v5
        with:
          dotnet-version: '10.0.x'
      - name: Start Chaos Monkey API
        env:
          Llm__ApiKey: ''
          ANTHROPIC_API_KEY: ''
          OPENAI_API_KEY: ''
          LabGateway__Enabled: 'false'
        run: |
          dotnet run --project backend/ChaosMonkey.Api \
            --no-launch-profile --urls http://localhost:5249 &
          for _ in $(seq 1 60); do
            curl --fail --silent http://localhost:5249/api/health && break
            sleep 1
          done
      - uses: charles2ke/agent-chaos-monkey@v1
        with:
          suite: examples/agent-regression-suite.json
          baseline: examples/baseline/agent-regression-baseline.json
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `suite` | yes | `examples/demo-suite.json` | Path to the suite JSON file. |
| `api-url` | no | `http://localhost:5249` | Base URL of the API. Must be HTTPS or loopback HTTP with no credentials. |
| `output` | no | `results` | Directory where `chaos-results.json` / `chaos-results.xml` are written. |
| `timeout-ms` | no | `60000` | Per-experiment timeout in ms (1..600000). |
| `allow-inconclusive` | no | `false` | When `"true"`, inconclusive suites do not fail the gate. |
| `baseline` | no | *(empty)* | Path to a committed baseline `chaos-results.json` for score deltas. |
| `comment-on-pr` | no | `true` | Post/update a sticky PR comment on `pull_request` events with a writable token. |
| `fail-on-gate` | no | `true` | When `"true"`, the action exits with the suite exit code. |
| `node-version` | no | `22` | Node.js major version to install. |

## Outputs

| Output | Description |
| --- | --- |
| `outcome` | Overall suite outcome (`pass`, `fail`, `inconclusive`, `infrastructure-error`). |
| `exit-code` | Suite exit code (see below). |
| `results-path` | Filesystem path to `chaos-results.json`. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All experiments passed the gate. |
| `1` | At least one critical assertion failed. |
| `2` | Infrastructure error (API unreachable, invalid suite, unwritable output). |
| `3` | Inconclusive without `allow-inconclusive: 'true'`. |

## Reusable workflow

The reusable workflow at `.github/workflows/chaos-gate.yml` starts the API,
runs the composite action, and uploads artifacts. Call it from a downstream
repository like this:

```yaml
jobs:
  chaos:
    uses: charles2ke/agent-chaos-monkey/.github/workflows/chaos-gate.yml@v1
    with:
      suite: examples/agent-regression-suite.json
      baseline: examples/baseline/agent-regression-baseline.json
    permissions:
      contents: read
      pull-requests: write
```

## Refreshing the committed baseline

The baseline at `examples/baseline/agent-regression-baseline.json` is the raw
output of `cli/run-suite.mjs` against `examples/agent-regression-suite.json`
with `--allow-inconclusive`. Regenerate it after intentional behaviour
changes:

```bash
# terminal 1 — start the API without any external credentials
LabGateway__Enabled=false Llm__ApiKey= ANTHROPIC_API_KEY= OPENAI_API_KEY= \
  dotnet run --project backend/ChaosMonkey.Api \
    --no-launch-profile --urls http://localhost:5249

# terminal 2 — wait for /api/health, then run the suite
curl --fail --silent http://localhost:5249/api/health
node cli/run-suite.mjs examples/agent-regression-suite.json \
  --output baseline-run --allow-inconclusive
cp baseline-run/chaos-results.json \
  examples/baseline/agent-regression-baseline.json
```

Commit the refreshed JSON so the next PR shows a clean `➡️ unchanged` delta.

## Security notes

- The action never echoes the `GITHUB_TOKEN` or the `CHAOS_AGENT_API_KEY`;
  all shell interpolation goes through `env:` variables, never through
  `${{ }}` inside `run:` blocks.
- Fork PRs receive a read-only token — the sticky comment step skips
  gracefully rather than failing the build.
- `cli/compare-baseline.mjs` reuses the same redaction rules as
  `cli/run-suite.mjs` (URL credentials stripped, `Bearer`/`Basic` tokens
  masked, sensitive keys replaced with `[REDACTED]`).
