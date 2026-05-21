import { app, clipboard, ipcMain } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

let testDir: string | null = null

export function setClipboardDirForTests(dir: string | null): void {
  testDir = dir
}

export function clipboardImagesDir(): string {
  let base: string
  if (testDir) {
    base = testDir
  } else {
    try {
      base = path.join(app.getPath('temp'), 'mterminal-clipboard')
    } catch {
      base = path.join(os.tmpdir(), 'mterminal-clipboard')
    }
  }
  fs.mkdirSync(base, { recursive: true })
  return base
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/bmp':
      return 'bmp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

export function clipboardImageFilename(mime: string, now: number = Date.now()): string {
  return `clipboard-${now}.${extForMime(mime)}`
}

export function cleanupOldClipboardImages(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  let dir: string
  try {
    dir = clipboardImagesDir()
  } catch {
    return
  }
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  const cutoff = Date.now() - maxAgeMs
  for (const name of entries) {
    const p = path.join(dir, name)
    try {
      const st = fs.statSync(p)
      if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}

function writeImageBytes(bytes: Uint8Array, mime: string): string {
  const dir = clipboardImagesDir()
  const file = path.join(dir, clipboardImageFilename(mime))
  const tmp = file + '.tmp'
  const buf = Buffer.from(bytes)
  const fd = fs.openSync(tmp, 'w', 0o600)
  try {
    fs.writeSync(fd, buf)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
  return file
}

export function readClipboardImage(): string | null {
  const img = clipboard.readImage()
  if (!img || img.isEmpty()) return null
  const png = img.toPNG()
  if (!png || png.length === 0) return null
  return writeImageBytes(png, 'image/png')
}

export function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''))
  })
  ipcMain.handle('clipboard:read-image', () => readClipboardImage())
  ipcMain.handle('clipboard:save-image', (_e, bytes: Uint8Array, mime: string) =>
    writeImageBytes(bytes, typeof mime === 'string' ? mime : 'image/png'),
  )
}
