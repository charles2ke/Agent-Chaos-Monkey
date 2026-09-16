import { chromium, devices } from '@playwright/test'
const b = await chromium.launch()
for (const [name, opts] of [['mobile', devices['iPhone 13']], ['desktop', { viewport:{width:1440,height:900} }]]) {
  const ctx = await b.newContext({ ...opts })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4173/Agent-Chaos-Monkey/')
  await p.waitForTimeout(1200)
  const btn = p.getByRole('button', { name: 'Run chaos' })
  console.log(name, 'visible', await btn.isVisible(), 'box', JSON.stringify(await btn.boundingBox()), 'vp', JSON.stringify(p.viewportSize()), 'docH', await p.evaluate(()=>document.documentElement.scrollHeight), 'bodyOverflow', await p.evaluate(()=>getComputedStyle(document.body).overflow))
  console.log(name, 'appOverflow', await p.evaluate(()=>{const e=document.querySelector('.app'); const s=getComputedStyle(e); return [s.height,s.overflow,e.scrollHeight]}))
  await p.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: true })
  await p.screenshot({ path: `/tmp/shots/${name}-viewport.png` })
  await ctx.close()
}
await b.close()
