export const tabs = [
  'Instructions',
  'Knowledge',
  'Tools',
  'Preview',
  'Laboratory',
  'Activity',
  'Settings',
] as const

export type TabId = (typeof tabs)[number]
