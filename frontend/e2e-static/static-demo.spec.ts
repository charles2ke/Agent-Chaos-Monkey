import { expect, test } from '@playwright/test'

const screenshots = 'e2e-static/screenshots'

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

    await page.getByRole('button', { name: 'Instructions' }).click()
    await expect(page.getByText('Never fabricate tool success')).toBeVisible()

    await page.getByRole('button', { name: 'Knowledge' }).click()
    await expect(page.getByRole('heading', { name: 'Chaos catalogue' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Agent-layer faults' })).toBeVisible()
    await expect(page.getByText('Prompt injection', { exact: true })).toBeVisible()
    await expect(page.getByText('Tool schema drift', { exact: true })).toBeVisible()
    await expect(page.getByText('Truncated stream', { exact: true })).toBeVisible()
    await expect(page.getByText('Context exhaustion', { exact: true })).toBeVisible()
    await expect(page.getByText('Cascading failure', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/05-static-knowledge-catalogue.png`, fullPage: true })

    await page.getByRole('button', { name: 'Tools' }).click()
    await expect(page.getByRole('radio', { name: /MCP\.FileSearch/ })).toBeVisible()

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()

    await page.getByRole('button', { name: 'Activity' }).click()
    await expect(page.getByText('No runs yet.')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/03-static-tabs.png`, fullPage: true })
  })
})
