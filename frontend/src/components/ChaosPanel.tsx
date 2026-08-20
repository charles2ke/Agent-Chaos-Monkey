import type { ChaosModeId, ChaosModeInfo, EvaluatorInfo } from '../api'

interface ChaosPanelProps {
  modes: ChaosModeInfo[]
  selectedModes: ChaosModeId[]
  onToggleMode: (id: ChaosModeId) => void
  connectorName: string
  onConnectorNameChange: (value: string) => void
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

export function ChaosPanel(props: ChaosPanelProps) {
  const latencySelected = props.selectedModes.includes('Latency')

  return (
    <aside className="panel" aria-label="Chaos configuration">
      <section className="panel__section">
        <h2 className="panel__title">Agent under test</h2>
        <label className="field">
          <span className="field__label">Endpoint</span>
          <input
            className="field__input"
            placeholder="Leave empty to use the demo agent"
            value={props.agentEndpoint}
            onChange={(event) => props.onAgentEndpointChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Authorization token</span>
          <input
            className="field__input"
            type="password"
            placeholder="Optional"
            value={props.agentApiKey}
            onChange={(event) => props.onAgentApiKeyChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Connector / tool</span>
          <input
            className="field__input"
            value={props.connectorName}
            onChange={(event) => props.onConnectorNameChange(event.target.value)}
          />
        </label>
      </section>

      <section className="panel__section">
        <h2 className="panel__title">Injected failures</h2>
        <ul className="modes">
          {props.modes.map((mode) => {
            const checked = props.selectedModes.includes(mode.id)
            return (
              <li key={mode.id}>
                <label className={`mode ${checked ? 'mode--on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => props.onToggleMode(mode.id)}
                  />
                  <span>
                    <span className="mode__name">{mode.name}</span>
                    <span className="mode__description">{mode.description}</span>
                  </span>
                </label>
              </li>
            )
          })}
          {props.modes.length === 0 && (
            <li className="modes__empty">Start the backend to load chaos modes.</li>
          )}
        </ul>
        {latencySelected && (
          <label className="field">
            <span className="field__label">Latency ({props.latencyMs} ms)</span>
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
        )}
      </section>

      <section className="panel__section">
        <h2 className="panel__title">Resilience judge</h2>
        <label className="field">
          <span className="field__label">Model</span>
          <input
            className="field__input"
            value={props.evaluatorModel}
            placeholder="claude-opus-4-1-20250805"
            onChange={(event) => props.onEvaluatorModelChange(event.target.value)}
          />
        </label>
        <p className="panel__hint">
          {props.evaluator?.configured
            ? `Judged by ${props.evaluator.provider}. Any OpenAI or Anthropic compatible endpoint can be configured on the backend.`
            : 'No model credentials configured, so the deterministic heuristic judge is used.'}
        </p>
      </section>
    </aside>
  )
}
