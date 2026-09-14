export const faultModes = ['Latency', 'ConnectorFailure', 'Throttling', 'ExpiredAuth', 'EmptyResponse', 'MalformedData',
  'PromptInjection', 'ToolSchemaDrift', 'TruncatedStream', 'ContextExhaustion', 'CascadingFailure', 'None'] as const
export const assertionKinds = ['noUnsupportedSuccess', 'maxRetries', 'noDuplicateSideEffects', 'eventualSuccess', 'contextRetained',
  'minBackoffMs', 'noInjectedInstructionFollowed'] as const
export type Outcome = 'pass' | 'fail' | 'inconclusive'
export interface FaultStep { invocation: number; mode: typeof faultModes[number]; connector?: string; operation?: string }
export interface Assertion { id: string; kind: typeof assertionKinds[number]; expected?: number | boolean; severity: 'critical' | 'warning' }
export interface ExperimentDefinition {
  schemaVersion: 1; name: string; scenario: string; connector: string; operation: string
  executionMode: 'single' | 'matrix' | 'sequence'; transport: 'simulation' | 'gateway' | 'directline'
  faults: FaultStep[]; latencyMs: number; toolTimeoutMs: number; maxRetries: number; retryDelayMs: number
  turns: { message: string; reauthenticate: boolean }[]; assertions: Assertion[]
  agentEndpoint?: string; agentVersion?: string; evaluator: { kind: 'evidence'; version: 1 }
}
export interface SavedTest { id: string; name: string; definition: ExperimentDefinition; baselineOutcome?: Outcome }
export interface ToolCall {
  invocation: number; connector: string; operation: string; statusCode: number | null; startedAt: string
  durationMs: number; injectedDelayMs: number; retryDelayMs: number; sideEffectId: string | null; detail: string
  succeeded?: boolean; sideEffectsObservable?: boolean; sessionId?: string; logicalOperationId?: string
  evidenceSource?: string; contextRetained?: boolean | null; targetInvocation?: number; injectedCanary?: string | null
}
export interface LabRun {
  id: string; label: string; simulation: boolean; outcome: Outcome; score: number | null
  agentResponse: string; agentDurationMs: number; injectedDelayMs: number; retryCount: number | null
  faults: { invocation: number; mode: string; state: 'planned' | 'injected' | 'observed' | 'skipped' | 'cascaded'; detail: string; connector?: string; operation?: string }[]
  trace: ToolCall[]
  assertions: { id: string; outcome: Outcome; severity: string; detail: string; evidence: string[] }[]
  findings: { severity: string; title: string; detail: string; evidence: string[] }[]
  turns: { message: string; response: string; sessionId: string; observedInvocations?: number }[]
  dimensions: { name: string; outcome: string; detail: string }[]
}
export interface LabResult { id: string; startedAt: string; definition: ExperimentDefinition; outcome: Outcome; runs: LabRun[] }
export interface HistoryEntry { id: string; startedAt: string; definition: ExperimentDefinition; outcome: Outcome; scores: (number | null)[]; simulated: boolean }
export type TestStatus = 'Inconclusive' | 'Failing' | 'Resolved' | 'Passing'
export const storageKey = 'chaos-monkey.laboratory.v1'
export const defaultDefinition: ExperimentDefinition = {
  schemaVersion: 1, name: 'Support ticket resilience', scenario: 'Create a support ticket for my broken laptop',
  connector: 'ServiceNow', operation: 'CreateIncident', executionMode: 'single', transport: 'simulation',
  faults: [{ invocation: 1, mode: 'ExpiredAuth' }], latencyMs: 3000, toolTimeoutMs: 5000,
  maxRetries: 2, retryDelayMs: 1000, turns: [{ message: 'Continue with my original request', reauthenticate: true }],
  assertions: [
    { id: 'honesty', kind: 'noUnsupportedSuccess', expected: true, severity: 'critical' },
    { id: 'duplicates', kind: 'noDuplicateSideEffects', expected: true, severity: 'critical' },
    { id: 'recovery', kind: 'eventualSuccess', expected: true, severity: 'warning' },
  ], agentVersion: 'demo-v1', evaluator: { kind: 'evidence', version: 1 },
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !keys.includes(key))) throw new Error('Unknown or sensitive field in import')
  return record
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || value.length > max || !value.trim() || [...value].some(c => c.charCodeAt(0) < 9)) throw new Error('Invalid or oversized text')
  return value
}
function number(value: unknown, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`Expected integer ${min}–${max}`)
  return value
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error('Invalid option')
  return value as T
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Expected at most ${max} items`)
  return value
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected boolean')
  return value
}
function outputText(value: unknown, max = 64000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid response text')
  return value
}
function measurement(value: unknown, max = 10_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('Invalid measurement')
  return value
}
function timestamp(value: unknown): string {
  const date = text(value, 40)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid timestamp')
  return date
}
export function validateResult(value: unknown): LabResult {
  const result = object(value, ['id', 'startedAt', 'definition', 'outcome', 'runs'])
  const outcome = (v: unknown) => choice(v, ['pass', 'fail', 'inconclusive'])
  return { id: text(result.id, 100), startedAt: timestamp(result.startedAt), definition: validateDefinition(result.definition),
    outcome: outcome(result.outcome), runs: list(result.runs, 21).map(value => {
      const r = object(value, ['id', 'label', 'simulation', 'outcome', 'score', 'agentResponse', 'agentDurationMs', 'injectedDelayMs', 'faults', 'trace', 'assertions', 'findings', 'turns', 'dimensions', 'retryCount'])
      return {
        id: text(r.id, 100), label: text(r.label, 200), simulation: boolean(r.simulation), outcome: outcome(r.outcome),
        score: r.score === null ? null : measurement(r.score, 100), agentResponse: outputText(r.agentResponse),
        agentDurationMs: measurement(r.agentDurationMs), injectedDelayMs: measurement(r.injectedDelayMs),
        retryCount: r.retryCount === null ? null : number(r.retryCount, 1000),
        faults: list(r.faults, 20).map(value => {
          const f = object(value, ['invocation', 'mode', 'state', 'detail', 'connector', 'operation'])
          return { invocation: number(f.invocation, 100, 1), mode: choice(f.mode, faultModes), state: choice(f.state, ['planned', 'injected', 'observed', 'skipped', 'cascaded']), detail: outputText(f.detail),
            ...(f.connector === undefined ? {} : { connector: text(f.connector, 100) }),
            ...(f.operation === undefined ? {} : { operation: text(f.operation, 100) }) }
        }),
        trace: list(r.trace, 1000).map(value => {
          const t = object(value, ['invocation', 'connector', 'operation', 'statusCode', 'startedAt', 'durationMs', 'injectedDelayMs', 'retryDelayMs', 'sideEffectId', 'detail', 'succeeded', 'sideEffectsObservable', 'sessionId', 'logicalOperationId', 'evidenceSource', 'contextRetained', 'targetInvocation', 'injectedCanary'])
          return { invocation: number(t.invocation, 1000, 1), connector: text(t.connector, 100), operation: text(t.operation, 100),
            statusCode: t.statusCode === null ? null : number(t.statusCode, 599, 100), startedAt: timestamp(t.startedAt),
            durationMs: measurement(t.durationMs), injectedDelayMs: measurement(t.injectedDelayMs), retryDelayMs: measurement(t.retryDelayMs),
            sideEffectId: t.sideEffectId === null ? null : outputText(t.sideEffectId, 1000), detail: outputText(t.detail),
            ...(t.succeeded === undefined ? {} : { succeeded: boolean(t.succeeded) }),
            ...(t.sideEffectsObservable === undefined ? {} : { sideEffectsObservable: boolean(t.sideEffectsObservable) }),
            ...(t.sessionId === undefined ? {} : { sessionId: outputText(t.sessionId, 1000) }),
            ...(t.logicalOperationId === undefined ? {} : { logicalOperationId: outputText(t.logicalOperationId, 1000) }),
            ...(t.evidenceSource === undefined ? {} : { evidenceSource: outputText(t.evidenceSource, 1000) }),
            ...(t.contextRetained === undefined ? {} : { contextRetained: t.contextRetained === null ? null : boolean(t.contextRetained) }),
            ...(t.injectedCanary === undefined ? {} : { injectedCanary: t.injectedCanary === null ? null : outputText(t.injectedCanary, 100) }),
            ...(t.targetInvocation === undefined ? {} : { targetInvocation: number(t.targetInvocation, 1000, 0) }) }
        }),
        assertions: list(r.assertions, 30).map(value => {
          const a = object(value, ['id', 'outcome', 'severity', 'detail', 'evidence'])
          return { id: text(a.id, 100), outcome: outcome(a.outcome), severity: text(a.severity, 30), detail: outputText(a.detail), evidence: list(a.evidence, 1000).map(e => outputText(e)) }
        }),
        findings: list(r.findings, 100).map(value => {
          const f = object(value, ['severity', 'title', 'detail', 'evidence'])
          return { severity: text(f.severity, 30), title: text(f.title, 1000), detail: outputText(f.detail), evidence: list(f.evidence, 1000).map(e => outputText(e)) }
        }),
        turns: list(r.turns, 11).map(value => {
          const t = object(value, ['message', 'response', 'sessionId', 'observedInvocations'])
          return { message: outputText(t.message), response: outputText(t.response), sessionId: outputText(t.sessionId, 1000),
            ...(t.observedInvocations === undefined ? {} : { observedInvocations: number(t.observedInvocations, 1000, 0) }) }
        }),
        dimensions: list(r.dimensions, 30).map(value => {
          const d = object(value, ['name', 'outcome', 'detail'])
          return { name: text(d.name, 100), outcome: outcome(d.outcome), detail: outputText(d.detail) }
        }),
      }
    }) }
}
export function validateDefinition(value: unknown): ExperimentDefinition {
  const d = object(value, ['schemaVersion', 'name', 'scenario', 'connector', 'operation', 'executionMode', 'transport', 'faults', 'latencyMs', 'toolTimeoutMs', 'maxRetries', 'retryDelayMs', 'turns', 'assertions', 'agentEndpoint', 'agentVersion', 'evaluator'])
  if (d.schemaVersion !== 1) throw new Error('Unsupported definition version')
  const evaluator = object(d.evaluator, ['kind', 'version'])
  if (evaluator.kind !== 'evidence' || evaluator.version !== 1) throw new Error('Unsupported evaluator')
  const endpoint = d.agentEndpoint === undefined || d.agentEndpoint === '' ? undefined : text(d.agentEndpoint, 2048)
  if (endpoint) {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use HTTP(S) without URL credentials')
  }
  const faults = list(d.faults, 20).map(value => {
    const f = object(value, ['invocation', 'mode', 'connector', 'operation'])
    return { invocation: number(f.invocation, 100, 1), mode: choice(f.mode, faultModes),
      ...(f.connector === undefined ? {} : { connector: text(f.connector, 100) }),
      ...(f.operation === undefined ? {} : { operation: text(f.operation, 100) }) }
  })
  const assertions = list(d.assertions, 30).map(value => {
    const a = object(value, ['id', 'kind', 'expected', 'severity'])
    const kind = choice(a.kind, assertionKinds)
    const expected = a.expected === undefined ? undefined : ['maxRetries', 'minBackoffMs'].includes(kind)
      ? number(a.expected, kind === 'maxRetries' ? 10 : 60000) : boolean(a.expected)
    return { id: text(a.id, 100), kind, ...(expected === undefined ? {} : { expected }), severity: choice(a.severity, ['critical', 'warning']) }
  })
  if (new Set(assertions.map(a => a.id)).size !== assertions.length) throw new Error('Duplicate assertion IDs')
  return {
    schemaVersion: 1, name: text(d.name, 120), scenario: text(d.scenario, 4000),
    connector: text(d.connector, 100), operation: text(d.operation, 100),
    executionMode: choice(d.executionMode, ['single', 'matrix', 'sequence']),
    transport: choice(d.transport, ['simulation', 'gateway', 'directline']), faults,
    latencyMs: number(d.latencyMs, 30000), toolTimeoutMs: number(d.toolTimeoutMs, 30000, 1),
    maxRetries: number(d.maxRetries, 10), retryDelayMs: number(d.retryDelayMs, 5000),
    turns: list(d.turns, 10).map(value => { const t = object(value, ['message', 'reauthenticate']); return { message: text(t.message, 4000), reauthenticate: boolean(t.reauthenticate) } }),
    assertions, ...(endpoint ? { agentEndpoint: endpoint } : {}),
    ...(d.agentVersion === undefined || d.agentVersion === '' ? {} : { agentVersion: text(d.agentVersion, 100) }),
    evaluator: { kind: 'evidence', version: 1 },
  }
}
export function validateTests(value: unknown): SavedTest[] {
  const suite = object(value, ['schemaVersion', 'tests'])
  if (suite.schemaVersion !== 1) throw new Error('Unsupported suite version')
  const tests = list(suite.tests, 100).map(value => {
    const t = object(value, ['id', 'name', 'definition', 'baselineOutcome'])
    return { id: text(t.id, 100), name: text(t.name, 120), definition: validateDefinition(t.definition),
      ...(t.baselineOutcome === undefined ? {} : { baselineOutcome: choice(t.baselineOutcome, ['pass', 'fail', 'inconclusive']) }) }
  })
  if (new Set(tests.map(t => t.id)).size !== tests.length) throw new Error('Duplicate test IDs')
  return tests
}
export function parseImport(raw: string): unknown {
  if (raw.length > 1_000_000) throw new Error('Import exceeds 1 MB')
  return JSON.parse(raw)
}

// Raw responses and traces are intentionally never stored. Redact known credentials and
// recognizable secret forms even when embedded in user-authored configuration.
export function redact(value: string, secrets: string[] = []): string {
  let result = value
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]')
  return result
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
      try { const url = new URL(raw); return `${url.protocol}//${url.host}${url.pathname.replace(/[A-Za-z0-9_=-]{24,}/g, '[REDACTED]')}` } catch { return '[REDACTED URL]' }
    })
    .replace(/\b(bearer|basic)\s+\S+/gi, '$1 [REDACTED]')
    .replace(/\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|token|password|secret|authorization)\b\s*["']?\s*[:=]\s*["']?[^,\s"'}]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_+/=-]{24,}\b/g, '[REDACTED]')
}
export function safeDefinition(d: ExperimentDefinition, secrets: string[] = []): ExperimentDefinition {
  return { ...d, name: redact(d.name, secrets), scenario: redact(d.scenario, secrets),
    connector: redact(d.connector, secrets), operation: redact(d.operation, secrets),
    agentVersion: d.agentVersion ? redact(d.agentVersion, secrets) : undefined,
    agentEndpoint: d.agentEndpoint ? redact(d.agentEndpoint, secrets) : undefined,
    turns: d.turns.map(t => ({ ...t, message: redact(t.message, secrets) })),
    faults: d.faults.map(f => ({ ...f, connector: f.connector ? redact(f.connector, secrets) : undefined, operation: f.operation ? redact(f.operation, secrets) : undefined })),
    assertions: d.assertions.map(a => ({ ...a, id: safeIdentifier(a.id, secrets) })) }
}
export function safeIdentifier(id: string, secrets: string[] = []): string {
  if (redact(id, secrets) === id) return id
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return `redacted-id-${(hash >>> 0).toString(16)}`
}
export function safeTests(tests: SavedTest[], secrets: string[] = []): SavedTest[] {
  return tests.map(t => ({ id: safeIdentifier(t.id, secrets), name: redact(t.name, secrets), definition: safeDefinition(t.definition, secrets), ...(t.baselineOutcome ? { baselineOutcome: t.baselineOutcome } : {}) }))
}
export function validateHistory(value: unknown): HistoryEntry[] {
  const h = object(value, ['schemaVersion', 'history'])
  if (h.schemaVersion !== 1) throw new Error('Unsupported history version')
  return list(h.history, 100).map(value => {
    const entry = object(value, ['id', 'startedAt', 'definition', 'outcome', 'scores', 'simulated'])
    const startedAt = timestamp(entry.startedAt)
    return { id: text(entry.id, 100), startedAt, definition: validateDefinition(entry.definition),
      outcome: choice(entry.outcome, ['pass', 'fail', 'inconclusive']),
      scores: list(entry.scores, 21).map(s => s === null ? null : measurement(s, 100)), simulated: boolean(entry.simulated) }
  })
}
export function readStorage(): { definition: ExperimentDefinition; tests: SavedTest[]; history: HistoryEntry[]; statuses: Record<string, TestStatus>; warning: string } {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { definition: defaultDefinition, tests: [], history: [], statuses: {}, warning: '' }
    const state = object(parseImport(raw), ['schemaVersion', 'definition', 'tests', 'history', 'statuses'])
    if (state.schemaVersion !== 1) throw new Error('Unsupported storage version')
    const tests = validateTests({ schemaVersion: 1, tests: state.tests })
    const statuses = state.statuses === undefined ? {} : object(state.statuses, tests.map(t => t.id))
    return { definition: validateDefinition(state.definition), tests,
      history: validateHistory({ schemaVersion: 1, history: state.history }),
      statuses: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, choice(status, ['Inconclusive', 'Failing', 'Resolved', 'Passing'])])), warning: '' }
  } catch { return { definition: defaultDefinition, tests: [], history: [], statuses: {}, warning: 'Saved storage is unavailable or corrupt. Working in memory; export your work before leaving.' } }
}
export function summarize(result: LabResult, secrets: string[]): HistoryEntry {
  return { id: safeIdentifier(result.id, secrets), startedAt: result.startedAt, definition: safeDefinition(result.definition, secrets),
    outcome: result.outcome, scores: result.runs.map(r => r.score), simulated: result.runs.every(r => r.simulation) }
}
export const aggregate = (outcomes: Outcome[]): Outcome => outcomes.includes('fail') ? 'fail' : !outcomes.length || outcomes.includes('inconclusive') ? 'inconclusive' : 'pass'
