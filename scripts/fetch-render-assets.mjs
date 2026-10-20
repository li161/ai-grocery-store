import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.cwd()
const targetDir = join(root, 'public', 'models')
const sourceRoot = 'https://raw.githubusercontent.com/ErfanMo77/gltf-research-scenes/main/scenes/breakfast-room'
const assets = [
  {
    name: 'breakfast_room_extended.gltf',
    url: sourceRoot + '/gltf/breakfast_room_extended.gltf',
    minBytes: 85000
  },
  {
    name: 'breakfast_room.bin',
    url: 'https://media.githubusercontent.com/media/ErfanMo77/gltf-research-scenes/main/scenes/breakfast-room/gltf/breakfast_room.bin',
    minBytes: 12000000
  }
]

async function existsWithMinimumSize(path, minBytes) {
  try {
    return (await stat(path)).size >= minBytes
  } catch {
    return false
  }
}

async function fetchAsset(asset) {
  const destination = join(targetDir, asset.name)
  if (await existsWithMinimumSize(destination, asset.minBytes)) {
    console.log('[render-assets] Reusing ' + asset.name)
    return
  }

  await mkdir(dirname(destination), { recursive: true })
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log('[render-assets] Downloading ' + asset.name + ' (attempt ' + attempt + '/4)')
      const response = await fetch(asset.url, {
        signal: AbortSignal.timeout(120000),
        headers: { 'user-agent': 'ai-grocery-store-render-asset-fetcher' }
      })
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength < asset.minBytes) {
        throw new Error('Downloaded file is too small: ' + bytes.byteLength + ' bytes')
      }
      const temporary = destination + '.download'
      await writeFile(temporary, bytes)
      await rename(temporary, destination)
      console.log('[render-assets] Saved ' + asset.name + ' (' + bytes.byteLength + ' bytes)')
      return
    } catch (error) {
      lastError = error
      console.warn('[render-assets] Attempt failed: ' + error.message)
      if (attempt < 4) await delay(attempt * 1500)
    }
  }
  throw new Error('Could not fetch required render asset ' + asset.name + ': ' + lastError?.message)
}

await mkdir(targetDir, { recursive: true })
for (const asset of assets) await fetchAsset(asset)

const gltfPath = join(targetDir, 'breakfast_room_extended.gltf')
const gltf = JSON.parse(await readFile(gltfPath, 'utf8'))
for (const buffer of (gltf.buffers || [])) {
  if (buffer.uri && !buffer.uri.startsWith('data:')) {
    const dependency = join(targetDir, buffer.uri)
    if (!(await existsWithMinimumSize(dependency, buffer.byteLength * 0.98))) {
      throw new Error('Missing/incomplete glTF dependency: ' + buffer.uri)
    }
  }
}

const credits = `3D environment: The Breakfast Room
Original author: Wig42
Source/conversion repository: https://github.com/ErfanMo77/gltf-research-scenes/tree/main/scenes/breakfast-room
Original resource collection: https://benedikt-bitterli.me/resources/
License: Creative Commons Attribution 3.0 (CC BY 3.0)
License text: https://creativecommons.org/licenses/by/3.0/
Use: the scene is downloaded at build/dev startup and self-hosted from /models/ so the renderer does not depend on a third-party runtime CDN.
`
await writeFile(join(targetDir, 'ASSET_CREDITS.txt'), credits, 'utf8')
console.log('[render-assets] All required PBR room assets are ready.')
