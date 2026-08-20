import { expect, test } from '@playwright/test'

const screenshots = 'e2e/screenshots'

test.describe('Chaos Monkey preview tab', () => {
  test('renders the agent preview shell', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { name: 'Injected failures' })).toBeVisible()
    await expect(page.getByText('Expired auth (HTTP 401)')).toBeVisible()
    await expect(page.getByText('Test how the agent behaves when things break')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/01-preview-empty.png`, fullPage: true })
  })

  test('injects an expired auth failure and scores the demo agent', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(
      page.getByRole('heading', { name: /unsafe|fragile|needs work|resilient/i }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('ServiceNow.CreateIncident → HTTP 401')).toBeVisible()
    await expect(page.getByText('Fabricated tool success')).toBeVisible()
    await expect(page.getByText('Generated regression evals')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/02-expired-auth-report.png`, fullPage: true })
  })

  test('a control run with no chaos scores as resilient', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await page
      .getByPlaceholder('Describe what the user asks the agent to do…')
      .fill('Check the status of my order')
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(page.getByRole('heading', { name: 'resilient' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Control run: the connector behaved normally.')).toBeVisible()

    await page.screenshot({ path: `${screenshots}/03-control-run.png`, fullPage: true })
  })

  test('malformed connector data is reported in the trace', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Expired auth (HTTP 401)').uncheck()
    await page.getByLabel('Malformed data').check()
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(
      page.getByText('Connector returned truncated / invalid JSON.'),
    ).toBeVisible({ timeout: 30_000 })

    await page.screenshot({ path: `${screenshots}/04-malformed-data.png`, fullPage: true })
  })
})
