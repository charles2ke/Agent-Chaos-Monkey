import type { Ref } from 'react'
import type { EvaluatorInfo } from '../api'
import { tabDescriptions } from '../tabs'
import type { OverviewSectionId, RunSectionId, TabId } from '../tabs'
import { MenuIcon, SettingsIcon, SparkleIcon } from './icons'

interface TopBarProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  overviewSection: OverviewSectionId | null
  runSection: RunSectionId | null
  targetLabel: string
  navOpen: boolean
  onToggleNav: () => void
  onOpenSettings: () => void
  menuButtonRef?: Ref<HTMLButtonElement>
}

export function TopBar({
  evaluator,
  activeTab,
  overviewSection,
  runSection,
  targetLabel,
  navOpen,
  onToggleNav,
  onOpenSettings,
  menuButtonRef,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        ref={menuButtonRef}
        className="iconButton topbar__menu"
        onClick={onToggleNav}
        aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={navOpen}
        aria-controls="app-navigation"
        title={
          navOpen
            ? 'Close the navigation menu and return to the current screen'
            : 'Open the navigation menu: Run and its tools, Overview and its sections, Laboratory and Activity'
        }
      >
        <MenuIcon />
      </button>
      <div className="topbar__crumbs">
        <span className="topbar__scope">agents</span>
        <span className="topbar__separator" aria-hidden="true">
          /
        </span>
        <span className="topbar__scope">chaos-monkey</span>
        <span className="topbar__separator" aria-hidden="true">
          /
        </span>
        <span className="topbar__current" title={tabDescriptions[activeTab]}>
          {activeTab}
        </span>
        {activeTab === 'Overview' && overviewSection && (
          <>
            <span className="topbar__separator" aria-hidden="true">
              /
            </span>
            <span className="topbar__current">{overviewSection}</span>
          </>
        )}
        {activeTab === 'Run' && runSection && (
          <>
            <span className="topbar__separator" aria-hidden="true">
              /
            </span>
            <span className="topbar__current">{runSection}</span>
          </>
        )}
      </div>
      <div className="topbar__meta">
        <span
          className="chip chip--target"
          title={`Chaos is injected between the harness and this target: ${targetLabel}`}
        >
          <span className="chip__label">Target</span>
          <span className="chip__text">{targetLabel}</span>
        </span>
        <span
          className="chip"
          title={
            evaluator
              ? `The resilience judge scoring each run: ${evaluator.provider} · ${evaluator.model}${
                  evaluator.configured ? '.' : ', running the deterministic heuristic judge.'
                }`
              : 'No judge is reachable, so runs cannot be scored by a model.'
          }
        >
          <SparkleIcon className="chip__icon" />
          <span className="chip__text">
            {evaluator ? evaluator.model : 'no judge'}
            {evaluator && !evaluator.configured ? ' · heuristic' : ''}
          </span>
        </span>
        <button
          type="button"
          className={`iconButton topbar__settings ${activeTab === 'Settings' ? 'iconButton--on' : ''}`}
          onClick={onOpenSettings}
          aria-label="Settings"
          aria-current={activeTab === 'Settings' ? 'page' : undefined}
          title={tabDescriptions.Settings}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  )
}
