#!/usr/bin/env node
// A disposable upstream "connector" for the sample agent. The laboratory gateway forwards allowed
// tool calls here, so a run exercises a real HTTP boundary with real, inspectable side effects.
// It honours the Idempotency-Key header that the gateway sends, so a retried logical operation
// returns the original identifier instead of creating a second record.
//
// Usage: node examples/sample-agent/tool.mjs [--port 5251]
import { createServer } from 'node:http'

const args = process.argv.slice(2)
let port = 5251
while (args.length) {
  const flag = args.shift()
  if (flag === '--port' && args.length) port = Number(args.shift())
  else {
    console.error('Usage: node examples/sample-agent/tool.mjs [--port 5251]')
    process.exit(2)
  }
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error('Port must be between 1 and 65535.')
  process.exit(2)
}

const created = new Map()
let sequence = 0

const server = createServer((request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  if (request.method !== 'POST') {
    send(405, { error: 'method_not_allowed' })
    return
  }
  let size = 0
  request.on('data', (chunk) => {
    size += chunk.length
    if (size > 65_536) request.destroy()
  })
  request.on('end', () => {
    const key = request.headers['idempotency-key']
    const existing = typeof key === 'string' ? created.get(key) : undefined
    if (existing) {
      send(200, { status: 'ok', id: existing, duplicate: true })
      return
    }
    const id = `INC-${1000 + ++sequence}`
    if (typeof key === 'string') created.set(key, id)
    send(200, { status: 'ok', id })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Sample connector listening on http://127.0.0.1:${port}/create`)
})
