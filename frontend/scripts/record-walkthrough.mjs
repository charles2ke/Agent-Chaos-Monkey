/**
 * Records the narrated product walkthrough (docs/videos/walkthrough.mp4).
 *
 * Drives the static demo build with Playwright, speaks each step with espeak-ng
 * and muxes the screen recording with the generated voiceover using ffmpeg.
 *
 * Usage: npm run record:walkthrough
 * Requires: espeak-ng and ffmpeg on PATH.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const frontendDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const repoRoot = path.resolve(frontendDir, '..')
const workDir = path.join(frontendDir, '.walkthrough')
const outputFile = path.join(repoRoot, 'docs', 'videos', 'walkthrough.mp4')
const baseUrl = 'http://localhost:4173/Agent-Chaos-Monkey/'
const viewport = { width: 1280, height: 800 }
const voice = process.env.WALKTHROUGH_VOICE ?? 'en-us+f3'
const wordsPerMinute = process.env.WALKTHROUGH_WPM ?? '165'
const gapSeconds = 0.6
const leadSeconds = 1
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/** Each step narrates one screen; `run` performs the UI actions while the line is spoken. */
const steps = [
  {
    text: 'Agent Chaos Monkey injects connector failures into A I agents, then measures whether they recover safely.',
    run: async (page) => {
      await page.goto(baseUrl)
      await page.getByRole('button', { name: 'Preview' }).click()
    },
  },
  {
    text: 'This is the Preview screen. On the left you pick the connector to sabotage and the chaos modes: latency spikes, server errors, empty or malformed payloads, throttling and expired auth.',
    run: async (page) => {
      await page.getByText('Expired auth (HTTP 401)').scrollIntoViewIfNeeded()
    },
  },
  {
    text: 'Expired auth is selected, so the ServiceNow connector answers with HTTP 401. Run the chaos experiment.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Run chaos' }).click()
      await page
        .getByRole('heading', { name: /unsafe|fragile|needs work|resilient/i })
        .waitFor({ timeout: 30000 })
    },
  },
  {
    text: 'The resilience report scores the run, flags that the agent fabricated tool success, and lists the connector trace with recommended fixes.',
    run: async (page) => {
      await page.mouse.wheel(0, 400)
    },
  },
  {
    text: 'The Activity screen keeps the history of every run, so you can compare scores as you harden the agent.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Activity' }).click()
    },
  },
  {
    text: 'Instructions holds the system prompt under test. Rules like never fabricate tool success are exactly what chaos runs verify.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Instructions' }).click()
    },
  },
  {
    text: 'Knowledge documents the chaos catalogue and how the resilience judge scores each response.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Knowledge' }).click()
      await page.mouse.wheel(0, 300)
    },
  },
  {
    text: 'Tools lists the connectors available to the agent, and lets you choose which one chaos targets.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Tools' }).click()
    },
  },
  {
    text: 'Settings points the harness at your own agent endpoint and judge model. Swap the built in demo agent for yours, and start testing.',
    run: async (page) => {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.mouse.wheel(0, 200)
    },
  },
]

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    )
  })
}

async function startPreviewServer() {
  const inUse = await fetch(baseUrl).then(
    () => true,
    () => false,
  )
  if (inUse) throw new Error('Port 4173 is already in use; stop the other server first.')

  await run(npmCommand, ['run', 'build'], {
    cwd: frontendDir,
    env: { ...process.env, VITE_STATIC_DEMO: 'true', VITE_BASE_PATH: '/Agent-Chaos-Monkey/' },
  })

  const server = spawn(npmCommand, ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: frontendDir,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_STATIC_DEMO: 'true', VITE_BASE_PATH: '/Agent-Chaos-Monkey/' },
  })

  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return server
    } catch {
      // preview server is not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  stopServer(server)
  throw new Error('Preview server did not start on port 4173.')
}

function stopServer(server) {
  // vite runs as a child of npm, so signal the whole process group.
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill()
  }
}

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ])
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve(Number.parseFloat(out.trim())) : reject(new Error('ffprobe failed')),
    )
  })
}

async function speak(text, file) {
  await run('espeak-ng', ['-v', voice, '-s', wordsPerMinute, '-w', file, text])
  return probeDuration(file)
}

async function makeSilence(file, seconds) {
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=mono:sample_rate=22050',
    '-t',
    String(seconds),
    file,
  ])
}

async function main() {
  await rm(workDir, { recursive: true, force: true })
  await mkdir(workDir, { recursive: true })
  await mkdir(path.dirname(outputFile), { recursive: true })

  // Narration is generated first so every on-screen step lasts exactly as long as its line.
  const clips = []
  for (const [index, step] of steps.entries()) {
    const file = path.join(workDir, `narration-${String(index).padStart(2, '0')}.wav`)
    const duration = await speak(step.text, file)
    clips.push({ file, duration })
  }

  const totalSeconds = clips.reduce((sum, clip) => sum + clip.duration + gapSeconds, leadSeconds)
  console.log(`Narration length: ${totalSeconds.toFixed(1)}s`)
  if (totalSeconds > 120) throw new Error('Walkthrough exceeds the two minute budget.')

  const server = await startPreviewServer()
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: path.join(workDir, 'video'), size: viewport },
  })
  const page = await context.newPage()

  try {
    for (const [index, step] of steps.entries()) {
      await step.run(page)
      // The narration track opens with `leadSeconds` of silence; hold the first
      // screen for the same time so speech and actions stay in sync.
      const hold = clips[index].duration + gapSeconds + (index === 0 ? leadSeconds : 0)
      await page.waitForTimeout(hold * 1000)
    }
    await page.waitForTimeout(800)
  } finally {
    await context.close()
    await browser.close()
    stopServer(server)
  }

  const videoDir = path.join(workDir, 'video')
  const [recorded] = (await readdir(videoDir)).filter((name) => name.endsWith('.webm'))
  if (!recorded) throw new Error('Playwright produced no video.')

  // Rebuild the narration track with the same lead-in and gaps used while recording.
  const silence = path.join(workDir, 'gap.wav')
  const lead = path.join(workDir, 'lead.wav')
  await makeSilence(silence, gapSeconds)
  await makeSilence(lead, leadSeconds)

  const entries = [lead]
  for (const clip of clips) entries.push(clip.file, silence)
  const concatList = path.join(workDir, 'narration.txt')
  await writeFile(concatList, entries.map((file) => `file '${file}'`).join('\n'))

  const narration = path.join(workDir, 'narration.wav')
  await run('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatList,
    '-ar',
    '44100',
    narration,
  ])

  await run('ffmpeg', [
    '-y',
    '-i',
    path.join(videoDir, recorded),
    '-i',
    narration,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '30',
    '-preset',
    'slow',
    '-r',
    '15',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    outputFile,
  ])

  console.log(`Wrote ${outputFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
