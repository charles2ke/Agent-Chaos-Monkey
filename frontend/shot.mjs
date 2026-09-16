import { chromium, devices } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/')
await page.waitForTimeout(1500)
const tabs = ['Preview','Overview','Laboratory','Activity','Settings']
for (const t of tabs) {
  try { await page.getByRole('button', { name: t, exact: true }).click(); } catch(e) { console.log('no tab', t, e.message.slice(0,80)) }
  await page.waitForTimeout(500)
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  console.log(t, JSON.stringify(overflow))
  await page.screenshot({ path: `/tmp/shots/${process.argv[2]||'before'}-${t}.png`, fullPage: true })
}
await browser.close()
