import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { containsCredentials, parseApiUrl, redact } from './api.mjs'

test('parseApiUrl rejects credentials and plaintext remote hosts', () => {
  assert.equal(parseApiUrl('http://localhost:5249').hostname, 'localhost')
  assert.equal(parseApiUrl('https://chaos.example.com').protocol, 'https:')
  for (const value of ['http://chaos.example.com', 'https://' + 'user' + ':' + 'pw' + '@' + 'chaos.example.com', 'https://x.test/?k=v']) {
    assert.throws(() => parseApiUrl(value), /HTTPS/)
  }
})

// Secret-shaped literals are assembled at runtime so the fixtures never look like real credentials.
test('redact removes tokens, credential keys and URL secrets', () => {
  const output = redact(
    { agentApiKey: 'secret-value', note: `Authorization: ${'Bear'+'er'} abc123`, url: 'https://' + 'user' + ':' + 'pw' + '@' + 'x.test/a?token=1' },
    'secret-value',
  )
  assert.equal(output.agentApiKey, '[REDACTED]')
  assert.ok(!JSON.stringify(output).includes('secret-value'))
  assert.equal(output.url, 'https://x.test/a')
})

test('containsCredentials finds nested credential keys', () => {
  assert.equal(containsCredentials({ definition: { turns: [{ password: 'x' }] } }), true)
  assert.equal(containsCredentials({ definition: { name: 'ok' } }), false)
})

/** Starts a stub Chaos API and an MCP client wired to the real server over stdio. */
async function withServer(handler, run, env = {}) {
  const requests = []
  const api = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      requests.push({ url: request.url, body: body ? JSON.parse(body) : null })
      const result = handler(request.url)
      response.writeHead(result.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(result.body))
    })
  })
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve))
  const client = new Client({ name: 'test', version: '0.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
    env: { PATH: process.env.PATH, CHAOS_API_URL: `http://127.0.0.1:${api.address().port}`, ...env },
  })
  await client.connect(transport)
  try {
    await run(client, requests)
  } finally {
    await client.close()
    await new Promise((resolve) => api.close(resolve))
  }
}

test('exposes the chaos toolset and proxies an experiment', async () => {
  await withServer(
    () => ({ status: 200, body: { report: { score: 40, verdict: 'fragile' } } }),
    async (client, requests) => {
      const { tools } = await client.listTools()
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        [
          'get_evaluator',
          'get_health',
          'get_lab_capabilities',
          'list_chaos_modes',
          'run_experiment',
          'run_lab_experiment',
          'run_lab_suite',
        ],
      )

      const result = await client.callTool({
        name: 'run_experiment',
        arguments: { scenario: 'Create a ticket', modes: ['ExpiredAuth'] },
      })
      assert.ok(!result.isError)
      assert.match(result.content[0].text, /fragile/)
      assert.deepEqual(requests.at(-1).body.modes, ['ExpiredAuth'])
      assert.equal(requests.at(-1).url, '/api/experiments')
    },
  )
})

test('surfaces API validation errors as tool errors', async () => {
  await withServer(
    () => ({ status: 400, body: { errors: ['schemaVersion must be 1.'] } }),
    async (client) => {
      const result = await client.callTool({
        name: 'run_lab_experiment',
        arguments: {
          definition: {
            schemaVersion: 1,
            name: 'Throttle recovery',
            scenario: 'Create a ticket',
            connector: 'ServiceNow',
            operation: 'CreateIncident',
            executionMode: 'sequence',
            faults: [{ invocation: 1, mode: 'Throttling' }],
            assertions: [{ id: 'honesty', kind: 'noUnsupportedSuccess' }],
          },
        },
      })
      assert.ok(result.isError)
      assert.match(result.content[0].text, /HTTP 400/)
    },
  )
})

test('rejects a plaintext remote agent endpoint without calling the API', async () => {
  await withServer(
    () => ({ status: 200, body: {} }),
    async (client, requests) => {
      const result = await client.callTool({
        name: 'run_experiment',
        arguments: { scenario: 'Create a ticket', agentEndpoint: 'http://agent.example.com/api' },
      })
      assert.ok(result.isError)
      assert.match(result.content[0].text, /agentEndpoint rejected/)
      assert.equal(requests.length, 0)
    },
  )
})

const suiteDefinition = {
  schemaVersion: 1,
  name: 'Throttle recovery',
  scenario: 'Create a ticket',
  connector: 'ServiceNow',
  operation: 'CreateIncident',
  faults: [{ invocation: 1, mode: 'Throttling' }],
  assertions: [{ id: 'honesty', kind: 'noUnsupportedSuccess' }],
}

test('runs suite tests individually, forwarding the agent credential, and aggregates the outcome', async () => {
  const outcomes = ['pass', 'inconclusive']
  await withServer(
    () => ({ status: 200, body: { id: 'run', outcome: outcomes.shift(), runs: [] } }),
    async (client, requests) => {
      const result = await client.callTool({
        name: 'run_lab_suite',
        arguments: { tests: [{ definition: suiteDefinition }, { definition: suiteDefinition }] },
      })
      assert.ok(!result.isError)
      assert.deepEqual(
        requests.map((request) => request.url),
        ['/api/lab/run', '/api/lab/run'],
      )
      assert.equal(requests[0].body.agentApiKey, 'env-only-value')
      assert.equal(JSON.parse(result.content[0].text).outcome, 'inconclusive')
    },
    { CHAOS_AGENT_API_KEY: 'env-only-value' },
  )
})

test('rejects credential-shaped keys smuggled into a definition', async () => {
  await withServer(
    () => ({ status: 200, body: {} }),
    async (client, requests) => {
      const result = await client.callTool({
        name: 'run_lab_experiment',
        arguments: { definition: { ...suiteDefinition, turns: [{ message: 'hi', credential: 'x' }] } },
      })
      assert.ok(result.isError)
      assert.equal(requests.length, 0)
    },
  )
})
