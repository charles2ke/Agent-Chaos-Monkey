import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { EvaluatorInfo } from '../api'
import {
  menuTabs,
  overviewSectionDescriptions,
  overviewSections,
  runSectionDescriptions,
  runSections,
  tabDescriptions,
} from '../tabs'
import type { OverviewSectionId, RunSectionId, TabId } from '../tabs'
import {
  ActivityIcon,
  CloseIcon,
  GitHubIcon,
  OverviewIcon,
  PreviewIcon,
  SettingsIcon,
  ToolsIcon,
} from './icons'

const tabIcons = {
  Run: PreviewIcon,
  Overview: OverviewIcon,
  Laboratory: ToolsIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
} satisfies Record<TabId, (props: { className?: string }) => ReactElement>

interface SideNavProps {
  evaluator: EvaluatorInfo | null
  activeTab: TabId
  overviewSection: OverviewSectionId | null
  runSection: RunSectionId | null
  open: boolean
  onSelectTab: (tab: TabId) => void
  onSelectOverviewSection: (section: OverviewSectionId | null) => void
  onSelectRunSection: (section: RunSectionId | null) => void
  onClose: () => void
}

function isVisible(element: HTMLElement) {
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

export function SideNav({
  evaluator,
  activeTab,
  overviewSection,
  runSection,
  open,
  onSelectTab,
  onSelectOverviewSection,
  onSelectRunSection,
  onClose,
}: SideNavProps) {
  const navRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        navRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not(:disabled):not([tabindex="-1"]), select:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(isVisible)
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <nav
      id="app-navigation"
      ref={navRef}
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

              {tab === 'Run' && (
                <ul className="rail__sublist" aria-label="Run sections">
                  {runSections.map((section) => {
                    const sectionActive = activeTab === 'Run' && runSection === section
                    return (
                      <li key={section}>
                        <button
                          type="button"
                          className={`rail__subitem ${sectionActive ? 'rail__subitem--active' : ''}`}
                          aria-current={sectionActive ? 'page' : undefined}
                          title={runSectionDescriptions[section]}
                          onClick={() => onSelectRunSection(section)}
                        >
                          {section}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

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

      <a
        className="rail__profile"
        href="https://github.com/charles2ke"
        target="_blank"
        rel="noreferrer noopener"
        title="Open the project author's GitHub profile in a new tab"
      >
        <GitHubIcon className="rail__glyph" />
        github.com/charles2ke
      </a>
    </nav>
  )
}
