import type { EvaluatorInfo } from '../api'
import type { TabId } from '../tabs'
import { SparkleIcon } from './icons'

interface TopBarProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  targetLabel: string
}

export function TopBar({ evaluator, activeTab, targetLabel }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__crumbs">
        <span className="topbar__scope">agents</span>
        <span className="topbar__separator" aria-hidden="true">
          /
        </span>
        <span className="topbar__scope">chaos-monkey</span>
        <span className="topbar__separator" aria-hidden="true">
          /
        </span>
        <span className="topbar__current">{activeTab}</span>
      </div>
      <div className="topbar__meta">
        <span className="chip chip--target" title={targetLabel}>
          <span className="chip__label">Target</span>
          {targetLabel}
        </span>
        <span className="chip">
          <SparkleIcon className="chip__icon" />
          {evaluator ? evaluator.model : 'no judge'}
          {evaluator && !evaluator.configured ? ' · heuristic' : ''}
        </span>
      </div>
    </header>
  )
}
