import type { EvaluatorInfo } from '../api'
import { tabs } from '../tabs'
import type { TabId } from '../tabs'

interface TopBarProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  onSelectTab: (tab: TabId) => void
}

export function TopBar({ evaluator, activeTab, onSelectTab }: TopBarProps) {
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
            className={`tabs__tab ${tab === activeTab ? 'tabs__tab--active' : ''}`}
            aria-current={tab === activeTab ? 'page' : undefined}
            onClick={() => onSelectTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
    </header>
  )
}
