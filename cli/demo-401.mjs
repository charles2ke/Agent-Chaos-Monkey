#!/usr/bin/env node
// One command that reproduces the core claim: an agent that says "Ticket created!" after the
// connector returned HTTP 401, judged from tool-boundary evidence rather than from its own prose.
//
// It starts the disposable connector, the sample agent and the API with the live gateway enabled,
// runs the expired-auth experiment against the naive profile, prints the reply beside the recorded
// trace, then repeats it against the resilient profile so the fix is visible in the same output.
//
// Usage: node cli/demo-401.mjs [--url http://127.0.0.1:5249] [--keep-api] [--timeout-ms 120000]
//
// With --url the script assumes an API is already listening there with the gateway configured as in
// docs/JUDGES.md and starts only the agent and the connector.
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = 'node cli/demo-401.mjs [--url http://127.0.0.1:5249] [--keep-api] [--timeout-ms 120000]'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiUrl = 'http://127.0.0.1:5249'
const agentPort = '5250'
const toolPort = '5251'

export const suitePath = 'examples/gateway-suite.json'
export const testId = 'gateway-expired-auth'

// The experiment the demo replays; taken from the committed suite so the demo cannot drift from CI.
export async function loadDefinition(root = repositoryRoot) {
  const suite = JSON.parse(await readFile(resolve(root, suitePath), 'utf8'))
  const test = (suite.tests ?? []).find((candidate) => candidate.id === testId)
  if (!test) throw new Error(`${suitePath} no longer contains the ${testId} test.`)
  return test.definition
}

// Reduces a laboratory report to the two things that have to be shown side by side: what the user
// was told, and what was observed at the tool boundary.
export function extractMoment(report) {
  const run = (report?.runs ?? [])[0]
  if (!run) throw new Error('The API returned a report without runs.')
  const honesty = (run.assertions ?? []).find((assertion) => assertion.kind === 'noUnsupportedSuccess' ||
    assertion.id === 'honesty')
  return {
    outcome: report.outcome,
    reply: run.agentResponse ?? '',
    calls: (run.trace ?? []).map((call) => ({
      invocation: call.invocation,
      statusCode: call.statusCode,
      succeeded: call.succeeded === true,
      sideEffectId: call.sideEffectId ?? null,
    })),
    honestyOutcome: honesty?.outcome ?? 'inconclusive',
    honestyDetail: honesty?.detail ?? 'No honesty assertion was evaluated.',
  }
}

export function renderMoment(profile, moment) {
  const lines = [
    `── ${profile} profile ─────────────────────────────────────────`,
    'What the user was told:',
    `  ${moment.reply.trim() || '(no reply)'}`,
    'What the gateway recorded:',
    ...(moment.calls.length === 0
      ? ['  (no tool call reached the boundary)']
      : moment.calls.map((call) => `  call:${call.invocation} status:${call.statusCode} ` +
        `success:${call.succeeded}${call.sideEffectId ? ` sideEffectId:${call.sideEffectId}` : ''}`)),
    `Verdict (noUnsupportedSuccess): ${moment.honestyOutcome}`,
    `  ${moment.honestyDetail}`,
  ]
  return lines.join('\n')
}

export function verdict(naive, resilient) {
  if (naive.honestyOutcome !== 'fail') {
    return { ok: false, message: 'Expected the naive profile to be caught claiming an unsupported success.' }
  }
  if (resilient.honestyOutcome !== 'pass') {
    return { ok: false, message: 'Expected the resilient profile to pass the honesty assertion.' }
  }
  return {
    ok: true,
    message: 'Same fault, same evidence, two different answers: the difference is the agent, ' +
      'and the verdict came from the tool boundary.',
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      // GET, so the probe never mutates: the connector and the agent answer 405 without
      // creating a record, which is enough to prove the port is listening.
      await fetch(url, { method: 'GET' })
      return true
    } catch {
      if (Date.now() >= deadline) return false
      await new Promise((done) => setTimeout(done, 250))
    }
  }
}

function start(command, args, env) {
  const child = spawn(command, args, { cwd: repositoryRoot, stdio: 'ignore', env: { ...process.env, ...env } })
  const exited = new Promise((done) => child.once('exit', done))
  return { child, exited }
}

async function stop(process_) {
  if (!process_) return
  process_.child.kill()
  await Promise.race([process_.exited, new Promise((done) => setTimeout(done, 5_000))])
}

async function runExperiment(baseUrl, definition, timeoutMs) {
  const response = await fetch(new URL('/api/lab/run', baseUrl), {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ definition }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`The API returned HTTP ${response.status} for the experiment.`)
  return extractMoment(await response.json())
}

async function main() {
  const args = process.argv.slice(2)
  let baseUrl = null
  let timeoutMs = 120_000
  let keepApi = false
  while (args.length) {
    const flag = args.shift()
    if (flag === '--url' && args.length) baseUrl = args.shift()
    else if (flag === '--timeout-ms' && args.length) timeoutMs = Number(args.shift())
    else if (flag === '--keep-api') keepApi = true
    else throw new Error(usage)
  }
  if (baseUrl !== null) {
    const parsed = new URL(baseUrl)
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) {
      throw new Error('API URL must use HTTPS (or loopback HTTP), without credentials, query, or fragment.')
    }
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
    throw new Error('Timeout must be between 1 and 600000 ms.')
  }

  const definition = await loadDefinition()
  const url = baseUrl ?? apiUrl
  let tool = null
  let agent = null
  let api = null
  try {
    if (await waitForHttp(`http://127.0.0.1:${toolPort}/create`, 0)) {
      throw new Error(`Port ${toolPort} is already in use; stop that process first.`)
    }
    if (await waitForHttp(`http://127.0.0.1:${agentPort}/agent`, 0)) {
      throw new Error(`Port ${agentPort} is already in use; stop that process first.`)
    }
    process.stdout.write('Starting the disposable connector... ')
    tool = start('node', ['examples/sample-agent/tool.mjs', '--port', toolPort])
    if (!(await waitForHttp(`http://127.0.0.1:${toolPort}/create`, 15_000))) throw new Error('the connector did not start.')
    console.log('ready.')

    if (!baseUrl) {
      process.stdout.write('Starting the API with the live gateway (first run builds the backend)... ')
      api = start('dotnet', ['run', '--project', 'backend/ChaosMonkey.Api', '--no-launch-profile', '--urls', apiUrl], {
        LabGateway__Enabled: 'true',
        LabGateway__PublicBaseUrl: apiUrl,
        LabGateway__AgentEndpoints__0: `http://127.0.0.1:${agentPort}/agent`,
        LabGateway__Operations__0__Connector: 'ServiceNow',
        LabGateway__Operations__0__Operation: 'CreateIncident',
        LabGateway__Operations__0__Url: `http://127.0.0.1:${toolPort}/create`,
        LabGateway__Operations__0__Method: 'POST',
        LabGateway__Operations__0__SideEffectIdProperty: 'id',
      })
      if (!(await waitForHttp(new URL('/api/health', url), 180_000))) throw new Error('the API did not start.')
      console.log('ready.')
    }

    const moments = {}
    for (const profile of ['naive', 'resilient']) {
      // The agent only trusts gateway callbacks from this origin, so it must match the API in use.
      agent = start('node', ['examples/sample-agent/agent.mjs', '--port', agentPort,
        '--profile', profile, '--gateway-base', url])
      if (!(await waitForHttp(`http://127.0.0.1:${agentPort}/agent`, 15_000))) {
        throw new Error(`the ${profile} agent did not start.`)
      }
      console.log(`\nScenario: "${definition.scenario}" with an expired credential injected at the connector.`)
      moments[profile] = await runExperiment(url, definition, timeoutMs)
      console.log(renderMoment(profile, moments[profile]))
      await stop(agent)
      agent = null
    }

    const result = verdict(moments.naive, moments.resilient)
    console.log(`\n${result.message}`)
    if (!result.ok) process.exitCode = 1
    if (keepApi && api) {
      console.log(`\nThe API is still listening on ${apiUrl}; press Ctrl+C to stop it.`)
      await api.exited
    }
  } finally {
    await stop(agent)
    if (!keepApi) await stop(api)
    await stop(tool)
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(2)
  })
}
