import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const baseUrl = 'http://127.0.0.1:4173'
const outputDir = 'dist'
const server = spawn(
  'npm',
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  {
    stdio: 'ignore',
    env: process.env,
  },
)
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
      '--enable-unsafe-swiftshader',
    ],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 0.85,
  })
  const pageErrors = []
  const resourceErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') resourceErrors.push('console: ' + message.text())
  })
  page.on('requestfailed', (request) =>
    resourceErrors.push(
      'requestfailed: ' + request.url() + ' :: ' + (request.failure()?.errorText || 'unknown'),
    ),
  )
  page.on('response', (response) => {
    if (response.url().includes('cdn.3dassets.dev') && response.status() >= 400)
      resourceErrors.push('http ' + response.status() + ': ' + response.url())
  })
  await page.goto(baseUrl + '/#agent-chat', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.scene-shell .three-canvas canvas', { timeout: 20000 })
  // The component can mount while its route/layout is still settling in headless Chromium.
  // Trigger one layout pass and wait on the actual CSS box as well as the WebGL drawing buffer.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  try {
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('.scene-shell .three-canvas canvas')
        const box = canvas?.getBoundingClientRect()
        return Boolean(
          canvas &&
            box &&
            box.width > 300 &&
            box.height > 200 &&
            canvas.width > 0 &&
            canvas.height > 0,
        )
      },
      null,
      { timeout: 20000 },
    )
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const host = document.querySelector('.scene-shell .three-canvas')
      const canvas = host?.querySelector('canvas')
      const box = canvas?.getBoundingClientRect()
      const hostBox = host?.getBoundingClientRect()
      return {
        url: location.href,
        hostBox: hostBox ? { width: hostBox.width, height: hostBox.height } : null,
        canvasBox: box ? { width: box.width, height: box.height } : null,
        drawingBuffer: canvas ? { width: canvas.width, height: canvas.height } : null,
      }
    })
    throw new Error('3D canvas did not reach a visible render size: ' + JSON.stringify(diagnostics))
  }
  // Wait for either the high-detail GLB or the explicit procedural fallback state.
  // The production browser may be able to fetch the asset CDN even if a restricted CI network cannot.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.three-canvas')
      return el?.dataset.roomReady === 'true' || (el?.dataset.roomStatus || '').includes('备用场景')
    },
    null,
    { timeout: 15000 },
  )
  const roomLoadState = await page.locator('.three-canvas').evaluate((el) => ({
    roomReady: el.dataset.roomReady,
    cafeReady: el.dataset.cafeReady,
    roomStatus: el.dataset.roomStatus,
  }))
  if (roomLoadState.roomReady === 'true') {
    // Coffee is supplementary; use the authored fallback if this second asset cannot be fetched.
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector('.three-canvas')
          return (
            el?.dataset.cafeReady === 'true' || (el?.dataset.roomStatus || '').includes('备用模型')
          )
        },
        null,
        { timeout: 15000 },
      )
      .catch(() => {
        resourceErrors.push('Coffee GLB load did not resolve before timeout')
      })
  } else {
    resourceErrors.push(
      'High-detail GLB unavailable in this network; captured the local real-time 3D fallback',
    )
  }
  // Exercise the actual theme control, not just the existence of a WebGL canvas.
  const modeButton = page.locator('.scene-mode-btn')
  await modeButton.waitFor({ state: 'visible', timeout: 5000 })
  const initialPressed = await modeButton.getAttribute('aria-pressed')
  const initialTheme = await page.locator('.space3d').getAttribute('class')
  await modeButton.click()
  await page.waitForFunction(() => {
    const button = document.querySelector('.scene-mode-btn')
    const root = document.querySelector('.space3d')
    return button?.getAttribute('aria-pressed') === 'true' && root?.classList.contains('business-theme')
  }, null, { timeout: 5000 })
  const businessTheme = await page.locator('.space3d').getAttribute('class')
  if (businessTheme === initialTheme) throw new Error('Theme root class did not change after enabling business mode.')
  await modeButton.click()
  await page.waitForFunction(() => {
    const button = document.querySelector('.scene-mode-btn')
    const root = document.querySelector('.space3d')
    return button?.getAttribute('aria-pressed') === 'false' && !root?.classList.contains('business-theme')
  }, null, { timeout: 5000 })
  if (initialPressed !== 'false') throw new Error('Expected fairytale mode to be the initial mode; got aria-pressed=' + initialPressed)

  // Check the responsive control at a phone-sized viewport too.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(150)
  const mobileToggle = await modeButton.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return { display: style.display, visibility: style.visibility, width: rect.width, height: rect.height }
  })
  if (mobileToggle.display === 'none' || mobileToggle.visibility === 'hidden' || mobileToggle.width < 1 || mobileToggle.height < 1) {
    throw new Error('Theme toggle is not visible on mobile viewport: ' + JSON.stringify(mobileToggle))
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(900)
  // Freeze the app's perpetual RAF loop after several real frames so software Chromium can take a stable capture.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0
  })
  await page.waitForTimeout(120)

  const webgl = await page.locator('.scene-shell .three-canvas canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2')
    return gl ? gl.getParameter(gl.VERSION) : null
  })
  if (!webgl) throw new Error('The scene canvas exists, but WebGL2 did not initialize.')

  await mkdir(outputDir, { recursive: true })
  const stagePath = outputDir + '/agent-group-chat-3d-stage.png'
  const fullPath = outputDir + '/agent-group-chat-3d-render.png'
  const canvasBox = await page.locator('.scene-shell .three-canvas canvas').boundingBox()
  if (!canvasBox || canvasBox.width < 300 || canvasBox.height < 200)
    throw new Error('The rendered canvas has invalid screen bounds: ' + JSON.stringify(canvasBox))
  // Hide HTML overlays so the stage screenshot measures the WebGL pixels, not the colorful chat UI.
  await page.evaluate(() => {
    for (const selector of [
      '.scene-vignette',
      '.left-glass',
      '.environment-label',
      '.agent-labels',
      '.view-dock',
      '.environment-credit',
      '.scene-footnote',
      '.chat-panel',
    ]) {
      document.querySelectorAll(selector).forEach((el) => {
        el.dataset.visualTestHidden = 'true'
        el.style.visibility = 'hidden'
      })
    }
  })
  // Capture by viewport crop instead of locator.screenshot(): an animated WebGL canvas never becomes layout-stable.
  await page.screenshot({
    path: stagePath,
    clip: { x: canvasBox.x, y: canvasBox.y, width: canvasBox.width, height: canvasBox.height },
  })
  const stageQuality = countColorSamples(await readFile(stagePath))
  await page.evaluate(() =>
    document.querySelectorAll('[data-visual-test-hidden="true"]').forEach((el) => {
      el.style.visibility = ''
      delete el.dataset.visualTestHidden
    }),
  )
  await page.screenshot({ path: fullPath })
  if (stageQuality.uniqueSampledColors < 100) {
    throw new Error(
      'The WebGL-only scene appears blank or unlit after hiding HTML overlays: ' +
        JSON.stringify(stageQuality),
    )
  }
  if (pageErrors.length) throw new Error('Browser runtime errors: ' + pageErrors.join(' | '))

  console.log('3D render check passed.')
  console.log('WebGL: ' + webgl)
  console.log('Stage screenshot: ' + stagePath + ' ' + JSON.stringify(stageQuality))
  console.log('Full UI screenshot: ' + fullPath)
  console.log(
    'Room status: ' + (await page.locator('.three-canvas').getAttribute('data-room-status')),
  )
  console.log(
    'Coffee GLB: ' + (await page.locator('.three-canvas').getAttribute('data-cafe-ready')),
  )
  if (resourceErrors.length)
    console.log('Resource diagnostics: ' + resourceErrors.slice(-20).join(' | '))
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
