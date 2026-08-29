import type { ChaosModeId, ExperimentResult } from '../api'
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
  connectorName: string
  selectedModes: ChaosModeId[]
}

export function PreviewPane(props: PreviewPaneProps) {
  return (
    <section className="session" aria-label="Preview">
      <div className="session__header">
        <div>
          <h2 className="session__title">Preview</h2>
          <p className="session__target">Target · {props.targetLabel}</p>
        </div>
        <button type="button" className="button button--ghost" onClick={props.onClear}>
          Clear session
        </button>
      </div>

      <div className="session__thread" role="log" aria-live="polite">
        {props.turns.length === 0 && (
          <div className="banner">
            <pre className="banner__art" aria-hidden="true">
              {'  ╭──────────────────────────╮\n  │  🐒  chaos-monkey  cli   │\n  ╰──────────────────────────╯'}
            </pre>
            <h3>Test how the agent behaves when things break</h3>
            <p>
              Pick the failures to inject on the left, then send a scenario. Chaos Monkey replays it
              against the agent with a real connector fault and scores how safely it recovers.
            </p>
            <ul className="banner__hints">
              <li>
                <code>enter</code> run the scenario
              </li>
              <li>
                <code>shift + enter</code> new line
              </li>
              <li>
                <code>clear session</code> reset the transcript
              </li>
            </ul>
          </div>
        )}

        {props.turns.map((turn, index) => {
          if (turn.kind === 'user') {
            return (
              <article key={index} className="line line--user">
                <span className="line__marker" aria-hidden="true">
                  &gt;
                </span>
                <div className="line__text">{turn.text}</div>
              </article>
            )
          }

          if (turn.kind === 'error') {
            return (
              <article key={index} className="line line--error">
                <span className="line__marker" aria-hidden="true">
                  ✗
                </span>
                <div className="line__text">{turn.text}</div>
              </article>
            )
          }

          return (
            <article key={index} className="line line--agent">
              <span className="line__marker" aria-hidden="true">
                ⏺
              </span>
              <div className="line__body">
                <ul className="steps">
                  {turn.result.injections.map((injection, injectionIndex) => (
                    <li key={injectionIndex} className="steps__item">
                      <span className="steps__glyph" aria-hidden="true">
                        ⎿
                      </span>
                      <span className="steps__label">
                        {injection.connector}
                        {injection.statusCode !== null && ` → HTTP ${injection.statusCode}`}
                        {injection.injectedLatencyMs > 0 && ` → +${injection.injectedLatencyMs} ms`}
                      </span>
                      <span className="steps__detail">{injection.detail}</span>
                    </li>
                  ))}
                  <li className="steps__item">
                    <span className="steps__glyph" aria-hidden="true">
                      ⎿
                    </span>
                    <span className="steps__label">
                      Agent responded in {turn.result.agent.durationMs} ms
                      {turn.result.agent.statusCode !== null &&
                        ` · HTTP ${turn.result.agent.statusCode}`}
                    </span>
                  </li>
                </ul>
                <div className="line__text">{turn.text || '(empty response)'}</div>
                <ReportCard result={turn.result} />
              </div>
            </article>
          )
        })}

        {props.running && (
          <article className="line line--agent">
            <span className="line__marker line__marker--spin" aria-hidden="true">
              ◐
            </span>
            <div className="line__text line__text--muted">
              Injecting chaos and judging the response…
            </div>
          </article>
        )}
      </div>

      {props.error && <p className="session__error">{props.error}</p>}

      <div className="composer">
        <div className="composer__box">
          <span className="composer__caret" aria-hidden="true">
            &gt;
          </span>
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
        <div className="composer__status">
          <span className="composer__statusItem">{props.connectorName}</span>
          <span className="composer__statusItem">
            {props.selectedModes.length
              ? `${props.selectedModes.length} failure${props.selectedModes.length > 1 ? 's' : ''} armed`
              : 'control run · no chaos'}
          </span>
          <span className="composer__statusItem composer__statusItem--hint">
            enter to run · shift + enter for a new line
          </span>
        </div>
      </div>
    </section>
  )
}
