import type { EvaluatorInfo } from '../api'

interface SettingsPageProps {
  agentEndpoint: string
  onAgentEndpointChange: (value: string) => void
  agentApiKey: string
  onAgentApiKeyChange: (value: string) => void
  latencyMs: number
  onLatencyChange: (value: number) => void
  evaluatorModel: string
  onEvaluatorModelChange: (value: string) => void
  evaluator: EvaluatorInfo | null
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="page" aria-label="Settings">
      <header className="page__header">
        <h2 className="page__title">Settings</h2>
        <p className="page__lead">
          Target agent, injected latency and the model that judges the recovery. These settings apply
          to the next experiment.
        </p>
      </header>

      <h3 className="page__subtitle">Agent under test</h3>
      <label className="field field--wide">
        <span className="field__label">Endpoint</span>
        <input
          className="field__input"
          placeholder="Leave empty to use the demo agent"
          value={props.agentEndpoint}
          onChange={(event) => props.onAgentEndpointChange(event.target.value)}
        />
      </label>
      <label className="field field--wide">
        <span className="field__label">Authorization token</span>
        <input
          className="field__input"
          type="password"
          placeholder="Optional"
          value={props.agentApiKey}
          onChange={(event) => props.onAgentApiKeyChange(event.target.value)}
        />
      </label>

      <h3 className="page__subtitle">Chaos</h3>
      <label className="field field--wide">
        <span className="field__label">Injected latency ({props.latencyMs} ms)</span>
        <input
          className="field__range"
          type="range"
          min={0}
          max={30000}
          step={500}
          value={props.latencyMs}
          onChange={(event) => props.onLatencyChange(Number(event.target.value))}
        />
      </label>

      <h3 className="page__subtitle">Resilience judge</h3>
      <label className="field field--wide">
        <span className="field__label">Model</span>
        <input
          className="field__input"
          value={props.evaluatorModel}
          placeholder="claude-opus-4-1-20250805"
          onChange={(event) => props.onEvaluatorModelChange(event.target.value)}
        />
      </label>
      <p className="page__hint">
        {props.evaluator?.configured
          ? `Judged by ${props.evaluator.provider}. Any OpenAI or Anthropic compatible endpoint can be configured on the backend.`
          : 'No model credentials configured, so the deterministic heuristic judge is used.'}
      </p>
    </section>
  )
}
