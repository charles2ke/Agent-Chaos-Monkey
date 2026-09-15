import { isAgentLayerMode } from '../api'
import type { ChaosModeInfo, EvaluatorInfo } from '../api'

interface KnowledgePageProps {
  modes: ChaosModeInfo[]
  evaluator: EvaluatorInfo | null
}

function ModeCards({ modes }: { modes: ChaosModeInfo[] }) {
  return (
    <ul className="cards">
      {modes.map((mode) => (
        <li key={mode.id} className="card">
          <span className="card__badge">{mode.id}</span>
          <strong className="card__title">{mode.name}</strong>
          <p className="card__detail">{mode.description}</p>
        </li>
      ))}
    </ul>
  )
}

export function KnowledgePage({ modes, evaluator }: KnowledgePageProps) {
  const transportModes = modes.filter((mode) => !isAgentLayerMode(mode.id))
  const agentModes = modes.filter((mode) => isAgentLayerMode(mode.id))

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
        <>
          {transportModes.length > 0 && (
            <>
              <h4 className="page__subtitle">Transport faults</h4>
              <ModeCards modes={transportModes} />
            </>
          )}

          {agentModes.length > 0 && (
            <>
              <h4 className="page__subtitle">Agent-layer faults</h4>
              <div className="note">
                <p>
                  These target what the agent does with a tool response rather than the HTTP
                  transport. Preview and the default/static Laboratory run use the deterministic
                  simulator; live gateway or Direct Line runs provide the tool-boundary evidence —
                  timing, retries and side-effect receipts — for a real agent.
                </p>
              </div>
              <ModeCards modes={agentModes} />
            </>
          )}
        </>
      )}

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
