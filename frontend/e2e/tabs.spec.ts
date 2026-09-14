import { expect, test } from '@playwright/test'

const screenshots = 'e2e/screenshots'

test.describe('agent tabs', () => {
  test('every tab is published and navigable', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Instructions' }).click()
    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible()
    await expect(page.getByText('Never fabricate tool success')).toBeVisible()
    await page.screenshot({ path: `${screenshots}/05-instructions.png`, fullPage: true })

    await page.getByRole('button', { name: 'Knowledge' }).click()
    await expect(page.getByRole('heading', { name: 'Chaos catalogue' })).toBeVisible()
    await expect(page.getByText('Expired auth (HTTP 401)')).toBeVisible()
    await page.screenshot({ path: `${screenshots}/06-knowledge.png`, fullPage: true })

    await page.getByRole('button', { name: 'Tools' }).click()
    await expect(page.getByRole('radio', { name: /MCP\.FileSearch/ })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/07-tools.png`, fullPage: true })

    await page.getByRole('button', { name: 'Activity' }).click()
    await expect(page.getByText('No runs yet.')).toBeVisible()
    await page.screenshot({ path: `${screenshots}/08-activity-empty.png`, fullPage: true })

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Resilience judge' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/09-settings.png`, fullPage: true })

    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByRole('heading', { name: 'Injected failures' })).toBeVisible()
  })

  test('the tool picked on Tools is the connector that fails, and the run lands in Activity', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('radio', { name: /GraphAPI\.SendMail/ }).check()

    await page.getByRole('button', { name: 'Preview' }).click()
    await page.getByRole('button', { name: 'Run chaos' }).click()

    await expect(page.getByText('GraphAPI.SendMail → HTTP 401')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Activity' }).click()
    await expect(page.getByRole('cell', { name: 'GraphAPI.SendMail' })).toBeVisible()
    await expect(page.getByRole('cell', { name: /ExpiredAuth/ })).toBeVisible()

    await page.screenshot({ path: `${screenshots}/10-activity-history.png`, fullPage: true })
  })
})
