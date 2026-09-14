import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = new URL('./compare-baseline.mjs', import.meta.url).pathname

function run(args, { cwd } = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}

function makeReport({ outcome = 'pass', exitCode = 0, tests }) {
  return {
    schemaVersion: 1,
    completedAt: '2024-01-01T00:00:00.000Z',
    outcome,
    exitCode,
    results: tests,
  }
}

function makeTest(id, name, { outcome = 'pass', dims = [] }) {
  return {
    id,
    name,
    outcome,
    result: {
      outcome,
      runs: [
        {
          outcome,
          assertions: [],
          findings: [],
          dimensions: dims,
        },
      ],
    },
  }
}

function scratchDir() {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-cmp-'))
  return {
    dir,
    write(name, obj) {
      const p = join(dir, name)
      writeFileSync(p, JSON.stringify(obj))
      return p
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('exits 2 on missing current file', () => {
  const s = scratchDir()
  try {
    const result = run(['does-not-exist.json'])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Unable to compare baseline/)
  } finally { s.cleanup() }
})

test('exits 2 on invalid current JSON', () => {
  const s = scratchDir()
  try {
    const p = join(s.dir, 'bad.json')
    writeFileSync(p, 'not-json')
    const result = run([p])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Invalid results JSON/)
  } finally { s.cleanup() }
})

test('missing baseline still succeeds with a note', () => {
  const s = scratchDir()
  try {
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [{ name: 'Evidence', outcome: 'pass', detail: 'ok' }] }),
    ]}))
    const result = run([current, '--baseline', join(s.dir, 'missing.json')])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Baseline could not be read/)
    assert.match(result.stdout, /Test one/)
  } finally { s.cleanup() }
})

test('no --baseline flag prints a "no baseline committed" note', () => {
  const s = scratchDir()
  try {
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [] }),
    ]}))
    const result = run([current])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /No baseline committed/)
  } finally { s.cleanup() }
})

test('regression is detected and marked ⬇️', () => {
  const s = scratchDir()
  try {
    const baseline = s.write('baseline.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { outcome: 'pass', dims: [{ name: 'Evidence', outcome: 'pass', detail: 'ok' }] }),
    ]}))
    const current = s.write('current.json', makeReport({ outcome: 'fail', exitCode: 1, tests: [
      makeTest('t1', 'Test one', { outcome: 'fail', dims: [{ name: 'Evidence', outcome: 'fail', detail: 'broken' }] }),
    ]}))
    const result = run([current, '--baseline', baseline])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /⬇️ regressed/)
    assert.match(result.stdout, /-100/)
  } finally { s.cleanup() }
})

test('improvement is detected and marked ⬆️', () => {
  const s = scratchDir()
  try {
    const baseline = s.write('baseline.json', makeReport({ outcome: 'fail', exitCode: 1, tests: [
      makeTest('t1', 'Test one', { outcome: 'fail', dims: [{ name: 'Evidence', outcome: 'fail', detail: 'broken' }] }),
    ]}))
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { outcome: 'pass', dims: [{ name: 'Evidence', outcome: 'pass', detail: 'ok' }] }),
    ]}))
    const result = run([current, '--baseline', baseline])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /⬆️ improved/)
    assert.match(result.stdout, /\+100/)
  } finally { s.cleanup() }
})

test('new and removed dimensions are annotated', () => {
  const s = scratchDir()
  try {
    const baseline = s.write('baseline.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [{ name: 'Latency', outcome: 'pass', detail: 'ok' }] }),
      makeTest('t-gone', 'Removed', { dims: [] }),
    ]}))
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [{ name: 'Retry behavior', outcome: 'pass', detail: 'ok' }] }),
      makeTest('t-new', 'Brand new', { dims: [] }),
    ]}))
    const result = run([current, '--baseline', baseline])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /🆕 new/)
    assert.match(result.stdout, /➖ removed/)
  } finally { s.cleanup() }
})

test('invalid baseline JSON is reported but does not crash', () => {
  const s = scratchDir()
  try {
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [] }),
    ]}))
    const bad = join(s.dir, 'baseline.json')
    writeFileSync(bad, '{bad json')
    const result = run([current, '--baseline', bad])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Baseline could not be read/)
  } finally { s.cleanup() }
})

test('output file is written when --output is supplied', () => {
  const s = scratchDir()
  try {
    const current = s.write('current.json', makeReport({ tests: [
      makeTest('t1', 'Test one', { dims: [] }),
    ]}))
    const out = join(s.dir, 'report.md')
    const result = run([current, '--output', out, '--title', 'Custom Title'])
    assert.equal(result.status, 0)
    const written = readFileSync(out, 'utf8')
    assert.match(written, /Custom Title/)
  } finally { s.cleanup() }
})
