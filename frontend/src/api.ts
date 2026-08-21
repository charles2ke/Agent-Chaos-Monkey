export type ChaosModeId =
  | 'Latency'
  | 'ConnectorFailure'
  | 'Throttling'
  | 'ExpiredAuth'
  | 'EmptyResponse'
  | 'MalformedData'

export interface ChaosModeInfo {
  id: ChaosModeId
  name: string
  description: string
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

export const api = {
  chaosModes: () => request<ChaosModeInfo[]>('/api/chaos-modes'),
  evaluator: () => request<EvaluatorInfo>('/api/evaluator'),
  runExperiment: (payload: ExperimentRequest) =>
    request<ExperimentResult>('/api/experiments', {
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
