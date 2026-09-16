import { expect, test } from '@playwright/test'

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

    await page.getByRole('button', { name: 'Overview' }).click()
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

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()

    await page.getByRole('button', { name: 'Activity' }).click()
    await expect(page.getByText('No runs yet.')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/03-static-tabs.png`, fullPage: true })
  })

  test('navigation stays usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')

    const rail = page.locator('.rail')
    await expect(rail).toBeVisible()

    for (const tab of ['Laboratory', 'Activity', 'Settings', 'Overview', 'Preview']) {
      const button = page.getByRole('button', { name: tab, exact: true })
      // Dispatch the click directly so Playwright's actionability scrolling
      // doesn't mask a regression in the app's own scrollIntoView behavior.
      await button.evaluate((element) => (element as HTMLElement).click())
      await expect(button).toHaveClass(/rail__item--active/)
      // The active tab must be scrolled into view inside the horizontal rail.
      const inView = await button.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.left >= 0 && box.right <= window.innerWidth
      })
      expect(inView, `${tab} tab is visible in the rail`).toBe(true)
      // No page-level horizontal scrolling.
      expect(
        await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        })),
      ).toEqual({ scrollWidth: 390, clientWidth: 390 })
    }

    // The rail is sticky, so navigation is reachable after scrolling a long page.
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.mouse.wheel(0, 2000)
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeInViewport()

    await page.screenshot({ path: `${screenshots}/06-static-mobile-navigation.png` })
  })
})
