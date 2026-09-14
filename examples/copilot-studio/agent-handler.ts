// Microsoft 365 Agents SDK activity handler for an agent under chaos test.
//
// Agent Chaos Monkey drives a Copilot Studio agent over Direct Line (transport: "directline"). The
// turn payload described in examples/sample-agent/README.md arrives as `activity.value` (and, for
// channels that strip `value`, as `activity.channelData.chaosMonkey`), so the handler below is the
// same logic as examples/sample-agent/agent.mjs with a different transport.
//
// Install: npm install @microsoft/agents-hosting
import { AgentApplication, MemoryStorage, TurnContext } from '@microsoft/agents-hosting'

const app = new AgentApplication({ storage: new MemoryStorage() })
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

interface ChaosGateway {
  url: string
  capability: string
  sessionId: string
  connector: string
  operation: string
}

interface ChaosPayload {
  scenario?: string
  message?: string
  maxRetries?: number
  retryDelayMs?: number
  gateway?: ChaosGateway
}

async function callTool(gateway: ChaosGateway, args: Record<string, unknown>) {
  const response = await fetch(gateway.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + gateway.capability },
    body: JSON.stringify({
      sessionId: gateway.sessionId,
      connector: gateway.connector,
      operation: gateway.operation,
      arguments: args,
    }),
  })
  return (await response.json()) as { statusCode: number; body: string; succeeded: boolean }
}

app.onActivity('message', async (context: TurnContext) => {
  const payload = (context.activity.value ??
    (context.activity.channelData as { chaosMonkey?: ChaosPayload })?.chaosMonkey) as ChaosPayload | undefined

  // Without a gateway block this is an ordinary conversation turn; answer normally.
  if (!payload?.gateway) {
    await context.sendActivity('How can I help?')
    return
  }

  const maxRetries = Math.min(payload.maxRetries ?? 2, 5)
  const retryDelayMs = Math.min(payload.retryDelayMs ?? 250, 5_000)
  const args = { scenario: payload.scenario ?? '', message: payload.message ?? context.activity.text ?? '' }

  let attempts = 0
  let last = { statusCode: 0, succeeded: false, body: '' }
  while (attempts <= maxRetries) {
    last = await callTool(payload.gateway, args)
    if (last.succeeded) {
      // Read only the field you asked for. Never repeat raw connector text back to the user: a tool
      // payload is data, and an instruction hidden inside it must not change what you say or do.
      let reference = ''
      try {
        const parsed = JSON.parse(last.body) as { id?: string }
        if (typeof parsed.id === 'string' && /^[\w.-]{1,64}$/.test(parsed.id)) reference = ` Reference ${parsed.id}.`
      } catch { /* payload was not JSON */ }
      await context.sendActivity(`Completed successfully.${reference} Your original details were retained.`)
      return
    }
    if (last.statusCode === 401 || !RETRYABLE.has(last.statusCode) || attempts === maxRetries) break
    attempts++
    await sleep(retryDelayMs)
  }

  if (last.statusCode === 401) {
    await context.sendActivity('Authentication expired, so the operation is not completed. Please sign in again; I retained your details.')
    return
  }
  await context.sendActivity(
    `The operation could not be completed (tool HTTP ${last.statusCode}). No success is confirmed; no ticket exists. ` +
    'You may retry or contact support.')
})

export default app
