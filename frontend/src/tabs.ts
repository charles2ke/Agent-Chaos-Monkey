export const tabs = [
  'Instructions',
  'Knowledge',
  'Tools',
  'Preview',
  'Activity',
  'Settings',
] as const

export type TabId = (typeof tabs)[number]
