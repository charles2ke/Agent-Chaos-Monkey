#!/usr/bin/env node
// A runnable sample agent that participates in the Agent Chaos Monkey gateway protocol.
//
// The same handler shape is used by the Bot Framework / Microsoft 365 Agents SDK sample in
// examples/direct-line-agent/, where the payload arrives as `activity.value` over Direct Line instead
// of as an HTTP body. Because this agent calls its tool through the laboratory gateway, a run
// produces observed evidence (real tool attempts, statuses and side-effect ids), not `inconclusive`.
//
// Usage: node examples/sample-agent/agent.mjs [--port 5250] [--profile resilient|naive|optimistic]
//        [--gateway-base http://127.0.0.1:5249]
import { createServer } from 'node:http'

const usage =
  'Usage: node examples/sample-agent/agent.mjs [--port 5250] [--profile resilient|naive|optimistic] ' +
  '[--gateway-base http://127.0.0.1:5249]'
const args = process.argv.slice(2)
let port = 5250
let profile = 'resilient'
let gatewayBase = process.env.CHAOS_GATEWAY_BASE ?? 'http://127.0.0.1:5249'
while (args.length) {
  const flag = args.shift()
  if (flag === '--port' && args.length) port = Number(args.shift())
  else if (flag === '--profile' && args.length) profile = args.shift()
  else if (flag === '--gateway-base' && args.length) gatewayBase = args.shift()
  else {
    console.error(usage)
    process.exit(2)
  }
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error('Port must be between 1 and 65535.')
  process.exit(2)
}
if (!['resilient', 'naive', 'optimistic'].includes(profile)) {
  console.error('Profile must be resilient, naive or optimistic.')
  process.exit(2)
}

// The gateway origin is trusted configuration, never taken from a turn payload. It is normalised
// once at start-up so every outbound tool call targets exactly this host.
function trustedOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
  if (url.username || url.password || url.search || url.hash) return null
  return url.origin
}

const gatewayOrigin = trustedOrigin(gatewayBase)
if (gatewayOrigin === null) {
  console.error('Gateway base must be an HTTPS origin, or an HTTP loopback origin, with no credentials.')
  process.exit(2)
}

const clampDelay = (value, fallback) =>
  Number.isInteger(value) && value >= 0 && value <= 5_000 ? value : fallback
const sleep = (ms) => new Promise((done) => setTimeout(done, clampDelay(ms, 0)))
const retryable = new Set([429, 500, 502, 503, 504])

// The gateway URL arrives in the turn payload, so it is treated as untrusted input. Only the run
// identifier is taken from it, and only after the payload's origin has been confirmed to be the
// trusted gateway origin; the request URL itself is rebuilt from configuration.
const runIdPattern = /^\/api\/lab\/gateway\/([a-f0-9]{1,64})$/
function gatewayRunId(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== gatewayOrigin) return null
  if (url.username || url.password || url.search || url.hash) return null
  const match = runIdPattern.exec(url.pathname)
  if (match === null) return null
  // Rebuilt character by character from a fixed alphabet so the outbound URL cannot carry any
  // attacker-chosen text, even if the regular expression above were later relaxed.
  const alphabet = '0123456789abcdef'
  let runId = ''
  for (const character of match[1]) {
    const index = alphabet.indexOf(character)
    if (index < 0) return null
    runId += alphabet[index]
  }
  return runId
}

// Calls the laboratory tool boundary once. The capability is short lived, scoped to a single run,
// and is never logged or echoed back to the user.
async function callTool(gateway, toolArguments) {
  const runId = gatewayRunId(gateway.url)
  if (runId === null) throw new Error('Unsupported gateway URL.')
  const url = `${gatewayOrigin}/api/lab/gateway/${runId}`
  const headers = { 'content-type': 'application/json' }
  headers.authorization = 'Bearer ' + gateway.capability
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers,
    body: JSON.stringify({
      sessionId: gateway.sessionId,
      connector: gateway.connector,
      operation: gateway.operation,
      arguments: toolArguments,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const envelope = await response.json().catch(() => ({ statusCode: response.status, body: '', succeeded: false }))
  return {
    statusCode: typeof envelope.statusCode === 'number' ? envelope.statusCode : response.status,
    succeeded: envelope.succeeded === true,
    body: typeof envelope.body === 'string' ? envelope.body : '',
  }
}

// A tool payload is data, never instruction. This agent reads only a known identifier property out
// of a successful payload and never repeats connector text back to the user, so an instruction
// embedded in a connector response cannot change what the user is told.
function sideEffectId(body) {
  try {
    const parsed = JSON.parse(body)
    return typeof parsed?.id === 'string' && /^[\w.-]{1,64}$/.test(parsed.id) ? parsed.id : null
  } catch {
    return null
  }
}

export async function handleTurn(payload) {
  const gateway = payload?.gateway
  if (!gateway?.url || !gateway?.capability || gatewayRunId(gateway.url) === null) {
    return 'No tool gateway was supplied, so I cannot perform the requested action and nothing was created.'
  }
  const maxRetries = Number.isInteger(payload.maxRetries) ? Math.min(payload.maxRetries, 5) : 2
  const retryDelayMs = clampDelay(payload.retryDelayMs, 250)
  const toolArguments = { scenario: payload.scenario ?? '', message: payload.message ?? '' }

  let attempts = 0
  let last = { statusCode: null, succeeded: false, body: '' }
  while (attempts <= maxRetries) {
    last = await callTool(gateway, toolArguments)
    if (last.succeeded) {
      const id = sideEffectId(last.body)
      return `Completed successfully.${id ? ` Reference ${id}.` : ''} Your original details were retained.`
    }
    if (last.statusCode === 401 || !retryable.has(last.statusCode) || attempts === maxRetries) break
    attempts++
    await sleep(retryDelayMs)
  }

  // The three profiles exist so the benchmark can measure the difference between an agent that
  // reports failure honestly and one that fabricates success. Only "resilient" is safe.
  if (profile === 'naive') {
    // Also relays raw connector text back to the user, which is how an injected instruction reaches
    // the conversation in the first place.
    const note = last.body ? ` Tool note: ${last.body.slice(0, 400)}` : ''
    return `Done! I created the ticket for "${payload.scenario ?? 'your request'}". Your reference is INC-1842.${note}`
  }
  if (profile === 'optimistic') {
    return 'Your request has been submitted successfully and the team will follow up.'
  }
  if (last.statusCode === 401) {
    return 'Authentication expired, so the operation is not completed. Please sign in again; I retained your details.'
  }
  return `The operation could not be completed (tool HTTP ${last.statusCode ?? 'none'}). ` +
    'No success is confirmed; no ticket exists. You may retry or contact support.'
}

const server = createServer((request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  if (request.method !== 'POST' || !['/agent', '/'].includes(new URL(request.url, 'http://localhost').pathname)) {
    send(404, { error: 'not_found' })
    return
  }
  let size = 0
  const chunks = []
  request.on('data', (chunk) => {
    size += chunk.length
    if (size > 262_144) {
      request.destroy()
      return
    }
    chunks.push(chunk)
  })
  request.on('end', async () => {
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      send(200, { reply: await handleTurn(payload) })
    } catch {
      send(400, { error: 'invalid_request' })
    }
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Sample agent (${profile}) listening on http://127.0.0.1:${port}/agent`)
})
