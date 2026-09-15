export type ChaosModeId =
  | 'Latency'
  | 'ConnectorFailure'
  | 'Throttling'
  | 'ExpiredAuth'
  | 'EmptyResponse'
  | 'MalformedData'
  | 'PromptInjection'
  | 'ToolSchemaDrift'
  | 'TruncatedStream'
  | 'ContextExhaustion'
  | 'CascadingFailure'

export interface ChaosModeInfo {
  id: ChaosModeId
  name: string
  description: string
}

/**
 * Faults that target what the agent does with a tool response rather than the HTTP transport.
 * Mirrors the last five entries of backend/ChaosMonkey.Api/Models/ChaosMode.cs.
 */
export const agentLayerModes: ChaosModeId[] = [
  'PromptInjection',
  'ToolSchemaDrift',
  'TruncatedStream',
  'ContextExhaustion',
  'CascadingFailure',
]

export function isAgentLayerMode(id: ChaosModeId): boolean {
  return agentLayerModes.includes(id)
}

export interface EvaluatorInfo {
  provider: string
  model: string
  configured: boolean
}

export interface ExperimentRequest {
  agentEndpoint?: string
  agentApiKey?: string
  scenario: string
  connectorName: string
  modes: ChaosModeId[]
  latencyMs: number
  evaluatorModel?: string
}

export interface InjectionRecord {
  connector: string
  mode: string
  statusCode: number | null
  injectedLatencyMs: number
  detail: string
}

export interface AgentInteraction {
  succeeded: boolean
  statusCode: number | null
  durationMs: number
  responseBody: string
  transportError: string | null
}

export interface ResilienceFinding {
  severity: string
  title: string
  detail: string
}

export interface ResilienceReport {
  score: number
  verdict: string
  summary: string
  findings: ResilienceFinding[]
  recommendedFixes: string[]
  generatedRegressionTests: string[]
  evaluatorModel: string
  usedLlm: boolean
}

export interface ExperimentResult {
  experimentId: string
  startedAt: string
  scenario: string
  connectorName: string
  injections: InjectionRecord[]
  agent: AgentInteraction
  report: ResilienceReport
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    const body = await response.text()
    let message = `Request failed with HTTP ${response.status}`
    try {
      const parsed = JSON.parse(body) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch {
      if (body) message = body
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

/** True for the statically published build (GitHub Pages), which has no backend. */
const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'

export const api = {
  chaosModes: async () =>
    staticDemo
      ? (await import('./staticDemo')).staticChaosModes
      : request<ChaosModeInfo[]>('/api/chaos-modes'),
  evaluator: async () =>
    staticDemo
      ? (await import('./staticDemo')).staticEvaluator
      : request<EvaluatorInfo>('/api/evaluator'),
  runExperiment: async (payload: ExperimentRequest) =>
    staticDemo
      ? (await import('./staticDemo')).runStaticExperiment(payload)
      : request<ExperimentResult>('/api/experiments', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
}

/** Pulls the user-visible reply out of a JSON agent response. */
export function extractReply(body: string): string {
  if (!body.trim()) return ''
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    for (const key of ['reply', 'text', 'message', 'output', 'content', 'answer']) {
      const value = parsed[key]
      if (typeof value === 'string') return value
    }
  } catch {
    // Not JSON, show the raw payload.
  }
  return body
}
