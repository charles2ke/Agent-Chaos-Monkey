import type { ChaosModeId, ChaosModeInfo, EvaluatorInfo } from '../api'

interface KnowledgePageProps {
  modes: ChaosModeInfo[]
  evaluator: EvaluatorInfo | null
}

/**
 * Faults that target what the agent does with a tool response rather than the HTTP transport.
 * The Laboratory browser simulation replays them against a scripted reference agent, so it can
 * never show how a real agent behaves under them.
 */
const agentLayerModes: ChaosModeId[] = [
  'PromptInjection',
  'ToolSchemaDrift',
  'TruncatedStream',
  'ContextExhaustion',
  'CascadingFailure',
]

export function KnowledgePage({ modes, evaluator }: KnowledgePageProps) {
  return (
    <section className="page" aria-label="Knowledge">
      <header className="page__header">
        <h2 className="page__title">Knowledge</h2>
        <p className="page__lead">
          The failure catalogue the harness knows how to inject, and the judge that grades the
          recovery.
        </p>
      </header>

      <h3 className="page__subtitle">Chaos catalogue</h3>
      {modes.length === 0 ? (
        <p className="page__empty">No chaos modes loaded. Start the backend to fetch the catalogue.</p>
      ) : (
        <ul className="cards">
          {modes.map((mode) => (
            <li key={mode.id} className="card">
              <span className="card__badge">{mode.id}</span>
              {agentLayerModes.includes(mode.id) && (
                <span className="card__badge">Agent-layer</span>
              )}
              <strong className="card__title">{mode.name}</strong>
              <p className="card__detail">{mode.description}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="note">
        <h4 className="note__title">Agent-layer faults need a real agent</h4>
        <p>
          Prompt injection, tool schema drift, truncated stream, context exhaustion and cascading
          failure are judged on what the agent does with the payload, not on the status code. The
          Laboratory simulation only replays them against a deterministic scripted agent, so a
          simulated pass is evidence about the harness, never about your agent.
        </p>
        <p>
          For real evidence on these five modes, run the backend locally and use Preview, or opt in
          to the live tool gateway in the Laboratory tab. Neither is available in the published
          GitHub Pages demo, where every Laboratory run is simulated in the browser.
        </p>
      </div>

      <h3 className="page__subtitle">Resilience judge</h3>
      <div className="note">
        <p>
          {evaluator
            ? `Runs on ${evaluator.provider} · ${evaluator.model}${
                evaluator.configured
                  ? '.'
                  : ', without credentials, so the deterministic rule-based judge scores the run.'
              }`
            : 'Evaluator unavailable. Start the backend, or use the published static demo where the deterministic judge runs in the browser.'}
        </p>
        <p>
          The judge speaks both the Anthropic Messages API and any OpenAI-compatible Chat Completions
          endpoint, so a hosted or a local model can be plugged in without code changes.
        </p>
      </div>
    </section>
  )
}
