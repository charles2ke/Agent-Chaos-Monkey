import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Navigation lives behind the hamburger menu, so every tab change opens the drawer first. */
export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await expect(page.locator('.rail')).toBeVisible()
}

export async function goToTab(page: Page, tab: string) {
  await openMenu(page)
  await page.locator('.rail').getByRole('button', { name: tab, exact: true }).click()
  await expect(page.locator('.rail')).toBeHidden()
}
