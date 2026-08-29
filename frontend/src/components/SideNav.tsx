import type { EvaluatorInfo } from '../api'
import { tabs } from '../tabs'
import type { TabId } from '../tabs'

const glyphs: Record<TabId, string> = {
  Instructions: '§',
  Knowledge: '❑',
  Tools: '⚒',
  Preview: '›_',
  Activity: '≡',
  Settings: '⚙',
}

interface SideNavProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  onSelectTab: (tab: TabId) => void
}

export function SideNav({ evaluator, activeTab, onSelectTab }: SideNavProps) {
  return (
    <nav className="rail" aria-label="Agent sections">
      <div className="rail__brand">
        <span className="rail__logo" aria-hidden="true">
          🐒
        </span>
        <div className="rail__identity">
          <div className="rail__path">
            <span className="rail__scope">agents/</span>
            <strong>chaos-monkey</strong>
          </div>
          <span className="rail__version">harness v0.1 · draft</span>
        </div>
      </div>

      <ul className="rail__list">
        {tabs.map((tab) => (
          <li key={tab}>
            <button
              type="button"
              className={`rail__item ${tab === activeTab ? 'rail__item--active' : ''}`}
              aria-current={tab === activeTab ? 'page' : undefined}
              onClick={() => onSelectTab(tab)}
            >
              <span className="rail__glyph" aria-hidden="true">
                {glyphs[tab]}
              </span>
              {tab}
            </button>
          </li>
        ))}
      </ul>

      <div className="rail__status">
        <span className={`dot ${evaluator?.configured ? 'dot--ok' : 'dot--warn'}`} aria-hidden="true" />
        <span className="rail__statusText">
          {evaluator
            ? `${evaluator.provider} · ${evaluator.model}${evaluator.configured ? '' : ' (heuristic judge)'}`
            : 'evaluator offline'}
        </span>
      </div>
    </nav>
  )
}
