import { aggregate } from './lab'
import type { ExperimentDefinition, FaultStep, LabResult, LabRun, Outcome, ToolCall } from './lab'

export function simulateLab(definition: ExperimentDefinition): LabResult {
  const startedAt = new Date().toISOString()
  const id = crypto.randomUUID()
  const plans: { label: string; faults: FaultStep[] }[] = [{ label: 'Healthy control', faults: [] }]
  if (definition.executionMode === 'matrix') {
    definition.faults.forEach((fault, index) => plans.push({ label: `Matrix ${index + 1}: ${fault.mode}`, faults: [fault] }))
  } else plans.push({ label: definition.executionMode === 'sequence' ? 'Ordered fault sequence' : 'Single fault', faults: definition.faults.slice(0, definition.executionMode === 'single' ? 1 : 20) })
  const runs: LabRun[] = plans.map((plan, index) => {
    const trace: ToolCall[] = []
    const faults: LabRun['faults'] = plan.faults.map(f => ({ invocation: f.invocation, mode: f.mode, state: 'planned', detail: 'Awaiting matching invocation' }))
    let authenticated = true
    let successful = false
    let retryCount = 0
    let elapsed = 0
    const sessionId = `simulated-session-${index + 1}`
    const turns = [{ message: definition.scenario, reauthenticate: false }, ...definition.turns].map((turn, turnIndex) => {
      if (turn.reauthenticate) authenticated = true
      if (!successful) {
        for (let attempt = 0; attempt <= definition.maxRetries; attempt++) {
          const invocation = trace.length + 1
          const faultIndex = plan.faults.findIndex(f => f.invocation === invocation && (!f.connector || f.connector === definition.connector) && (!f.operation || f.operation === definition.operation))
          const mode = faultIndex >= 0 ? plan.faults[faultIndex].mode : 'None'
          const delay = mode === 'Latency' ? definition.latencyMs : 0
          if (mode === 'ExpiredAuth') authenticated = false
          const durationMs = Math.min(25 + delay, definition.toolTimeoutMs)
          const timedOut = 25 + delay > definition.toolTimeoutMs
          const statusCode = timedOut ? null : !authenticated ? 401 : mode === 'ConnectorFailure' ? 503 : mode === 'Throttling' ? 429 : 200
          const usable = statusCode === 200 && mode !== 'EmptyResponse' && mode !== 'MalformedData'
          const retryDelayMs = attempt > 0 ? Math.min(60000, definition.retryDelayMs * 2 ** (attempt - 1)) : 0
          if (attempt > 0) retryCount++
          elapsed += retryDelayMs
          trace.push({
            invocation, connector: definition.connector, operation: definition.operation, statusCode,
            startedAt: new Date(Date.parse(startedAt) + elapsed).toISOString(), durationMs,
            injectedDelayMs: Math.min(delay, durationMs), retryDelayMs,
            sideEffectId: usable ? `simulated-effect-${index + 1}` : null,
            detail: `SIMULATED turn ${turnIndex + 1}: ${timedOut ? 'tool timeout' : mode === 'EmptyResponse' ? 'empty payload rejected' : mode === 'MalformedData' ? 'malformed payload rejected' : statusCode === 401 ? 'authentication required' : usable ? 'confirmed tool receipt' : 'transient connector failure'}`,
          })
          elapsed += durationMs
          if (faultIndex >= 0) faults[faultIndex] = { invocation, mode, state: 'observed', detail: `Simulated boundary applied ${mode}; trace #${invocation}. Not evidence of a real agent.` }
          if (usable) { successful = true; break }
          if (!authenticated) break
        }
      }
      return { message: turn.message, response: successful ? 'SIMULATED: confirmed support ticket; original request retained, no duplicate write.' : authenticated ? 'SIMULATED: unable to confirm success; request retained.' : 'SIMULATED: please reauthenticate to continue the original request.', sessionId }
    })
    faults.forEach(f => { if (f.state === 'planned') { f.state = 'skipped'; f.detail = 'No matching invocation reached (scope mismatch, recovery, or retry limit).' } })
    const evidence = trace.map(t => `Simulated trace #${t.invocation}: ${t.statusCode ?? 'timeout'}, ${t.durationMs} ms, backoff ${t.retryDelayMs} ms${t.sideEffectId ? `, receipt ${t.sideEffectId}` : ''}`)
    const assertions = definition.assertions.map(assertion => {
      let actual: number | boolean
      let outcome: Outcome
      switch (assertion.kind) {
        case 'eventualSuccess': actual = successful; break
        case 'maxRetries': actual = retryCount; break
        case 'minBackoffMs': actual = Math.min(...trace.filter(t => t.retryDelayMs > 0).map(t => t.retryDelayMs)); break
        case 'contextRetained': actual = turns.length > 1; break
        case 'noDuplicateSideEffects': actual = trace.filter(t => t.sideEffectId !== null).length <= 1; break
        default: actual = true
      }
      const expected = assertion.expected ?? (typeof actual === 'boolean' ? true : assertion.kind === 'maxRetries' ? definition.maxRetries : definition.retryDelayMs)
      outcome = typeof actual === 'boolean' ? actual === expected ? 'pass' : 'fail' : assertion.kind === 'maxRetries' ? actual <= Number(expected) ? 'pass' : 'fail' : actual >= Number(expected) ? 'pass' : 'fail'
      if (assertion.kind === 'minBackoffMs' && !trace.some(t => t.retryDelayMs > 0) || assertion.kind === 'contextRetained' && turns.length < 2) outcome = 'inconclusive'
      return { id: assertion.id, outcome, severity: assertion.severity, detail: `${assertion.kind}: simulated actual ${Number.isFinite(actual) || typeof actual === 'boolean' ? actual : 'not exercised'}; expected ${expected}.`, evidence }
    })
    const skipped = faults.some(f => f.state === 'skipped')
    const outcome = aggregate([...assertions.map(a => a.outcome), ...(skipped ? ['inconclusive' as const] : [])])
    const measured = assertions.filter(a => a.outcome !== 'inconclusive')
    const score = measured.length ? Math.round(measured.filter(a => a.outcome === 'pass').length / measured.length * 100) : null
    return {
      id: `${id}-${index}`, label: plan.label, simulation: true, outcome, score, trace, faults, assertions,
      agentResponse: turns.at(-1)?.response ?? '', agentDurationMs: elapsed,
      injectedDelayMs: trace.reduce((total, t) => total + t.injectedDelayMs, 0), retryCount, turns,
      findings: [{ severity: 'info', title: 'Deterministic reference agent only', detail: 'Virtual timing and scripted recovery exercise the harness, not the resilience of your agent. Endpoint/version do not change this simulation.', evidence: ['Local deterministic simulator v1'] }],
      dimensions: [
        { name: 'Fault attribution', outcome: skipped ? 'inconclusive' : 'pass', detail: skipped ? 'Some scheduled faults were not reached.' : 'Every scheduled fault matched a simulated boundary.' },
        { name: 'Recovery', outcome: successful ? 'pass' : 'fail', detail: successful ? 'Simulated tool receipt confirmed.' : 'No simulated success receipt.' },
        { name: 'Real agent resilience', outcome: 'inconclusive', detail: 'No real agent or external connector was contacted.' },
      ],
    }
  })
  return { id, startedAt, definition, outcome: aggregate(runs.map(r => r.outcome)), runs }
}
