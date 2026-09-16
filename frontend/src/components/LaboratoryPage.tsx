import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { assertionKinds, defaultDefinition, faultModes, parseImport, readStorage, redact, safeDefinition, safeIdentifier, safeTests, storageKey, summarize, validateDefinition, validateHistory, validateResult, validateTests } from '../lab'
import type { Assertion, ExperimentDefinition, LabResult, SavedTest, TestStatus } from '../lab'
import { simulateLab } from '../labSimulation'
import './laboratory.css'

const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function LaboratoryPage() {
  const [initial] = useState(readStorage)
  const [definition, setDefinition] = useState<ExperimentDefinition>({ ...initial.definition, transport: 'simulation' })
  const [tests, setTests] = useState(initial.tests)
  const [history, setHistory] = useState(initial.history)
  const [warning, setWarning] = useState(initial.warning)
  const [error, setError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState<LabResult | null>(null)
  const [running, setRunning] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTest, setSelectedTest] = useState<string | null>(null)
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>(initial.statuses)
  const [compareId, setCompareId] = useState('')
  const [compareOtherId, setCompareOtherId] = useState('')
  const [notice, setNotice] = useState('')
  const [storageEnabled, setStorageEnabled] = useState(!initial.warning)
  const secrets = [apiKey]

  useEffect(() => {
    if (!storageEnabled) return
    try {
      const safe = safeDefinition(validateDefinition(definition), [apiKey])
      localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, definition: safe,
        tests: safeTests(tests, [apiKey]), history: history.map(h => ({ ...h, id: safeIdentifier(h.id, [apiKey]), definition: safeDefinition(h.definition, [apiKey]) })),
        statuses: Object.fromEntries(tests.filter(t => testStatuses[t.id]).map(t => [safeIdentifier(t.id, [apiKey]), testStatuses[t.id]])) }))
    } catch (caught) {
      if (caught instanceof DOMException) queueMicrotask(() => setWarning('Browser storage unavailable or quota exceeded. Your work remains in memory; export it now.'))
      // Incomplete edits are kept in memory until the definition is valid.
    }
  }, [definition, tests, history, apiKey, storageEnabled, testStatuses])

  function change<K extends keyof ExperimentDefinition>(key: K, value: ExperimentDefinition[K]) {
    setDefinition(current => ({ ...current, [key]: value }))
  }
  async function run(candidate = definition, testId = selectedTest) {
    if (running) return
    setError(''); setNotice(''); setRunning(true)
    try {
      const validated = validateDefinition(candidate)
      if (validated.executionMode === 'single' && validated.faults.length > 1) throw new Error('Single mode accepts one fault; choose matrix or sequence for multiple faults.')
      if (validated.executionMode === 'sequence' && new Set(validated.faults.map(f => `${f.invocation}:${f.connector ?? validated.connector}:${f.operation ?? validated.operation}`)).size !== validated.faults.length) throw new Error('Sequence faults must use distinct scoped invocations.')
      let next: LabResult
      if (validated.transport === 'simulation') next = simulateLab(validated)
      else {
        if (staticDemo) throw new Error('Live gateway is unsupported on GitHub Pages. Run the backend locally.')
        if (!validated.agentEndpoint) throw new Error('Live gateway requires an agent endpoint.')
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 180000)
        try {
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/lab/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ definition: validated, ...(apiKey ? { agentApiKey: apiKey } : {}) }),
          })
          if (!response.ok) throw new Error(`Gateway request failed (HTTP ${response.status}). Check endpoint configuration and backend logs.`)
          const body = await response.text()
          if (body.length > 2_000_000) throw new Error('Gateway report exceeds the safe display limit')
          next = validateResult(JSON.parse(body))
        } finally { clearTimeout(timeout) }
      }
      setResult(next)
      setHistory(current => [summarize(next, secrets), ...current].slice(0, 100))
      if (testId) {
        const test = tests.find(t => t.id === testId)
        const baseline = test?.baselineOutcome
        const status = next.outcome === 'inconclusive' ? 'Inconclusive' : next.outcome === 'fail' ? 'Failing' : baseline === 'fail' && test?.definition.transport === validated.transport ? 'Resolved' : 'Passing'
        setTestStatuses(current => ({ ...current, [testId]: status }))
      }
    } catch (caught) { setError(redact(caught instanceof Error ? caught.message : 'Experiment failed', secrets)) }
    finally { setRunning(false) }
  }
  function saveTest() {
    try {
      const valid = validateDefinition(definition)
      const previous = tests.find(t => t.id === selectedTest)
      const saved: SavedTest = { id: selectedTest ?? safeIdentifier(crypto.randomUUID()), name: valid.name, definition: safeDefinition(valid, secrets),
        ...(previous?.baselineOutcome && previous.definition.transport === valid.transport ? { baselineOutcome: previous.baselineOutcome } : result && JSON.stringify(result.definition) === JSON.stringify(valid) ? { baselineOutcome: result.outcome } : {}) }
      setTests(current => [saved, ...current.filter(t => t.id !== saved.id)].slice(0, 100))
      if (previous && JSON.stringify(previous.definition) !== JSON.stringify(saved.definition)) setTestStatuses(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== saved.id)))
      setSelectedTest(saved.id); setNotice('Saved as a regression test. Credentials and raw agent output are excluded.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid test') }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>, kind: 'suite' | 'history') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Import exceeds 1 MB')
      const value = parseImport(await file.text())
      if (kind === 'suite') {
        const imported = safeTests(validateTests(value), secrets)
        setTests(current => [...imported, ...current.filter(t => !imported.some(i => i.id === t.id))].slice(0, 100))
        setTestStatuses(current => Object.fromEntries(Object.entries(current).filter(([id]) => !imported.some(t => t.id === id))))
        setNotice(`Imported ${imported.length} tests. Imports never execute automatically.`)
      } else {
        const imported = validateHistory(value).map(h => ({ ...h, id: safeIdentifier(h.id, secrets), definition: safeDefinition(h.definition, secrets) }))
        setHistory(current => [...imported, ...current.filter(h => !imported.some(i => i.id === h.id))].slice(0, 100))
        setNotice(`Imported ${imported.length} history summaries. Imported outcomes are unverified; replay to collect fresh evidence.`)
      }
      setError('')
    } catch (caught) { setError(`Import rejected: ${caught instanceof Error ? caught.message : 'invalid file'}`) }
  }
  function load(d: ExperimentDefinition, id: string | null = null) {
    setDefinition({ ...d, transport: 'simulation' })
    setSelectedTest(id); setResult(null)
    setNotice('Loaded into editor. Replay uses simulation by default; explicitly opt in again for live gateway. Re-enter any redacted values.')
  }
  const compare = history.find(h => h.id === compareId)
  const compareOther = history.find(h => h.id === compareOtherId)
  const patchAssertion = (index: number, patch: Partial<Assertion>) => change('assertions', definition.assertions.map((a, i) => i === index ? { ...a, ...patch } : a))

  return (
    <section className="page lab" aria-label="Laboratory">
      <header className="page__header">
        <div className="lab-eyebrow">CHAOS ENGINEERING / REPRODUCIBLE EXPERIMENTS</div>
        <h2 className="page__title">Laboratory</h2>
        <p className="page__lead">Design a failure. Inspect the evidence. Keep the regression.</p>
      </header>
      <div className="lab-boundary">
        <strong>{definition.transport === 'simulation' ? 'SIMULATED · deterministic reference agent' : 'LIVE GATEWAY · explicit opt-in'}</strong>
        <p>{definition.transport === 'simulation' ? 'No network or real side effects. Timing is virtual; scores describe only the scripted reference agent, never your endpoint. Version labels do not alter simulated behavior.' : 'Your agent must call the backend-provided scoped tool gateway and return observable evidence. Ordinary endpoint responses cannot prove connector faults were applied. Real calls may have real side effects.'}</p>
        {staticDemo && <p>GitHub Pages: live gateway unavailable. All Laboratory simulations run locally in this browser.</p>}
      </div>
      {warning && <div role="status" className="lab-warning">{warning} {!storageEnabled && <button onClick={() => { setStorageEnabled(true); setWarning('') }}>Replace corrupt storage with current work</button>}</div>}
      {error && <div role="alert" className="lab-error">{error}</div>}
      {notice && <p role="status">{notice}</p>}
      <div className="lab-layout">
        <div className="lab-card">
          <h3>01 / Experiment design</h3>
          <div className="lab-fields">
            <label>Experiment name<input value={definition.name} maxLength={120} onChange={e => change('name', e.target.value)} /></label>
            <label>Agent version<input value={definition.agentVersion ?? ''} maxLength={100} onChange={e => change('agentVersion', e.target.value)} /></label>
            <label>Connector<input value={definition.connector} maxLength={100} onChange={e => change('connector', e.target.value)} /></label>
            <label>Operation<input value={definition.operation} maxLength={100} onChange={e => change('operation', e.target.value)} /></label>
          </div>
          <label>Scenario<textarea value={definition.scenario} maxLength={4000} onChange={e => change('scenario', e.target.value)} /></label>
          <label>Execution mode<select value={definition.executionMode} onChange={e => change('executionMode', e.target.value as ExperimentDefinition['executionMode'])}><option value="single">Single fault</option><option value="matrix">Matrix — isolated faults</option><option value="sequence">Sequence — ordered invocations</option></select></label>
          <p className="lab-hint">Every experiment includes a healthy control. Scope faults by connector, operation, and 1-based tool invocation. Matrix isolates each fault; sequence applies the schedule in one run.</p>
          <fieldset><legend>Fault schedule</legend>
            {definition.faults.map((fault, index) => <div className="lab-fault" key={index}>
              <label>Fault {index + 1}<select value={fault.mode} onChange={e => change('faults', definition.faults.map((f, i) => i === index ? { ...f, mode: e.target.value as typeof fault.mode } : f))}>{faultModes.map(mode => <option key={mode}>{mode}</option>)}</select></label>
              <label>Invocation {index + 1}<input type="number" min={1} max={100} value={fault.invocation} onChange={e => change('faults', definition.faults.map((f, i) => i === index ? { ...f, invocation: Number(e.target.value) } : f))} /></label>
              <label>Fault connector {index + 1}<input placeholder="Use experiment connector" value={fault.connector ?? ''} onChange={e => change('faults', definition.faults.map((f, i) => i === index ? { ...f, connector: e.target.value || undefined } : f))} /></label>
              <label>Fault operation {index + 1}<input placeholder="Use experiment operation" value={fault.operation ?? ''} onChange={e => change('faults', definition.faults.map((f, i) => i === index ? { ...f, operation: e.target.value || undefined } : f))} /></label>
              <button aria-label={`Remove fault ${index + 1}`} onClick={() => change('faults', definition.faults.filter((_, i) => i !== index))}>Remove</button>
            </div>)}
            <button disabled={definition.faults.length >= 20 || definition.executionMode === 'single' && definition.faults.length >= 1} onClick={() => change('faults', [...definition.faults, { invocation: definition.faults.length + 1, mode: 'Throttling' }])}>Add fault</button>
          </fieldset>
          <div className="lab-fields">
            {([['latencyMs', 'Injected latency (ms)', 0, 60000], ['toolTimeoutMs', 'Tool timeout (ms)', 1, 60000], ['maxRetries', 'Maximum retries', 0, 10], ['retryDelayMs', 'Initial retry backoff (ms)', 0, 60000]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={definition[key]} onChange={e => change(key, Number(e.target.value))} /></label>)}
          </div>
          <fieldset><legend>Multi-turn recovery</legend>
            {definition.turns.map((turn, index) => <div className="lab-turn" key={index}>
              <label>Follow-up {index + 1}<textarea maxLength={4000} value={turn.message} onChange={e => change('turns', definition.turns.map((t, i) => i === index ? { ...t, message: e.target.value } : t))} /></label>
              <label className="lab-check"><input type="checkbox" checked={turn.reauthenticate} onChange={e => change('turns', definition.turns.map((t, i) => i === index ? { ...t, reauthenticate: e.target.checked } : t))} />Reauthenticate before turn {index + 2}</label>
              <button onClick={() => change('turns', definition.turns.filter((_, i) => i !== index))}>Remove turn {index + 2}</button>
            </div>)}
            <button disabled={definition.turns.length >= 10} onClick={() => change('turns', [...definition.turns, { message: 'Continue the original request', reauthenticate: false }])}>Add follow-up turn</button>
          </fieldset>
          <details><summary>Agent connection & live boundary</summary>
            <label className="lab-check"><input type="checkbox" disabled={staticDemo} checked={definition.transport === 'gateway'} onChange={e => change('transport', e.target.checked ? 'gateway' : 'simulation')} />Opt in to live tool gateway</label>
            <label>Agent endpoint<input type="url" value={definition.agentEndpoint ?? ''} placeholder="https://agent.example/run" maxLength={2048} onChange={e => change('agentEndpoint', e.target.value)} /></label>
            <label>Agent API key (memory only)<input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} /></label>
            <p className="lab-hint">Credentials are never saved or exported. URL userinfo is rejected; query strings and fragments are removed from saved URLs. Use disposable test systems. Live auth recovery is an explicit harness signal, not an OAuth login.</p>
          </details>
        </div>
        <div className="lab-card">
          <h3>02 / Regression contract</h3>
          <p className="lab-hint">Assertions run against recorded evidence. Missing observations remain inconclusive, not a passing score.</p>
          {definition.assertions.map((assertion, index) => <div className="lab-assertion" key={index}>
            <label>Assertion {index + 1}<select value={assertion.kind} onChange={e => { const kind = e.target.value as Assertion['kind']; patchAssertion(index, { kind, expected: ['maxRetries', 'minBackoffMs'].includes(kind) ? 0 : true }) }}>{assertionKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
            <div className="lab-fields">
              <label>Expected {index + 1}{['maxRetries', 'minBackoffMs'].includes(assertion.kind) ? <input type="number" min={0} max={assertion.kind === 'maxRetries' ? 10 : 60000} value={Number(assertion.expected ?? 0)} onChange={e => patchAssertion(index, { expected: Number(e.target.value) })} /> : <select value={String(assertion.expected ?? true)} onChange={e => patchAssertion(index, { expected: e.target.value === 'true' })}><option>true</option><option>false</option></select>}</label>
              <label>Severity {index + 1}<select value={assertion.severity} onChange={e => patchAssertion(index, { severity: e.target.value as Assertion['severity'] })}><option>critical</option><option>warning</option></select></label>
            </div>
            <button aria-label={`Remove assertion ${index + 1}`} onClick={() => change('assertions', definition.assertions.filter((_, i) => i !== index))}>Remove assertion</button>
          </div>)}
          <button disabled={definition.assertions.length >= 30} onClick={() => change('assertions', [...definition.assertions, { id: crypto.randomUUID(), kind: 'maxRetries', expected: definition.maxRetries, severity: 'warning' }])}>Add assertion</button>
          <div className="lab-actions">
            <button className="button button--primary" disabled={running} onClick={() => void run()}>{running ? 'Running experiment…' : 'Run laboratory experiment'}</button>
            <button disabled={running} onClick={saveTest}>{selectedTest ? 'Update saved test' : 'Save as test'}</button>
            <button disabled={running} onClick={() => { setDefinition(defaultDefinition); setSelectedTest(null); setResult(null) }}>New experiment</button>
          </div>
          <p className="lab-hint">Up to 100 local summaries and 100 tests. Raw replies, trace text, credentials, and session identifiers stay in memory. Redacted replay definitions may require editing.</p>
        </div>
      </div>
      {result && <section className="lab-card lab-results" aria-label="Evidence report">
        <h3>03 / Evidence report <span className={`lab-outcome lab-outcome--${result.outcome}`}>{result.outcome}</span></h3>
        <p>{result.definition.name} · {result.definition.agentVersion || 'unversioned'} · evaluator evidence v1</p>
        <div className="lab-run-grid">{result.runs.map(run => <article className="lab-run" key={run.id}>
          <h4>{run.label}</h4><strong>{run.simulation ? 'SIMULATED' : 'LIVE / OBSERVATION REQUIRED'} · {run.outcome}</strong>
          <div className="lab-metrics"><div><b>{run.score ?? '—'}</b><span>evidence score / 100</span></div><div><b>{run.retryCount ?? '—'}</b><span>retries observed</span></div><div><b>{run.agentDurationMs} ms</b><span>{run.simulation ? 'virtual' : 'measured'} duration</span></div><div><b>{run.injectedDelayMs} ms</b><span>injected delay</span></div></div>
          <p className="lab-response">{redact(run.agentResponse, secrets)}</p>
          <h5>Dimensions</h5>{run.dimensions.map((d, i) => <p key={i}><strong>{d.name}: {d.outcome}</strong> — {redact(d.detail, secrets)}</p>)}
          <h5>Applied / skipped faults</h5>{run.faults.length === 0 ? <p>Healthy control — no faults planned.</p> : run.faults.map((f, i) => <p key={i}><strong>#{f.invocation} {f.mode} · {f.state}</strong> — {redact(f.detail, secrets)}</p>)}
          <h5>Assertions & evidence</h5>{run.assertions.map((a, i) => <details key={i}><summary>{a.outcome.toUpperCase()} · {a.id} · {a.severity}</summary><p>{redact(a.detail, secrets)}</p><ul>{a.evidence.map((e, i) => <li key={i}>{redact(e, secrets)}</li>)}</ul></details>)}
          <h5>Findings</h5>{run.findings.map((f, i) => <details key={i}><summary>{f.severity} · {f.title}</summary><p>{redact(f.detail, secrets)}</p><ul>{f.evidence.map((e, i) => <li key={i}>{redact(e, secrets)}</li>)}</ul></details>)}
          <details><summary>Tool trace · {run.trace.length} calls</summary><div className="lab-table-scroll"><table><thead><tr><th>Call / scope</th><th>Status</th><th>Timing / delay / backoff</th><th>Side effect</th></tr></thead><tbody>{run.trace.map((t, i) => <tr key={i}><td>#{t.invocation} {redact(t.connector, secrets)}.{redact(t.operation, secrets)}<small>{redact(t.detail, secrets)}</small></td><td>{t.statusCode ?? 'unknown / timeout'}</td><td>{t.durationMs} / {t.injectedDelayMs} / {t.retryDelayMs} ms</td><td>{t.sideEffectId ? redact(t.sideEffectId, secrets) : 'none observed'}</td></tr>)}</tbody></table></div></details>
          <details><summary>Conversation & session continuity</summary>{run.turns.map((t, i) => <div key={i}><strong>Turn {i + 1} · {redact(t.sessionId, secrets)}</strong><p>{redact(t.message, secrets)}</p><p>{redact(t.response, secrets)}</p></div>)}</details>
        </article>)}</div>
      </section>}
      <section className="lab-card" aria-label="Saved regression tests">
        <h3>04 / Saved regression tests</h3>
        <div className="lab-actions"><button onClick={() => download('chaos-suite.v1.json', { schemaVersion: 1, tests: safeTests(tests, secrets) })}>Export suite</button><label className="lab-upload">Import suite<input aria-label="Import suite" type="file" accept=".json,application/json" onChange={e => void importFile(e, 'suite')} /></label></div>
        {!tests.length && <p>No saved tests. Design a contract above, then save it.</p>}
        {tests.map(test => <div className="lab-saved" key={test.id}>
          <div><strong>{test.name}</strong><small>{test.definition.agentVersion || 'unversioned'} · {test.definition.assertions.length} assertions · Baseline: {test.baselineOutcome ?? 'not run'} · {testStatuses[test.id] ?? 'Not rerun'}</small></div>
          <button disabled={running} onClick={() => load(test.definition, test.id)}>Edit test</button>
          <button disabled={running} onClick={() => { setSelectedTest(test.id); setDefinition({ ...test.definition, transport: 'simulation' }); void run({ ...test.definition, transport: 'simulation' }, test.id) }}>Rerun test</button>
          <button disabled={running} onClick={() => { setTests(current => current.filter(t => t.id !== test.id)); if (selectedTest === test.id) setSelectedTest(null) }}>Delete test</button>
        </div>)}
        <p className="lab-hint">One-click reruns are always simulated. Edit a test and explicitly opt into the live gateway to test your agent. “Resolved” means a failing baseline now passes in the same transport; simulation cannot resolve a live failure.</p>
      </section>
      <section className="lab-card" aria-label="Durable history">
        <h3>05 / History & version comparison</h3>
        <p className="lab-hint">Redacted, versioned local summaries, including after reload. Imported summaries are unverified; current-session reports contain evidence. Legacy Run activity remains session-only.</p>
        <label>Search laboratory history<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, scenario, version, outcome…" /></label>
        <div className="lab-actions"><button onClick={() => download('chaos-history.v1.json', { schemaVersion: 1, history: history.map(h => ({ ...h, definition: safeDefinition(h.definition, secrets) })) })}>Export history</button><label className="lab-upload">Import history<input aria-label="Import history" type="file" accept=".json,application/json" onChange={e => void importFile(e, 'history')} /></label><button onClick={() => setHistory([])}>Clear laboratory history</button></div>
        {history.filter(h => `${h.definition.name} ${h.definition.scenario} ${h.definition.agentVersion} ${h.outcome}`.toLowerCase().includes(search.toLowerCase())).map(h => <div className="lab-saved" key={h.id}>
          <div><strong>{h.definition.name} · {h.outcome}</strong><small>{h.definition.agentVersion || 'unversioned'} · {h.simulated ? 'simulated' : 'live'} · {h.startedAt} · Scores {h.scores.map(s => s ?? '—').join(' / ')}</small></div>
          <button disabled={running} onClick={() => load(h.definition)}>Replay configuration</button>
        </div>)}
        <div className="lab-fields">{([['Compare version A', compareId, setCompareId], ['Compare version B', compareOtherId, setCompareOtherId]] as const).map(([label, value, setter]) => <label key={label}>{label}<select value={value} onChange={e => setter(e.target.value)}><option value="">Choose a run</option>{history.map(h => <option key={h.id} value={h.id}>{h.definition.agentVersion} · {h.definition.name} · {h.outcome} · {h.startedAt}</option>)}</select></label>)}</div>
        {compare && compareOther && <div className="lab-comparison"><h4>Comparison (descriptive, not causal)</h4><p>{compare.definition.agentVersion}: {compare.outcome} [{compare.scores.join(', ')}] → {compareOther.definition.agentVersion}: {compareOther.outcome} [{compareOther.scores.join(', ')}]</p><p>{compare.simulated || compareOther.simulated ? 'Simulation is not evidence of an agent version improvement.' : 'Check identical scenarios, fault schedules, and assertion coverage before attributing a change to an agent version.'} Scores with different evidence coverage are not directly comparable.</p></div>}
      </section>
    </section>
  )
}
