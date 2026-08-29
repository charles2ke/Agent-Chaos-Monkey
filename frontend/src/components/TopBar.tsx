import type { EvaluatorInfo } from '../api'
import type { TabId } from '../tabs'

interface TopBarProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  targetLabel: string
}

export function TopBar({ evaluator, activeTab, targetLabel }: TopBarProps) {
  return (
    <header className="commandbar">
      <div className="commandbar__crumbs">
        <span className="commandbar__prompt" aria-hidden="true">
          $
        </span>
        <span className="commandbar__command">chaos-monkey {activeTab.toLowerCase()}</span>
        <span className="commandbar__flag">--target</span>
        <span className="commandbar__value">{targetLabel}</span>
      </div>
      <div className="commandbar__meta">
        <span className="chip">
          {evaluator ? evaluator.model : 'no judge'}
          {evaluator && !evaluator.configured ? ' · heuristic' : ''}
        </span>
      </div>
    </header>
  )
}
