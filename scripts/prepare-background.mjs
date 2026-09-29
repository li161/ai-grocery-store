import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'public/store-bg.b64')
const target = resolve(root, 'public/store-bg.webp')

const encoded = (await readFile(source, 'utf8')).trim()
await writeFile(target, Buffer.from(encoded, 'base64'))
console.log('[assets] prepared public/store-bg.webp')
