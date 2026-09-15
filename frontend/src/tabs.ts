export const tabs = [
  'Overview',
  'Preview',
  'Laboratory',
  'Activity',
  'Settings',
] as const

export type TabId = (typeof tabs)[number]
