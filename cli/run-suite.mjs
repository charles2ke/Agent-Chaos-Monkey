#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const usage = 'node cli/run-suite.mjs <suite.json> [--url http://localhost:5249] [--output results] [--timeout-ms 60000] [--allow-inconclusive]'
const args = process.argv.slice(2)
const suitePath = args.shift()
let baseUrl = 'http://localhost:5249'
let output = 'results'
let timeoutMs = 60_000
let allowInconclusive = false

try {
  if (!suitePath || suitePath.startsWith('--')) throw new Error(usage)
  while (args.length) {
    const flag = args.shift()
    if (flag === '--allow-inconclusive') allowInconclusive = true
    else if (flag === '--url' && args.length) baseUrl = args.shift()
    else if (flag === '--output' && args.length) output = args.shift()
    else if (flag === '--timeout-ms' && args.length) timeoutMs = Number(args.shift())
    else throw new Error(usage)
  }
  const url = new URL(baseUrl)
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('API URL must use HTTPS (or loopback HTTP), without credentials, query, or fragment.')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
    throw new Error('Timeout must be between 1 and 600000 ms.')
  }
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const token = process.env.CHAOS_AGENT_API_KEY
const sensitiveKey = /^(?:agentApiKey|api[-_]?key|authorization|password|secret|token|access[-_]?token|refresh[-_]?token|cookie|credential|gatewayToken)$/i
function redact(value) {
  if (typeof value === 'string') {
    let safe = token ? value.split(token).join('[REDACTED]') : value
    safe = safe.replace(/https?:\/\/[^\s"'<>]+/gi, (text) => {
      try {
        const url = new URL(text)
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString()
      } catch { return '[REDACTED URL]' }
    })
    return safe.replace(/\b(?:Bearer|Basic)\s+[^\s"',;]+/gi, '[REDACTED]')
      .replace(/((?:api[-_]?key|password|secret|token|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, '$1[REDACTED]')
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(item)]))
  }
  return value
}

function containsCredentials(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => sensitiveKey.test(key) || containsCredentials(item))
}

function validResult(result) {
  const outcomes = ['pass', 'fail', 'inconclusive']
  return result && outcomes.includes(result.outcome) &&
    Array.isArray(result.runs) && result.runs.length > 0 &&
    result.runs.every(run => outcomes.includes(run.outcome) &&
      Array.isArray(run.assertions) && Array.isArray(run.findings) &&
      run.assertions.every(assertion => outcomes.includes(assertion.outcome) &&
        ['critical', 'warning'].includes(assertion.severity)))
}

const results = []
let infrastructureError = false
let criticalFailure = false
let inconclusive = false
try {
  const text = await readFile(resolve(suitePath), 'utf8')
  if (Buffer.byteLength(text) > 2_000_000) throw new Error('Suite exceeds 2 MB.')
  const suite = JSON.parse(text)
  if (suite.schemaVersion !== 1 || !Array.isArray(suite.tests) ||
      !suite.tests.length || suite.tests.length > 100) {
    throw new Error('Expected a version 1 suite containing 1–100 tests.')
  }
  if (containsCredentials(suite)) throw new Error('Suite must not contain credentials; use CHAOS_AGENT_API_KEY.')
  const ids = new Set()
  for (const test of suite.tests) {
    if (!test || typeof test.id !== 'string' || !test.id || ids.has(test.id) ||
        typeof test.name !== 'string' || !test.name ||
        !test.definition || test.definition.schemaVersion !== 1 ||
        !Array.isArray(test.definition.assertions) || !test.definition.assertions.length) {
      throw new Error('Each test requires a unique id, name, version 1 definition and nonempty assertions.')
    }
    ids.add(test.id)
  }
  for (const test of suite.tests) {
    try {
      const response = await fetch(new URL('/api/lab/run', baseUrl), {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ definition: test.definition, ...(token ? { agentApiKey: token } : {}) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}; check server configuration and suite definition.`)
      const result = await response.json()
      if (!validResult(result)) throw new Error('API returned an invalid laboratory report.')
      if (result.runs.some(run => run.infrastructureError)) {
        infrastructureError = true
        results.push({ id: test.id, name: test.name, outcome: 'infrastructure-error',
          error: 'Agent transport or laboratory run lifetime failed; partial evidence is retained.',
          result: redact(result) })
        console.error(`${redact(test.name)}: agent infrastructure error`)
        continue
      }
      const critical = result.runs.some(run =>
        run.assertions.some(assertion => assertion.severity === 'critical' && assertion.outcome === 'fail') ||
        run.findings.some(finding => finding.severity.toLowerCase() === 'critical'))
      // A failing report without any failing assertion cannot safely be treated as a warning.
      const unexplainedFailure = result.outcome === 'fail' &&
        !result.runs.some(run => run.assertions.some(assertion => assertion.outcome === 'fail'))
      const uncertain = result.outcome === 'inconclusive' || result.runs.some(run =>
        run.outcome === 'inconclusive' || run.assertions.some(assertion => assertion.outcome === 'inconclusive'))
      criticalFailure ||= critical || unexplainedFailure
      inconclusive ||= uncertain
      results.push({ id: test.id, name: test.name, outcome: result.outcome,
        gateFailure: critical || unexplainedFailure, inconclusive: uncertain, result: redact(result) })
      console.log(`${redact(test.name)}: ${result.outcome}`)
    } catch (error) {
      infrastructureError = true
      const message = ['TimeoutError', 'AbortError'].includes(error.name)
        ? `Experiment exceeded the ${timeoutMs} ms runner timeout; no resilience conclusion was made.`
        : 'Experiment could not complete. Check API availability, configuration, and the suite schema.'
      results.push({ id: test.id, name: test.name, outcome: 'infrastructure-error', error: message })
      console.error(`${redact(test.name)}: ${message}`)
    }
  }
} catch (error) {
  infrastructureError = true
  results.push({ id: 'suite', name: 'Suite loading', outcome: 'infrastructure-error',
    error: error instanceof SyntaxError ? 'Invalid suite JSON.' : 'Unable to load suite. Check path, size, schema, unique IDs, assertions and absence of credentials.' })
}

const exitCode = infrastructureError ? 2 : criticalFailure ? 1 : inconclusive && !allowInconclusive ? 3 : 0
const report = redact({
  schemaVersion: 1,
  completedAt: new Date().toISOString(),
  outcome: infrastructureError ? 'infrastructure-error' : criticalFailure ? 'fail' : inconclusive ? 'inconclusive' : 'pass',
  exitCode,
  results,
})
function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char])
}
const cases = report.results.map(test => {
  const content = test.error ? `<error message="${xml(test.error)}"/>`
    : test.gateFailure ? `<failure message="Critical resilience violation">${xml(JSON.stringify(test.result))}</failure>`
    : test.inconclusive ? '<skipped message="Insufficient evidence; see JSON report"/>'
    : ''
  return `  <testcase classname="ChaosMonkey" name="${xml(test.name)}">${content}</testcase>`
})
try {
  await mkdir(resolve(output), { recursive: true })
  await writeFile(join(resolve(output), 'chaos-results.json'), JSON.stringify(report, null, 2) + '\n')
  await writeFile(join(resolve(output), 'chaos-results.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ChaosMonkey" tests="${results.length}" failures="${results.filter(test => test.gateFailure).length}" errors="${results.filter(test => test.error).length}" skipped="${results.filter(test => !test.error && !test.gateFailure && test.inconclusive).length}">\n${cases.join('\n')}\n</testsuite>\n`)
} catch {
  console.error('Unable to write suite reports.')
  process.exit(2)
}
process.exitCode = exitCode
