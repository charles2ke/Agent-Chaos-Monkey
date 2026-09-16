export const tabs = [
  'Overview',
  'Preview',
  'Laboratory',
  'Activity',
  'Settings',
] as const

export type TabId = (typeof tabs)[number]

/** Settings lives behind the gear icon in the top bar, so it is not part of the menu list. */
export const menuTabs = ['Overview', 'Preview', 'Laboratory', 'Activity'] as const

export const tabDescriptions: Record<TabId, string> = {
  Overview:
    'The resilience contract, the chaos catalogue, the judge and the tool chaos is aimed at: everything the harness knows about the agent under test.',
  Preview:
    'Chat with the agent while a connector fault is injected, then read the scored resilience report for that run.',
  Laboratory:
    'Define repeatable suites of chaos runs, collect boundary evidence and compare results against a baseline.',
  Activity:
    'The history of every run in this session: modes injected, connector, score and verdict.',
  Settings:
    'Point the harness at your own agent endpoint, tune injected latency and choose the judge model.',
}

export const overviewSections = [
  'Instructions',
  'Chaos catalogue',
  'Resilience judge',
  'Tools',
] as const

export type OverviewSectionId = (typeof overviewSections)[number]

export const overviewSectionDescriptions: Record<OverviewSectionId, string> = {
  Instructions:
    'The five rules an agent must honour when a tool fails. The judge scores every run against them.',
  'Chaos catalogue':
    'Every fault that can be injected, split into transport faults at the connector boundary and agent-layer faults judged on agent behaviour.',
  'Resilience judge':
    'The model, or deterministic heuristic, that grades each recovery and returns a resilience score out of 100.',
  Tools:
    'The connector or tool boundary chaos is injected at. The selected tool is the one that fails during the next experiment.',
}
