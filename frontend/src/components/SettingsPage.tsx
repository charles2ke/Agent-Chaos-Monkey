import type { EvaluatorInfo } from '../api'
import { InfoTip, TipHeading } from './Tooltip'

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
        <div className="tipHeading">
          <h2 className="page__title">Settings</h2>
          <InfoTip
            label="Settings"
            text="Harness configuration that applies to the next experiment: which agent is tested, how much latency is injected and which model judges the recovery."
          />
        </div>
        <p className="page__lead">
          Target agent, injected latency and the model that judges the recovery. These settings apply
          to the next experiment.
        </p>
      </header>

      <TipHeading
        title="Agent under test"
        text="Leave the endpoint empty to test the built-in demo agent. Point it at your own HTTPS endpoint to test a real agent."
      />
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

      <TipHeading
        title="Chaos"
        text="Shared fault tuning. Injected latency is how long the connector stalls before it answers when the latency mode is selected."
      />
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

      <TipHeading
        title="Resilience judge"
        text="The model that scores each recovery out of 100. Without credentials the deterministic heuristic judge is used."
      />
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
