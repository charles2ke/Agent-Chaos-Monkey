import { chromium, devices } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/')
await page.waitForTimeout(1200)
const tabs = ['Preview','Overview','Laboratory','Activity','Settings']
for (const t of tabs) {
  await page.getByRole('button', { name: t, exact: true }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `/tmp/shots/${process.argv[2]}-${t}-vp.png` })
}
await browser.close()
