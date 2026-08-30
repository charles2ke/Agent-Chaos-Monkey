import type { EvaluatorInfo } from '../api'
import { tabs } from '../tabs'
import type { TabId } from '../tabs'
import {
  ActivityIcon,
  InstructionsIcon,
  KnowledgeIcon,
  PreviewIcon,
  SettingsIcon,
  ToolsIcon,
} from './icons'

const tabIcons = {
  Instructions: InstructionsIcon,
  Knowledge: KnowledgeIcon,
  Tools: ToolsIcon,
  Preview: PreviewIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
} satisfies Record<TabId, (props: { className?: string }) => React.ReactElement>

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
          <strong className="rail__name">Chaos Monkey</strong>
          <span className="rail__version">Agent harness · v0.1</span>
        </div>
        <span className="badge badge--draft">Draft</span>
      </div>

      <ul className="rail__list">
        {tabs.map((tab) => {
          const TabIcon = tabIcons[tab]
          return (
            <li key={tab}>
              <button
                type="button"
                className={`rail__item ${tab === activeTab ? 'rail__item--active' : ''}`}
                aria-current={tab === activeTab ? 'page' : undefined}
                onClick={() => onSelectTab(tab)}
              >
                <TabIcon className="rail__glyph" />
                {tab}
              </button>
            </li>
          )
        })}
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
