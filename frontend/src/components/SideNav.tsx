import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { EvaluatorInfo } from '../api'
import { menuTabs, overviewSectionDescriptions, overviewSections, tabDescriptions } from '../tabs'
import type { OverviewSectionId, TabId } from '../tabs'
import {
  ActivityIcon,
  CloseIcon,
  OverviewIcon,
  PreviewIcon,
  SettingsIcon,
  ToolsIcon,
} from './icons'

const tabIcons = {
  Overview: OverviewIcon,
  Preview: PreviewIcon,
  Laboratory: ToolsIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
} satisfies Record<TabId, (props: { className?: string }) => ReactElement>

interface SideNavProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  overviewSection: OverviewSectionId | null
  open: boolean
  onSelectTab: (tab: TabId) => void
  onSelectOverviewSection: (section: OverviewSectionId | null) => void
  onClose: () => void
}

export function SideNav({
  evaluator,
  activeTab,
  overviewSection,
  open,
  onSelectTab,
  onSelectOverviewSection,
  onClose,
}: SideNavProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <nav
      id="app-navigation"
      className={`rail ${open ? 'rail--open' : ''}`}
      aria-label="Agent sections"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : true}
    >
      <div className="rail__brand">
        <span className="rail__logo" aria-hidden="true">
          🐒
        </span>
        <div className="rail__identity">
          <strong className="rail__name">Chaos Monkey</strong>
          <span className="rail__version">Agent harness · v0.1</span>
        </div>
        <button
          type="button"
          ref={closeRef}
          className="iconButton rail__close"
          onClick={onClose}
          aria-label="Close navigation menu"
          title="Close the navigation menu and return to the current screen"
        >
          <CloseIcon />
        </button>
      </div>

      <ul className="rail__list">
        {menuTabs.map((tab) => {
          const TabIcon = tabIcons[tab]
          const active = tab === activeTab
          return (
            <li key={tab}>
              <button
                type="button"
                className={`rail__item ${active ? 'rail__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={tabDescriptions[tab]}
                onClick={() => onSelectTab(tab)}
              >
                <TabIcon className="rail__glyph" />
                {tab}
              </button>

              {tab === 'Overview' && (
                <ul className="rail__sublist" aria-label="Overview sections">
                  {overviewSections.map((section) => {
                    const sectionActive = activeTab === 'Overview' && overviewSection === section
                    return (
                      <li key={section}>
                        <button
                          type="button"
                          className={`rail__subitem ${sectionActive ? 'rail__subitem--active' : ''}`}
                          aria-current={sectionActive ? 'page' : undefined}
                          title={overviewSectionDescriptions[section]}
                          onClick={() => onSelectOverviewSection(section)}
                        >
                          {section}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="rail__status" title="The judge that scores every chaos run.">
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
