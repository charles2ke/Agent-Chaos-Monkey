#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const usage = 'node cli/compare-baseline.mjs <current-results.json> [--baseline <baseline.json>] [--output <markdown-path>] [--title <text>]'
const args = process.argv.slice(2)
const currentPath = args.shift()
let baselinePath = null
let outputPath = null
let title = 'Chaos Monkey suite'

try {
  if (!currentPath || currentPath.startsWith('--')) throw new Error(usage)
  while (args.length) {
    const flag = args.shift()
    if (flag === '--baseline' && args.length) baselinePath = args.shift()
    else if (flag === '--output' && args.length) outputPath = args.shift()
    else if (flag === '--title' && args.length) title = args.shift()
    else throw new Error(usage)
  }
} catch (error) {
  console.error(error.message)
  process.exit(2)
}

const outcomeIcons = { pass: '✅', fail: '❌', inconclusive: '⚠️', 'infrastructure-error': '🚨' }
const scoreForOutcome = { pass: 100, fail: 0, inconclusive: null, 'infrastructure-error': null }

function cell(value) {
  return String(value ?? '').replace(/[|\r\n]/g, ' ').slice(0, 300)
}

const sensitiveKey = /^(?:agentApiKey|api[-_]?key|authorization|password|secret|token|access[-_]?token|refresh[-_]?token|cookie|credential|gatewayToken)$/i
function redact(value) {
  if (typeof value === 'string') {
    let safe = value.replace(/https?:\/\/[^\s"'<>]+/gi, (text) => {
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

function validReport(report) {
  return report && report.schemaVersion === 1 && Array.isArray(report.results)
}

async function loadReport(path) {
  const text = await readFile(resolve(path), 'utf8')
  const report = JSON.parse(text)
  if (!validReport(report)) throw new Error('Unexpected report schema.')
  return report
}

// Build a map: testId -> { name, outcome, dimensions: Map<name, {score, outcome, detail}> }.
// Dimensions are collapsed across runs by name; the worst (lowest) score wins so that a
// single failing invocation is not hidden behind other passing runs.
function summarize(report) {
  const tests = new Map()
  for (const test of report.results) {
    const dims = new Map()
    const runs = test.result?.runs ?? []
    for (const run of runs) {
      for (const dim of run.dimensions ?? []) {
        if (!dim || typeof dim.name !== 'string') continue
        const score = scoreForOutcome[dim.outcome] ?? null
        const existing = dims.get(dim.name)
        if (!existing) {
          dims.set(dim.name, { score, outcome: dim.outcome, detail: dim.detail ?? '' })
        } else {
          // Prefer the worse outcome (lower score, or non-null failure over null inconclusive).
          const worse = (existing.score === null && score !== null) ? { score, outcome: dim.outcome, detail: dim.detail ?? '' }
            : (score !== null && existing.score !== null && score < existing.score) ? { score, outcome: dim.outcome, detail: dim.detail ?? '' }
            : existing
          dims.set(dim.name, worse)
        }
      }
    }
    tests.set(test.id, { id: test.id, name: test.name, outcome: test.outcome, dimensions: dims })
  }
  return { outcome: report.outcome, exitCode: report.exitCode, tests }
}

function deltaArrow(current, baseline) {
  if (baseline === undefined) return { arrow: '🆕', label: 'new' }
  if (current === undefined) return { arrow: '➖', label: 'removed' }
  if (current === null && baseline === null) return { arrow: '➡️', label: 'unchanged' }
  if (current === null) return { arrow: '⚠️', label: 'inconclusive' }
  if (baseline === null) return { arrow: '🆕', label: 'new score' }
  if (current > baseline) return { arrow: '⬆️', label: 'improved' }
  if (current < baseline) return { arrow: '⬇️', label: 'regressed' }
  return { arrow: '➡️', label: 'unchanged' }
}

function formatScore(score) {
  return score === null || score === undefined ? '—' : String(score)
}

function formatDelta(current, baseline) {
  if (current === null || current === undefined || baseline === null || baseline === undefined) return '—'
  const diff = current - baseline
  if (diff === 0) return '0'
  return diff > 0 ? `+${diff}` : String(diff)
}

function buildMarkdown(currentReport, baselineReport, { title, baselinePresent, baselineError }) {
  const current = summarize(currentReport)
  const lines = []
  const overallIcon = outcomeIcons[current.outcome] ?? ''
  lines.push(`### ${cell(title)}: ${overallIcon} ${cell(current.outcome)} (exit ${cell(current.exitCode)})`)
  lines.push('')

  if (baselineError) {
    lines.push(`> Baseline could not be read (${cell(baselineError)}). Showing current results only.`)
    lines.push('')
  } else if (!baselinePresent) {
    lines.push('> No baseline committed — showing current results only. Commit `examples/baseline/agent-regression-baseline.json` to enable score-delta gating.')
    lines.push('')
  }

  const baseline = baselineReport ? summarize(baselineReport) : null

  if (baseline) {
    const baseIcon = outcomeIcons[baseline.outcome] ?? ''
    lines.push(`Baseline overall: ${baseIcon} ${cell(baseline.outcome)} (exit ${cell(baseline.exitCode)})`)
    lines.push('')
  }

  lines.push('#### Per-test outcomes')
  lines.push('')
  lines.push('| | Test | Current | Baseline | Change |')
  lines.push('| --- | --- | --- | --- | --- |')
  const allTestIds = new Set([...current.tests.keys(), ...(baseline?.tests.keys() ?? [])])
  for (const id of allTestIds) {
    const cur = current.tests.get(id)
    const base = baseline?.tests.get(id)
    const name = cur?.name ?? base?.name ?? id
    const curOutcome = cur?.outcome ?? 'removed'
    const baseOutcome = base?.outcome ?? (baseline ? 'new' : '—')
    let change = '—'
    if (baseline) {
      if (!cur) change = '➖ removed'
      else if (!base) change = '🆕 new'
      else if (cur.outcome === base.outcome) change = '➡️ unchanged'
      else if (cur.outcome === 'pass') change = '⬆️ improved'
      else if (base.outcome === 'pass') change = '⬇️ regressed'
      else change = `↔️ ${cell(base.outcome)} → ${cell(cur.outcome)}`
    }
    const icon = outcomeIcons[curOutcome] ?? ''
    lines.push(`| ${icon} | ${cell(name)} | ${cell(curOutcome)} | ${cell(baseOutcome)} | ${change} |`)
  }
  lines.push('')

  lines.push('#### Per-dimension scores')
  lines.push('')
  lines.push('| Test | Dimension | Current | Baseline | Δ | Change | Detail |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const id of allTestIds) {
    const cur = current.tests.get(id)
    const base = baseline?.tests.get(id)
    const name = cur?.name ?? base?.name ?? id
    const dimNames = new Set([...(cur?.dimensions.keys() ?? []), ...(base?.dimensions.keys() ?? [])])
    for (const dim of dimNames) {
      const curDim = cur?.dimensions.get(dim)
      const baseDim = base?.dimensions.get(dim)
      const curScore = curDim ? curDim.score : undefined
      const baseScore = baseDim ? baseDim.score : undefined
      const { arrow, label } = deltaArrow(curScore, baseline ? baseScore : undefined)
      lines.push(`| ${cell(name)} | ${cell(dim)} | ${formatScore(curScore)} | ${baseline ? formatScore(baseScore) : '—'} | ${baseline ? formatDelta(curScore, baseScore) : '—'} | ${arrow} ${cell(label)} | ${cell(curDim?.detail ?? baseDim?.detail ?? '')} |`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

try {
  const currentReport = redact(await loadReport(currentPath))
  let baselineReport = null
  let baselinePresent = false
  let baselineError = null
  if (baselinePath) {
    try {
      baselineReport = redact(await loadReport(baselinePath))
      baselinePresent = true
    } catch (error) {
      baselinePresent = false
      baselineError = error instanceof SyntaxError ? 'invalid JSON' : 'unreadable'
    }
  }
  const markdown = buildMarkdown(currentReport, baselineReport, { title, baselinePresent, baselineError })
  process.stdout.write(markdown + '\n')
  if (outputPath) {
    await writeFile(resolve(outputPath), markdown + '\n')
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid results JSON.' : `Unable to compare baseline: ${error.message}`)
  process.exit(2)
}
