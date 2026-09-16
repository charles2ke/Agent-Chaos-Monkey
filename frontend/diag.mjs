import { chromium, devices } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'] })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5173/')
await page.waitForTimeout(1200)
for (const t of ['Preview','Overview','Laboratory','Activity','Settings']) {
  await page.getByRole('button', { name: t, exact: true }).click()
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const wide = []
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) wide.push(`${el.tagName}.${el.className}`.slice(0,90) + ` [${Math.round(r.left)},${Math.round(r.right)}]`)
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) wide.push(`SCROLL ${el.tagName}.${el.className}`.slice(0,90) + ` ${el.scrollWidth}/${el.clientWidth}`)
    })
    const rail = document.querySelector('.rail')?.getBoundingClientRect()
    return { wide: [...new Set(wide)].slice(0, 15), railH: rail && Math.round(rail.height) }
  })
  console.log('==', t, JSON.stringify(info, null, 1))
}
await browser.close()
