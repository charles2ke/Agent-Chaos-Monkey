#!/usr/bin/env node
// Converts a chaos suite report (cli/run-suite.mjs output) into the Azure AI evaluation schema so
// that a run can be uploaded to an Azure AI Foundry project and rendered in evaluation dashboards.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const usage = 'node cli/export-azure-eval.mjs <chaos-results.json> [--output results/azure] [--run-name <name>]'

export function slug(value) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'unnamed'
}

// Azure AI evaluation rows carry numeric scores; an inconclusive outcome has no defensible number.
export function outcomeScore(outcome) {
  return outcome === 'pass' ? 1 : outcome === 'fail' ? 0 : null
}

function mean(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (!numbers.length) return null
  return Math.round((numbers.reduce((total, value) => total + value, 0) / numbers.length) * 1000) / 1000
}

export function buildRows(report) {
  return (report.results ?? []).map((test) => {
    const result = test.result ?? {}
    const definition = result.definition ?? {}
    const runs = Array.isArray(result.runs) ? result.runs : []
    const faults = (definition.faults ?? []).map((fault) => `${fault.mode}@${fault.invocation}`).join(', ')
    const row = {
      'inputs.id': test.id,
      'inputs.name': test.name,
      'inputs.query': definition.scenario ?? '',
      'inputs.context': [definition.connector, definition.operation].filter(Boolean).join('.'),
      'inputs.injected_faults': faults,
      'inputs.agent_version': definition.agentVersion ?? '',
      'outputs.response': runs.map((run) => run.agentResponse ?? '').join('\n').slice(0, 20_000),
      'outputs.chaos_resilience.result': test.outcome === 'pass' ? 'pass' : test.outcome === 'fail' ? 'fail' : 'inconclusive',
      'outputs.chaos_resilience.score': outcomeScore(test.outcome),
      'outputs.chaos_resilience.reason': runs
        .flatMap((run) => (run.findings ?? []).map((finding) => `${finding.severity}: ${finding.title} — ${finding.detail}`))
        .join(' | ')
        .slice(0, 4_000) || 'No findings were recorded for this test.',
    }
    // Every dimension and assertion becomes its own evaluator column, which is how Foundry
    // renders per-metric columns next to the response.
    for (const run of runs) {
      for (const dimension of run.dimensions ?? []) {
        const name = `chaos_${slug(dimension.name)}`
        if (row[`outputs.${name}.result`] === undefined || dimension.outcome === 'fail') {
          row[`outputs.${name}.result`] = dimension.outcome
          row[`outputs.${name}.score`] = outcomeScore(dimension.outcome)
          row[`outputs.${name}.reason`] = String(dimension.detail ?? '').slice(0, 2_000)
        }
      }
      for (const assertion of run.assertions ?? []) {
        const name = `chaos_assertion_${slug(assertion.id)}`
        if (row[`outputs.${name}.result`] === undefined || assertion.outcome === 'fail') {
          row[`outputs.${name}.result`] = assertion.outcome
          row[`outputs.${name}.score`] = outcomeScore(assertion.outcome)
          row[`outputs.${name}.reason`] = String(assertion.detail ?? '').slice(0, 2_000)
        }
      }
    }
    return row
  })
}

export function buildMetrics(rows) {
  const metrics = {}
  const evaluators = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const match = /^outputs\.(.+)\.score$/.exec(key)
      if (match) evaluators.add(match[1])
    }
  }
  for (const evaluator of [...evaluators].sort()) {
    const scores = rows.map((row) => row[`outputs.${evaluator}.score`])
    metrics[`${evaluator}.score`] = mean(scores)
    const assessed = rows.filter((row) => row[`outputs.${evaluator}.result`] !== undefined &&
      row[`outputs.${evaluator}.result`] !== 'inconclusive')
    metrics[`${evaluator}.pass_rate`] = assessed.length
      ? Math.round((assessed.filter((row) => row[`outputs.${evaluator}.result`] === 'pass').length / assessed.length) * 1000) / 1000
      : null
    metrics[`${evaluator}.inconclusive_rate`] = rows.length
      ? Math.round((rows.filter((row) => row[`outputs.${evaluator}.result`] === 'inconclusive').length / rows.length) * 1000) / 1000
      : null
  }
  return metrics
}

export function buildEvaluation(report, runName) {
  const rows = buildRows(report)
  return {
    // Mirrors the shape produced by azure-ai-evaluation `evaluate()`.
    evaluation_name: runName,
    rows,
    metrics: buildMetrics(rows),
    studio_url: null,
    tags: {
      tool: 'agent-chaos-monkey',
      suite_outcome: report.outcome ?? 'unknown',
      completed_at: report.completedAt ?? new Date().toISOString(),
    },
  }
}

async function main(argv) {
  const args = [...argv]
  const input = args.shift()
  let output = 'results/azure'
  let runName = 'agent-chaos-monkey'
  if (!input || input.startsWith('--')) throw new Error(usage)
  while (args.length) {
    const flag = args.shift()
    if (flag === '--output' && args.length) output = args.shift()
    else if (flag === '--run-name' && args.length) runName = args.shift()
    else throw new Error(usage)
  }
  if (!/^[\w .-]{1,100}$/.test(runName)) throw new Error('Run name must be 1–100 word characters, spaces, dots or dashes.')
  const report = JSON.parse(await readFile(resolve(input), 'utf8'))
  if (report.schemaVersion !== 1 || !Array.isArray(report.results)) {
    throw new Error('Expected a version 1 chaos results report produced by cli/run-suite.mjs.')
  }
  const evaluation = buildEvaluation(report, runName)
  await mkdir(resolve(output), { recursive: true })
  await writeFile(join(resolve(output), 'azure-ai-evaluation.jsonl'),
    evaluation.rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
  await writeFile(join(resolve(output), 'azure-ai-evaluation.json'), JSON.stringify(evaluation, null, 2) + '\n')
  console.log(`Wrote ${evaluation.rows.length} evaluation rows and ${Object.keys(evaluation.metrics).length} metrics to ${output}.`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid results JSON.' : error.message)
    process.exit(2)
  }
}
