import type { ChaosModeId, ChaosModeInfo, EvaluatorInfo } from '../api'
import { InfoTip } from './Tooltip'

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
        <div className="tipHeading">
          <h2 className="panel__title">Agent under test</h2>
          <InfoTip
            label="Agent under test"
            text="The agent that receives the scenario. Leave the endpoint empty to use the built-in demo agent, which fails in instructive ways."
          />
        </div>
        <label className="field">
          <span className="field__label" title="HTTPS URL of your agent. It must be allowlisted on the backend before it is called.">
            Endpoint
          </span>
          <input
            className="field__input"
            placeholder="Leave empty to use the demo agent"
            value={props.agentEndpoint}
            onChange={(event) => props.onAgentEndpointChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label" title="Optional bearer token sent to your agent. It is never stored and is redacted from reports.">
            Authorization token
          </span>
          <input
            className="field__input"
            type="password"
            placeholder="Optional"
            value={props.agentApiKey}
            onChange={(event) => props.onAgentApiKeyChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label" title="The tool boundary chaos is injected at; this is the call that fails during the run.">
            Connector / tool
          </span>
          <input
            className="field__input"
            value={props.connectorName}
            onChange={(event) => props.onConnectorNameChange(event.target.value)}
          />
        </label>
      </section>

      <section className="panel__section">
        <div className="tipHeading">
          <h2 className="panel__title">Injected failures</h2>
          <InfoTip
            label="Injected failures"
            text="Tick every fault to inject on the next run. With nothing ticked the run is a control: the connector behaves normally."
          />
        </div>
        <ul className="modes">
          {props.modes.map((mode) => {
            const checked = props.selectedModes.includes(mode.id)
            return (
              <li key={mode.id}>
                <label className={`mode ${checked ? 'mode--on' : ''}`} title={mode.description}>
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
            <span className="field__label" title="How long the connector stalls before answering, in milliseconds.">
              Latency ({props.latencyMs} ms)
            </span>
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
        <div className="tipHeading">
          <h2 className="panel__title">Resilience judge</h2>
          <InfoTip
            label="Resilience judge"
            text="The model that scores the agent's recovery out of 100. Without credentials a deterministic heuristic judge is used instead."
          />
        </div>
        <label className="field">
          <span className="field__label" title="Model name passed to the judge, for example claude-opus-4-1-20250805 or gpt-4o-mini.">
            Model
          </span>
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
