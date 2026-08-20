import type { EvaluatorInfo } from '../api'

const tabs = ['Instructions', 'Knowledge', 'Tools', 'Preview', 'Activity', 'Settings']

export function TopBar({ evaluator }: { evaluator: EvaluatorInfo | null }) {
  return (
    <header className="topbar">
      <div className="topbar__row">
        <div className="topbar__identity">
          <span className="topbar__avatar" aria-hidden="true">
            🐒
          </span>
          <div>
            <div className="topbar__breadcrumb">
              <span>agents</span>
              <span className="topbar__slash">/</span>
              <strong>Chaos Monkey</strong>
            </div>
            <p className="topbar__subtitle">
              Resilience harness for Copilot Studio agents and their connectors
            </p>
          </div>
          <span className="pill pill--draft">Draft</span>
        </div>
        <div className="topbar__meta">
          <span className={`pill ${evaluator?.configured ? 'pill--ok' : 'pill--warn'}`}>
            {evaluator
              ? `${evaluator.provider} · ${evaluator.model}${evaluator.configured ? '' : ' (heuristic judge)'}`
              : 'evaluator offline'}
          </span>
        </div>
      </div>
      <nav className="tabs" aria-label="Agent sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tabs__tab ${tab === 'Preview' ? 'tabs__tab--active' : ''}`}
            aria-current={tab === 'Preview' ? 'page' : undefined}
            disabled={tab !== 'Preview'}
          >
            {tab}
          </button>
        ))}
      </nav>
    </header>
  )
}
