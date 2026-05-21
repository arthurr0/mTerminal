import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { __invoke, __reset, clipboard } from '../mocks/electron'
import {
  registerClipboardHandlers,
  setClipboardDirForTests,
  extForMime,
  clipboardImageFilename,
  cleanupOldClipboardImages,
} from '../../electron/main/clipboard'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-clipboard-'))
  setClipboardDirForTests(tmpDir)
  __reset()
  registerClipboardHandlers()
})

afterEach(() => {
  setClipboardDirForTests(null)
  ;(clipboard as unknown as { __setImage: (b: Buffer | null) => void }).__setImage(null)
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

function setClipboardImage(png: Buffer | null): void {
  ;(clipboard as unknown as { __setImage: (b: Buffer | null) => void }).__setImage(png)
}

describe('extForMime', () => {
  it('maps known mime types', () => {
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('image/gif')).toBe('gif')
    expect(extForMime('image/webp')).toBe('webp')
  })

  it('falls back to png for unknown', () => {
    expect(extForMime('application/octet-stream')).toBe('png')
    expect(extForMime('')).toBe('png')
  })
})

describe('clipboardImageFilename', () => {
  it('uses timestamp and extension', () => {
    expect(clipboardImageFilename('image/jpeg', 1234)).toBe('clipboard-1234.jpg')
    expect(clipboardImageFilename('image/png', 99)).toBe('clipboard-99.png')
  })
})

describe('clipboard:save-image', () => {
  it('writes bytes to a file and returns its path', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const p = (await __invoke('clipboard:save-image', bytes, 'image/png')) as string
    expect(path.dirname(p)).toBe(tmpDir)
    expect(p.endsWith('.png')).toBe(true)
    expect(fs.existsSync(p)).toBe(true)
    expect(new Uint8Array(fs.readFileSync(p))).toEqual(bytes)
  })

  it('respects the mime extension', async () => {
    const p = (await __invoke('clipboard:save-image', new Uint8Array([0]), 'image/jpeg')) as string
    expect(p.endsWith('.jpg')).toBe(true)
  })

  it('defaults to png for a non-string mime', async () => {
    const p = (await __invoke('clipboard:save-image', new Uint8Array([0]), undefined)) as string
    expect(p.endsWith('.png')).toBe(true)
  })
})

describe('clipboard:read-image', () => {
  it('returns null when the clipboard has no image', async () => {
    setClipboardImage(null)
    const p = await __invoke('clipboard:read-image')
    expect(p).toBeNull()
  })

  it('saves the native clipboard image as png and returns its path', async () => {
    const png = Buffer.from([137, 80, 78, 71, 1, 2, 3])
    setClipboardImage(png)
    const p = (await __invoke('clipboard:read-image')) as string
    expect(path.dirname(p)).toBe(tmpDir)
    expect(p.endsWith('.png')).toBe(true)
    expect(fs.existsSync(p)).toBe(true)
    expect(new Uint8Array(fs.readFileSync(p))).toEqual(new Uint8Array(png))
  })

  it('returns null for an empty png buffer', async () => {
    setClipboardImage(Buffer.alloc(0))
    const p = await __invoke('clipboard:read-image')
    expect(p).toBeNull()
  })
})

describe('cleanupOldClipboardImages', () => {
  it('removes files older than the cutoff and keeps fresh ones', () => {
    const oldFile = path.join(tmpDir, 'clipboard-old.png')
    const freshFile = path.join(tmpDir, 'clipboard-fresh.png')
    fs.writeFileSync(oldFile, 'x')
    fs.writeFileSync(freshFile, 'y')
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000)
    fs.utimesSync(oldFile, oldTime, oldTime)

    cleanupOldClipboardImages(24 * 60 * 60 * 1000)

    expect(fs.existsSync(oldFile)).toBe(false)
    expect(fs.existsSync(freshFile)).toBe(true)
  })
})
