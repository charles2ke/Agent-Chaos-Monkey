#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const usage = 'node cli/summarize-results.mjs <chaos-results.json> [--title "Regression suite"]'
const args = process.argv.slice(2)
const reportPath = args.shift()
let title = 'Resilience suite'

try {
  if (!reportPath || reportPath.startsWith('--')) throw new Error(usage)
  while (args.length) {
    const flag = args.shift()
    if (flag === '--title' && args.length) title = args.shift()
    else throw new Error(usage)
  }
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const icons = { pass: '✅', fail: '❌', inconclusive: '⚠️', 'infrastructure-error': '🚨' }
function cell(value) {
  return String(value ?? '').replace(/[|\r\n]/g, ' ').slice(0, 300)
}

try {
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'))
  if (report.schemaVersion !== 1 || !Array.isArray(report.results)) throw new Error('Unexpected report schema.')
  const lines = [
    `### ${cell(title)}: ${icons[report.outcome] ?? ''} ${cell(report.outcome)} (exit ${cell(report.exitCode)})`,
    '',
    '| | Test | Outcome | Detail |',
    '| --- | --- | --- | --- |',
  ]
  for (const test of report.results) {
    const detail = test.error ?? (test.gateFailure ? 'Critical resilience violation'
      : test.inconclusive ? 'Insufficient evidence' : '')
    lines.push(`| ${icons[test.outcome] ?? ''} | ${cell(test.name)} | ${cell(test.outcome)} | ${cell(detail)} |`)
  }
  console.log(lines.join('\n'))
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid results JSON.' : `Unable to summarize results: ${error.message}`)
  process.exit(2)
}
