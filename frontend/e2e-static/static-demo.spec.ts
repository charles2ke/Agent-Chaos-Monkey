import { expect, test } from '@playwright/test'
import { goToTab, openMenu } from '../e2e-support/nav'

const screenshots = 'e2e-static/screenshots'
const agentLayerModes = [
  'PromptInjection',
  'ToolSchemaDrift',
  'TruncatedStream',
  'ContextExhaustion',
  'CascadingFailure',
]

test.describe('static GitHub Pages build', () => {
  test('runs a chaos experiment entirely in the browser', async ({ page }) => {
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls.push(request.url())
    })

    await page.goto('./')

    await expect(page.getByRole('checkbox', { name: /Expired auth \(HTTP 401\)/ })).toBeVisible()

    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(
      page.getByRole('heading', { name: /unsafe|fragile|needs work|resilient/i }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('ServiceNow.CreateIncident → HTTP 401')).toBeVisible()
    await expect(page.getByText('Fabricated tool success')).toBeVisible()
    expect(apiCalls).toHaveLength(0)

    await page.screenshot({ path: `${screenshots}/01-static-expired-auth.png`, fullPage: true })
  })

  test('a control run with no chaos scores as resilient', async ({ page }) => {
    await page.goto('./')

    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(page.getByRole('heading', { name: 'resilient' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Control run: the connector behaved normally.')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/02-static-control-run.png`, fullPage: true })
  })

  test('prompt injection is caught by the canary in the connector payload', async ({ page }) => {
    await page.goto('./')

    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await page.getByLabel('Prompt injection').check()
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(page.getByRole('heading', { name: /unsafe|fragile/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Followed injected instruction')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/04-static-prompt-injection.png`, fullPage: true })
  })

  test('all tabs are published in the static build', async ({ page }) => {
    await page.goto('./')

    await goToTab(page, 'Overview')
    await expect(page.getByText('Never fabricate tool success')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chaos catalogue' })).toBeVisible()
    for (const mode of agentLayerModes) {
      await expect(
        page.locator('li.card', { hasText: mode }).getByText('Agent-layer', { exact: true }),
      ).toBeVisible()
    }
    await expect(
      page.getByRole('heading', { name: 'Agent-layer faults need a real agent' }),
    ).toBeVisible()
    await expect(page.getByText(/Neither is available in the published/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Agent-layer faults', exact: true })).toBeVisible()
    await expect(page.getByText('Prompt injection', { exact: true })).toBeVisible()
    await expect(page.getByText('Tool schema drift', { exact: true })).toBeVisible()
    await expect(page.getByText('Truncated stream', { exact: true })).toBeVisible()
    await expect(page.getByText('Context exhaustion', { exact: true })).toBeVisible()
    await expect(page.getByText('Cascading failure', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/05-static-overview-catalogue.png`, fullPage: true })

    await expect(page.getByRole('radio', { name: /MCP\.FileSearch/ })).toBeVisible()

    // Settings is reached through the gear icon in the top right, not the menu.
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/07-static-settings.png`, fullPage: true })

    await goToTab(page, 'Activity')
    await expect(page.getByText('No runs yet.')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/03-static-tabs.png`, fullPage: true })
  })

  test('the hamburger menu lists every section, with sub-menus under Overview', async ({ page }) => {
    await page.goto('./')

    const rail = page.locator('.rail')
    await expect(rail).toBeHidden()

    await openMenu(page)
    for (const tab of ['Overview', 'Preview', 'Laboratory', 'Activity']) {
      await expect(rail.getByRole('button', { name: tab, exact: true })).toBeVisible()
    }
    for (const section of ['Instructions', 'Chaos catalogue', 'Resilience judge', 'Tools']) {
      await expect(rail.getByRole('button', { name: section, exact: true })).toBeVisible()
    }
    await page.screenshot({ path: `${screenshots}/08-static-navigation-menu.png`, fullPage: true })

    await rail.getByRole('button', { name: 'Chaos catalogue', exact: true }).click()
    await expect(rail).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Chaos catalogue' })).toBeVisible()
    await expect(page.getByText('Never fabricate tool success')).toBeHidden()
    await page.screenshot({ path: `${screenshots}/09-static-overview-section.png`, fullPage: true })

    // Escape closes the menu again.
    await openMenu(page)
    await page.keyboard.press('Escape')
    await expect(rail).toBeHidden()
  })

  test('tooltips explain the screen on hover', async ({ page }) => {
    await page.goto('./')

    const tip = page.getByRole('button', { name: /^About Injected failures/ })
    await expect(page.getByRole('tooltip').first()).toBeHidden()
    await tip.hover()
    await expect(page.getByText(/Tick every fault to inject on the next run/)).toBeVisible()
    await page.screenshot({ path: `${screenshots}/10-static-tooltip.png` })
  })

  test('navigation stays usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')

    const rail = page.locator('.rail')
    await expect(rail).toBeHidden()

    for (const tab of ['Laboratory', 'Activity', 'Overview', 'Preview']) {
      await openMenu(page)
      const button = rail.getByRole('button', { name: tab, exact: true })
      await button.click()
      await expect(rail).toBeHidden()
      await openMenu(page)
      await expect(button).toHaveClass(/rail__item--active/)
      await page.keyboard.press('Escape')
      // No page-level horizontal scrolling.
      expect(
        await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        })),
      ).toEqual({ scrollWidth: 390, clientWidth: 390 })
    }

    // The top bar is sticky, so the menu is reachable after scrolling a long page.
    await goToTab(page, 'Overview')
    await page.mouse.wheel(0, 2000)
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeInViewport()

    await openMenu(page)
    await page.screenshot({ path: `${screenshots}/06-static-mobile-navigation.png` })
  })
})
