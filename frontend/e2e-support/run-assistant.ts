import { expect, test } from '@playwright/test'
import { goToTab } from './nav'

export function runAssistantTests(staticBuild: boolean) {
  const screenshots = staticBuild ? 'e2e-static/screenshots' : 'e2e/screenshots'

  test.beforeEach(async ({ page }) => {
    await page.goto(staticBuild ? './' : '/')
  })

  test('reviews a plan, compares results, and prepares a follow-up without running it', async ({ page }, testInfo) => {
    const assistant = page.getByRole('region', { name: 'Run assistant' })
    const approve = assistant.getByRole('button', { name: 'Approve & run 2 checks' })
    const scenario = page.getByPlaceholder('Describe what the user asks the agent to do…')
    await expect(assistant.getByText('Baseline · no faults')).toBeVisible()
    await expect(assistant.getByText('Nothing runs until you approve.', { exact: false })).toBeVisible()
    await expect(page.getByRole('log').getByRole('article')).toHaveCount(0)
    await scenario.fill(' ')
    await expect(approve).toBeDisabled()
    await scenario.fill('Create a support ticket')
    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await expect(assistant.getByRole('button', { name: 'Approve & run 1 checks' })).toBeDisabled()
    await page.getByLabel('Expired auth (HTTP 401)').check()
    await approve.click()
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 2/2 checks completed', { timeout: 30_000 })
    await expect(assistant.getByText(/-\d+ vs baseline/)).toBeVisible()
    await expect(assistant.getByRole('heading', { name: 'Recommended next step' })).toBeVisible()
    await expect(page.getByRole('log').getByRole('article')).toHaveCount(4)
    await assistant.getByRole('button', { name: 'Prepare Latency spike' }).click()
    await expect(page.getByLabel('Latency spike')).toBeChecked()
    await expect(page.getByLabel('Expired auth (HTTP 401)')).not.toBeChecked()
    await expect(page.getByRole('log').getByRole('article')).toHaveCount(4)
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 2/2 checks completed')
    const path = `${screenshots}/20-run-assistant-results.png`
    await assistant.screenshot({ path })
    await testInfo.attach('Run assistant: results and follow-up', { path, contentType: 'image/png' })
    await goToTab(page, 'Activity')
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3)
    await goToTab(page, 'Run')
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 2/2 checks completed')
    await page.getByRole('button', { name: 'Clear session' }).click()
    await expect(assistant.getByRole('status')).toHaveCount(0)
  })

  test('isolates selected faults instead of masking them', async ({ page }) => {
    const assistant = page.getByRole('region', { name: 'Run assistant' })
    await page.getByLabel('Throttling (HTTP 429)').check()
    await assistant.getByRole('button', { name: 'Approve & run 3 checks' }).click()
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 3/3 checks completed', { timeout: 30_000 })
    await expect(page.getByRole('log').getByText('ServiceNow.CreateIncident → HTTP 401')).toBeVisible()
    await expect(page.getByRole('log').getByText('ServiceNow.CreateIncident → HTTP 429')).toBeVisible()
    await expect(assistant.getByText(/vs baseline/)).toHaveCount(2)
  })

  test('stops queued checks, snapshots settings, and prevents concurrent runs', async ({ page }, testInfo) => {
    const assistant = page.getByRole('region', { name: 'Run assistant' })
    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await page.getByLabel('Latency spike').check()
    await page.getByLabel('Expired auth (HTTP 401)').check()
    await assistant.getByRole('button', { name: 'Approve & run 3 checks' }).click()
    await expect(assistant.getByRole('listitem').filter({ hasText: 'Latency spike' }).last()).toContainText('running')
    await expect(page.getByRole('button', { name: 'Running…', exact: true })).toBeDisabled()
    await expect(assistant.getByRole('button', { name: 'Approve & run 3 checks' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Clear session' })).toBeDisabled()
    await page.getByLabel('Connector / tool').fill('Changed.Connector')
    await page.getByPlaceholder('Describe what the user asks the agent to do…').fill('Changed scenario')
    await page.getByPlaceholder('Describe what the user asks the agent to do…').press('Enter')
    await assistant.getByRole('button', { name: 'Stop after current check' }).click()
    await expect(assistant.getByRole('status')).toHaveText('Plan stopped · 2/3 checks completed', { timeout: 30_000 })
    await expect(assistant.getByRole('listitem').filter({ hasText: 'Expired auth' }).last()).toContainText('skipped')
    await expect(page.getByRole('log').getByText('ServiceNow.CreateIncident → +3000 ms')).toBeVisible()
    await expect(page.getByRole('log').getByText('Changed scenario')).toHaveCount(0)
    await expect(page.getByRole('log').getByRole('article')).toHaveCount(4)
    const path = `${screenshots}/21-run-assistant-stopped.png`
    await assistant.screenshot({ path })
    await testInfo.attach('Run assistant: safe stop', { path, contentType: 'image/png' })
    await page.getByRole('button', { name: 'Clear session' }).click()
    await page.getByLabel('Latency spike').uncheck()
    await assistant.getByRole('button', { name: 'Approve & run 2 checks' }).click()
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 2/2 checks completed', { timeout: 30_000 })
    await expect(page.getByRole('log').getByText('Changed.Connector → HTTP 401')).toBeVisible()
  })

  test('stops the plan on request errors and allows retry', async ({ page }) => {
    const assistant = page.getByRole('region', { name: 'Run assistant' })
    if (staticBuild) {
      await page.getByLabel('Endpoint', { exact: true }).fill('https://example.com/agent')
    } else {
      await page.route('**/api/experiments', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Target unavailable' }) }))
    }
    await assistant.getByRole('button', { name: 'Approve & run 2 checks' }).click()
    await expect(assistant.getByRole('status')).toHaveText('Plan failed · 0/2 checks completed')
    await expect(assistant.getByRole('listitem').filter({ hasText: 'Expired auth' }).last()).toContainText('skipped')
    await expect(page.getByRole('log').getByRole('article')).toHaveCount(2)
    if (staticBuild) {
      await page.getByLabel('Endpoint', { exact: true }).fill('')
    } else {
      await page.unroute('**/api/experiments')
    }
    await assistant.getByRole('button', { name: 'Approve & run 2 checks' }).click()
    await expect(assistant.getByRole('status')).toHaveText('Plan completed · 2/2 checks completed', { timeout: 30_000 })
  })

  test('keeps the assistant usable on narrow screens', async ({ page }, testInfo) => {
    const assistant = page.getByRole('region', { name: 'Run assistant' })
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(assistant.getByRole('button', { name: 'Approve & run 2 checks' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await assistant.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      // The gear and the hamburger stay reachable in the sticky top bar.
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport()
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeInViewport()
    }
    const path = `${screenshots}/22-run-assistant-mobile.png`
    await assistant.screenshot({ path })
    await testInfo.attach('Run assistant: mobile plan', { path, contentType: 'image/png' })
  })
}
