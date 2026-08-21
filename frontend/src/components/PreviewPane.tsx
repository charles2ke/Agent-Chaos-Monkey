import type { ExperimentResult } from '../api'
import { ReportCard } from './ReportCard'

export type PreviewTurn =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string; result: ExperimentResult }
  | { kind: 'error'; text: string }

interface PreviewPaneProps {
  targetLabel: string
  turns: PreviewTurn[]
  running: boolean
  scenario: string
  onScenarioChange: (value: string) => void
  onRun: () => void
  onClear: () => void
  error: string | null
}

export function PreviewPane(props: PreviewPaneProps) {
  return (
    <section className="preview" aria-label="Preview">
      <div className="preview__header">
        <div>
          <h2 className="preview__title">Preview</h2>
          <p className="preview__target">Target · {props.targetLabel}</p>
        </div>
        <button type="button" className="button button--ghost" onClick={props.onClear}>
          Clear session
        </button>
      </div>

      <div className="preview__thread" role="log" aria-live="polite">
        {props.turns.length === 0 && (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">
              🐒
            </span>
            <h3>Test how the agent behaves when things break</h3>
            <p>
              Pick the failures to inject on the left, then send a scenario. Chaos Monkey replays it
              against the agent with a real connector fault and scores how safely it recovers.
            </p>
          </div>
        )}

        {props.turns.map((turn, index) => {
          if (turn.kind === 'user') {
            return (
              <article key={index} className="message message--user">
                <div className="message__avatar">You</div>
                <div className="message__bubble">{turn.text}</div>
              </article>
            )
          }

          if (turn.kind === 'error') {
            return (
              <article key={index} className="message message--error">
                <div className="message__avatar">!</div>
                <div className="message__bubble">{turn.text}</div>
              </article>
            )
          }

          return (
            <article key={index} className="message message--agent">
              <div className="message__avatar" aria-hidden="true">
                🐒
              </div>
              <div className="message__body">
                <ul className="trace">
                  {turn.result.injections.map((injection, injectionIndex) => (
                    <li key={injectionIndex} className="trace__item">
                      <span className="trace__dot" aria-hidden="true" />
                      <span className="trace__label">
                        {injection.connector}
                        {injection.statusCode !== null && ` → HTTP ${injection.statusCode}`}
                        {injection.injectedLatencyMs > 0 && ` → +${injection.injectedLatencyMs} ms`}
                      </span>
                      <span className="trace__detail">{injection.detail}</span>
                    </li>
                  ))}
                  <li className="trace__item">
                    <span className="trace__dot" aria-hidden="true" />
                    <span className="trace__label">
                      Agent responded in {turn.result.agent.durationMs} ms
                      {turn.result.agent.statusCode !== null && ` · HTTP ${turn.result.agent.statusCode}`}
                    </span>
                  </li>
                </ul>
                <div className="message__bubble">{turn.text || '(empty response)'}</div>
                <ReportCard result={turn.result} />
              </div>
            </article>
          )
        })}

        {props.running && (
          <article className="message message--agent">
            <div className="message__avatar" aria-hidden="true">
              🐒
            </div>
            <div className="message__bubble message__bubble--typing">
              Injecting chaos and judging the response…
            </div>
          </article>
        )}
      </div>

      {props.error && <p className="preview__error">{props.error}</p>}

      <div className="composer">
        <textarea
          className="composer__input"
          rows={2}
          placeholder="Describe what the user asks the agent to do…"
          value={props.scenario}
          onChange={(event) => props.onScenarioChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onRun()
            }
          }}
        />
        <button
          type="button"
          className="button button--primary"
          onClick={props.onRun}
          disabled={props.running || !props.scenario.trim()}
        >
          {props.running ? 'Running…' : 'Run chaos'}
        </button>
      </div>
    </section>
  )
}
