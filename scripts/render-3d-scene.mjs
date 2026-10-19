import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const baseUrl = 'http://127.0.0.1:4173'
const outputDir = 'dist'
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
  env: process.env
})
let browser

async function waitForPreview() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite preview has not bound its port yet.
    }
    await delay(500)
  }
  throw new Error('Vite preview did not become ready within 30 seconds.')
}

function countColorSamples(pngBuffer) {
  const png = PNG.sync.read(pngBuffer)
  const colors = new Set()
  const stepX = Math.max(1, Math.floor(png.width / 70))
  const stepY = Math.max(1, Math.floor(png.height / 70))
  for (let y = 0; y < png.height; y += stepY) {
    for (let x = 0; x < png.width; x += stepX) {
      const offset = (y * png.width + x) * 4
      const r = png.data[offset] >> 3
      const g = png.data[offset + 1] >> 3
      const b = png.data[offset + 2] >> 3
      colors.add((r << 10) | (g << 5) | b)
    }
  }
  return { width: png.width, height: png.height, uniqueSampledColors: colors.size }
}

try {
  await waitForPreview()
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.85 })
  const pageErrors = []
  const resourceErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') resourceErrors.push('console: ' + message.text()) })
  page.on('requestfailed', request => resourceErrors.push('requestfailed: ' + request.url() + ' :: ' + (request.failure()?.errorText || 'unknown')))
  page.on('response', response => { if (response.url().includes('cdn.3dassets.dev') && response.status() >= 400) resourceErrors.push('http ' + response.status() + ': ' + response.url()) })
  await page.goto(baseUrl + '/#agent-chat', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.scene-shell .three-canvas canvas', { timeout: 20000 })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.scene-shell .three-canvas canvas')
    return Boolean(canvas && canvas.width > 300 && canvas.height > 200 && canvas.clientWidth > 300)
  }, null, { timeout: 20000 })
  // Wait for either the high-detail GLB or the explicit procedural fallback state.
  // The production browser may be able to fetch the asset CDN even if a restricted CI network cannot.
  await page.waitForFunction(() => {
    const el = document.querySelector('.three-canvas')
    return el?.dataset.roomReady === 'true' || (el?.dataset.roomStatus || '').includes('备用场景')
  }, null, { timeout: 15000 })
  const roomLoadState = await page.locator('.three-canvas').evaluate(el => ({
    roomReady: el.dataset.roomReady,
    cafeReady: el.dataset.cafeReady,
    roomStatus: el.dataset.roomStatus
  }))
  if (roomLoadState.roomReady === 'true') {
    // Coffee is supplementary; use the authored fallback if this second asset cannot be fetched.
    await page.waitForFunction(() => {
      const el = document.querySelector('.three-canvas')
      return el?.dataset.cafeReady === 'true' || (el?.dataset.roomStatus || '').includes('备用模型')
    }, null, { timeout: 15000 }).catch(() => {
      resourceErrors.push('Coffee GLB load did not resolve before timeout')
    })
  } else {
    resourceErrors.push('High-detail GLB unavailable in this network; captured the local real-time 3D fallback')
  }
  await page.waitForTimeout(900)
  // Freeze the app's perpetual RAF loop after several real frames so software Chromium can take a stable capture.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  await page.waitForTimeout(120)

  const webgl = await page.locator('.scene-shell .three-canvas canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2')
    return gl ? gl.getParameter(gl.VERSION) : null
  })
  if (!webgl) throw new Error('The scene canvas exists, but WebGL2 did not initialize.')

  await mkdir(outputDir, { recursive: true })
  const stagePath = outputDir + '/agent-group-chat-3d-stage.png'
  const fullPath = outputDir + '/agent-group-chat-3d-render.png'
  const canvasBox = await page.locator('.scene-shell .three-canvas canvas').boundingBox()
  if (!canvasBox || canvasBox.width < 300 || canvasBox.height < 200) throw new Error('The rendered canvas has invalid screen bounds: ' + JSON.stringify(canvasBox))
  // Capture by viewport crop instead of locator.screenshot(): an animated WebGL canvas never becomes layout-stable.
  await page.screenshot({ path: stagePath, clip: { x: canvasBox.x, y: canvasBox.y, width: canvasBox.width, height: canvasBox.height } })
  await page.screenshot({ path: fullPath })
  const stageQuality = countColorSamples(await readFile(stagePath))
  if (stageQuality.uniqueSampledColors < 100) {
    throw new Error('The WebGL scene screenshot appears visually blank: ' + JSON.stringify(stageQuality))
  }
  if (pageErrors.length) throw new Error('Browser runtime errors: ' + pageErrors.join(' | '))

  console.log('3D render check passed.')
  console.log('WebGL: ' + webgl)
  console.log('Stage screenshot: ' + stagePath + ' ' + JSON.stringify(stageQuality))
  console.log('Full UI screenshot: ' + fullPath)
  console.log('Room status: ' + await page.locator('.three-canvas').getAttribute('data-room-status'))
  console.log('Coffee GLB: ' + await page.locator('.three-canvas').getAttribute('data-cafe-ready'))
  if (resourceErrors.length) console.log('Resource diagnostics: ' + resourceErrors.slice(-20).join(' | '))
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
