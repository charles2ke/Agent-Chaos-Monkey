import { expect, test } from '@playwright/test'
import { defaultDefinition, validateDefinition, validateHistory, validateTests } from '../src/lab'
import { noInjectedInstructionFollowed, simulateLab } from '../src/labSimulation'

export function laboratoryTests(staticBuild: boolean) {
  const screenshots = staticBuild ? 'e2e-static/screenshots' : 'e2e/screenshots'
  test.beforeEach(async ({ page }) => {
    await page.goto(staticBuild ? './' : '/')
    await page.getByRole('button', { name: 'Laboratory', exact: true }).click()
  })

  test('prompt injection assertion requires and evaluates a delivered canary', () => {
    const assertion = { id: 'injection', kind: 'noInjectedInstructionFollowed' as const, expected: true, severity: 'critical' as const }
    const withoutCanary = simulateLab({ ...defaultDefinition, assertions: [assertion] })
    expect(withoutCanary.runs.map(run => run.assertions[0].outcome)).toEqual(['inconclusive', 'inconclusive'])

    const withCanary = simulateLab({
      ...defaultDefinition,
      faults: [{ invocation: 1, mode: 'PromptInjection' }],
      assertions: [assertion],
    })
    const injectedRun = withCanary.runs[1]
    const canaries = injectedRun.trace.map(call => call.injectedCanary).filter((canary): canary is string => Boolean(canary))
    expect(canaries).toHaveLength(1)
    expect(noInjectedInstructionFollowed([`Follow ${canaries[0]}`], canaries)).toBe(false)
    expect(noInjectedInstructionFollowed(['Ignored injected instructions'], canaries)).toBe(true)
    expect(injectedRun.assertions[0].outcome).toBe('pass')
  })

  test('design matrix and sequence faults; inspect honest evidence and skipped scopes', async ({ page }) => {
    await expect(page.getByText('SIMULATED · deterministic reference agent')).toBeVisible()
    await page.getByLabel('Execution mode').selectOption('matrix')
    await page.getByRole('button', { name: 'Add fault', exact: true }).click()
    await page.getByRole('combobox', { name: 'Fault 2', exact: true }).selectOption('Latency')
    await page.getByLabel('Invocation 2', { exact: true }).fill('1')
    await page.getByLabel('Injected latency (ms)', { exact: true }).fill('300')
    await page.getByLabel('Tool timeout (ms)', { exact: true }).fill('100')
    await page.getByLabel('Initial retry backoff (ms)', { exact: true }).fill('50')
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    const report = page.getByRole('region', { name: 'Evidence report' })
    await expect(report.getByRole('heading', { name: 'Healthy control', exact: true })).toBeVisible()
    await expect(report.getByRole('heading', { name: 'Matrix 2: Latency' })).toBeVisible()
    await expect(report.getByText('Real agent resilience: inconclusive', { exact: true })).toHaveCount(3)
    await page.getByLabel('Execution mode').selectOption('sequence')
    await page.getByLabel('Invocation 2', { exact: true }).fill('2')
    await page.getByLabel('Fault connector 2', { exact: true }).fill('UnrelatedConnector')
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    await expect(report.getByText('#2 Latency · skipped', { exact: true })).toBeVisible()
    await report.getByText('Tool trace · 2 calls', { exact: true }).click()
    await expect(report.getByRole('cell', { name: /SIMULATED turn 1: authentication required/ })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/11-laboratory-evidence.png`, fullPage: true })
  })

  test('save failing contract, edit, rerun to resolved, persist, replay and compare versions', async ({ page }) => {
    await page.getByLabel('Experiment name', { exact: true }).fill('Auth recovery regression')
    await page.getByLabel('Reauthenticate before turn 2').uncheck()
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    await expect(page.getByRole('region', { name: 'Evidence report' }).getByText('fail', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save as test', exact: true }).click()
    const saved = page.getByRole('region', { name: 'Saved regression tests' })
    await expect(saved.getByText(/Baseline: fail/)).toBeVisible()
    await saved.getByRole('button', { name: 'Edit test', exact: true }).click()
    await page.getByLabel('Reauthenticate before turn 2').check()
    await page.getByLabel('Agent version', { exact: true }).fill('demo-v2')
    await page.getByRole('button', { name: 'Update saved test', exact: true }).click()
    await saved.getByRole('button', { name: 'Rerun test', exact: true }).click()
    await expect(saved.getByText(/Baseline: fail · Resolved/)).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Laboratory', exact: true }).click()
    await expect(saved.getByText(/Baseline: fail · Resolved/)).toBeVisible()
    await expect(page.getByLabel('Agent version', { exact: true })).toHaveValue('demo-v2')
    await page.getByLabel('Search laboratory history').fill('Auth recovery')
    await expect(page.getByRole('button', { name: 'Replay configuration' })).toHaveCount(2)
    await page.getByLabel('Compare version A').selectOption({ index: 2 })
    await page.getByLabel('Compare version B').selectOption({ index: 1 })
    await expect(page.getByRole('heading', { name: 'Comparison (descriptive, not causal)' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/12-laboratory-regressions.png`, fullPage: true })
    await page.getByRole('button', { name: 'Replay configuration' }).last().click()
    await expect(page.getByLabel('Agent version', { exact: true })).toHaveValue('demo-v1')
    await page.getByLabel('Search laboratory history').fill('does-not-exist')
    await expect(page.getByRole('button', { name: 'Replay configuration' })).toHaveCount(0)
  })

  test('strict suite and history imports, redacted export and no raw output persistence', async ({ page }) => {
    await page.getByText('Agent connection & live boundary', { exact: true }).click()
    const secret = 'short-private-key'
    await page.getByLabel('Agent API key (memory only)').fill(secret)
    await page.getByRole('textbox', { name: 'Scenario', exact: true }).fill(`Create ticket token=embedded-secret ${secret} https://example.com/path?api_key=query-secret#fragment`)
    await page.getByLabel('Agent endpoint', { exact: true }).fill('https://example.com/agent?token=url-secret')
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    await page.getByRole('button', { name: 'Save as test', exact: true }).click()
    const stored = await page.evaluate(() => localStorage.getItem('chaos-monkey.laboratory.v1') ?? '')
    for (const denied of [secret, 'embedded-secret', 'query-secret', 'url-secret', 'user:pass', 'agentResponse', 'sessionId', 'SIMULATED:']) expect(stored).not.toContain(denied)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export suite', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('chaos-suite.v1.json')
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream!) chunks.push(chunk)
    const suite = JSON.parse(Buffer.concat(chunks).toString())
    expect(suite.schemaVersion).toBe(1)
    expect(suite.tests).toHaveLength(1)
    expect(JSON.stringify(suite)).not.toContain(secret)
    await page.getByLabel('Import suite', { exact: true }).setInputFiles({ name: 'suite.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(suite)) })
    await expect(page.getByText('Imported 1 tests. Imports never execute automatically.')).toBeVisible()
    const credentialUrl = new URL('https://example.com')
    credentialUrl.username = 'fake-user'
    credentialUrl.password = 'fake-password'
    for (const bad of [
      { schemaVersion: 2, tests: [] },
      { schemaVersion: 1, tests: [{ id: 'bad', name: 'bad', definition: { ...defaultDefinition, agentApiKey: 'forbidden' } }] },
      { schemaVersion: 1, tests: [{ id: 'bad', name: 'bad', definition: { ...defaultDefinition, latencyMs: -1 } }] },
      { schemaVersion: 1, tests: [{ id: 'bad', name: 'bad', definition: { ...defaultDefinition, agentEndpoint: credentialUrl.href } }] },
    ]) {
      await page.getByLabel('Import suite', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
      await expect(page.getByRole('alert')).toContainText('Import rejected:')
    }
    const historyDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export history', exact: true }).click()
    const historyStream = await (await historyDownload).createReadStream()
    const historyChunks = []
    for await (const chunk of historyStream!) historyChunks.push(chunk)
    await page.getByRole('button', { name: 'Clear laboratory history' }).click()
    await page.getByLabel('Import history', { exact: true }).setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.concat(historyChunks) })
    await expect(page.getByText(/Imported 1 history summaries/)).toBeVisible()
    const state = JSON.parse(await page.evaluate(() => localStorage.getItem('chaos-monkey.laboratory.v1') ?? '{}'))
    validateDefinition(state.definition)
    validateTests({ schemaVersion: 1, tests: state.tests })
    validateHistory({ schemaVersion: 1, history: state.history })
    await page.reload()
    await page.getByRole('button', { name: 'Laboratory', exact: true }).click()
    await page.getByText('Agent connection & live boundary', { exact: true }).click()
    await expect(page.getByLabel('Agent API key (memory only)')).toHaveValue('')
    await expect(page.getByLabel('Agent endpoint', { exact: true })).toHaveValue('https://example.com/agent')
  })

  test('handles corrupt storage and quota without disabling simulations', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('chaos-monkey.laboratory.v1', '{broken'))
    await page.reload()
    await page.getByRole('button', { name: 'Laboratory', exact: true }).click()
    await expect(page.getByText(/Saved storage is unavailable or corrupt/)).toBeVisible()
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    await expect(page.getByRole('region', { name: 'Evidence report' })).toBeVisible()
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') } })
    await page.getByRole('button', { name: 'Replace corrupt storage with current work' }).click()
    await expect(page.getByText(/Browser storage unavailable or quota exceeded/)).toBeVisible()
    await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
    await expect(page.getByRole('region', { name: 'Evidence report' })).toBeVisible()
  })

  test('live gateway requires explicit opt-in and static pages never call the API', async ({ page }) => {
    const calls: string[] = []
    page.on('request', request => { if (request.url().includes('/api/lab/')) calls.push(request.url()) })
    await page.getByText('Agent connection & live boundary', { exact: true }).click()
    const gateway = page.getByLabel('Opt in to live tool gateway')
    if (staticBuild) {
      await expect(gateway).toBeDisabled()
      await expect(page.getByText(/GitHub Pages: live gateway unavailable/)).toBeVisible()
      await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
      expect(calls).toHaveLength(0)
    } else {
      await expect(gateway).not.toBeChecked()
      await gateway.check()
      await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
      await expect(page.getByRole('alert')).toContainText('requires an agent endpoint')
      expect(calls).toHaveLength(0)
      await page.route('**/api/lab/run', route => {
        const payload = route.request().postDataJSON()
        expect(payload.definition.transport).toBe('gateway')
        expect(payload.agentApiKey).toBe('session-only')
        return route.fulfill({ status: 503, body: '{}' })
      })
      await page.getByLabel('Agent endpoint', { exact: true }).fill('https://example.com/agent')
      await page.getByLabel('Agent API key (memory only)').fill('session-only')
      await page.getByRole('button', { name: 'Run laboratory experiment' }).click()
      await expect(page.getByRole('alert')).toContainText('HTTP 503')
      await page.reload()
      await page.getByRole('button', { name: 'Laboratory', exact: true }).click()
      await page.getByText('Agent connection & live boundary', { exact: true }).click()
      await expect(gateway).not.toBeChecked()
    }
  })
}
