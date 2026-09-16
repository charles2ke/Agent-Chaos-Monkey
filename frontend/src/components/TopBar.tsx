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
          <span className="chip__text">{targetLabel}</span>
        </span>
        <span className="chip">
          <SparkleIcon className="chip__icon" />
          <span className="chip__text">
            {evaluator ? evaluator.model : 'no judge'}
            {evaluator && !evaluator.configured ? ' · heuristic' : ''}
          </span>
        </span>
      </div>
    </header>
  )
}
