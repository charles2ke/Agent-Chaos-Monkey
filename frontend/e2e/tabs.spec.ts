import { expect, test } from '@playwright/test'
import { goToTab, openMenu } from '../e2e-support/nav'

const screenshots = 'e2e/screenshots'
const agentLayerModes = [
  'PromptInjection',
  'ToolSchemaDrift',
  'TruncatedStream',
  'ContextExhaustion',
  'CascadingFailure',
]

test.describe('agent tabs', () => {
  test('every tab is published and navigable from the hamburger menu', async ({ page }) => {
    await page.goto('/')

    await openMenu(page)
    await page.screenshot({ path: `${screenshots}/06-navigation-menu.png`, fullPage: true })
    await page.locator('.rail').getByRole('button', { name: 'Overview', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
    await expect(page.getByText('Never fabricate tool success')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chaos catalogue' })).toBeVisible()
    await expect(page.getByText('Expired auth (HTTP 401)')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()
    for (const mode of agentLayerModes) {
      await expect(
        page.locator('li.card', { hasText: mode }).getByText('Agent-layer', { exact: true }),
      ).toBeVisible()
    }
    await expect(
      page.getByRole('heading', { name: 'Agent-layer faults need a real agent' }),
    ).toBeVisible()
    await expect(page.getByText(/opt in to the live tool gateway in the Laboratory tab/)).toBeVisible()
    await page.screenshot({ path: `${screenshots}/05-overview.png`, fullPage: true })

    await goToTab(page, 'Activity')
    await expect(page.getByText('No runs yet.')).toBeVisible()
    await page.screenshot({ path: `${screenshots}/08-activity-empty.png`, fullPage: true })

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/09-settings.png`, fullPage: true })

    await goToTab(page, 'Run')
    await expect(page.getByRole('heading', { name: 'Injected failures' })).toBeVisible()
  })

  test('Run and Overview sub-menus open a single section', async ({ page }) => {
    await page.goto('/')

    await openMenu(page)
    await page.locator('.rail').getByRole('button', { name: 'Tools', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Injected failures' })).toBeHidden()
    await expect(page.getByRole('radio', { name: /MCP\.FileSearch/ })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/07-run-tools-section.png`, fullPage: true })

    await openMenu(page)
    await page.locator('.rail').getByRole('button', { name: 'Instructions', exact: true }).click()
    await expect(page.getByText('Never fabricate tool success')).toBeVisible()
    await expect(page.getByRole('radio', { name: /MCP\.FileSearch/ })).toBeHidden()
  })

  test('the open menu traps keyboard focus and updates its trigger tooltip', async ({ page }) => {
    await page.goto('/')

    await openMenu(page)
    const menuButton = page.locator('.topbar__menu')
    await expect(menuButton).toHaveAttribute(
      'title',
      'Close the navigation menu and return to the current screen',
    )

    await page.keyboard.press('Shift+Tab')
    await expect(page.locator('.rail').getByRole('button', { name: 'Activity', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('.rail__close')).toBeFocused()
  })

  test('the tool picked under Run is the connector that fails, and the run lands in Activity', async ({
    page,
  }) => {
    await page.goto('/')

    await openMenu(page)
    await page.locator('.rail').getByRole('button', { name: 'Tools', exact: true }).click()
    await page.getByRole('radio', { name: /GraphAPI\.SendMail/ }).check()

    await goToTab(page, 'Run')
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(page.getByText('GraphAPI.SendMail → HTTP 401')).toBeVisible({ timeout: 30_000 })

    await goToTab(page, 'Activity')
    await expect(page.getByRole('cell', { name: 'GraphAPI.SendMail' })).toBeVisible()
    await expect(page.getByRole('cell', { name: /ExpiredAuth/ })).toBeVisible()

    await page.screenshot({ path: `${screenshots}/10-activity-history.png`, fullPage: true })
  })
})
