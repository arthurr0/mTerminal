type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

export const ipcMain = {
  handle(channel: string, handler: Handler): void {
    handlers.set(channel, handler)
  },
  removeHandler(channel: string): void {
    handlers.delete(channel)
  },
}

export function __invoke(channel: string, ...args: unknown[]): unknown {
  const h = handlers.get(channel)
  if (!h) throw new Error(`no handler for ${channel}`)
  return h({}, ...args)
}

export function __reset(): void {
  handlers.clear()
}

export const BrowserWindow = {
  getAllWindows(): unknown[] {
    return []
  },
}
export type BrowserWindow = typeof BrowserWindow

export const app = {
  getPath: () => '/tmp',
  on: () => {},
}

let clipboardText = ''
let clipboardImagePng: Buffer | null = null
export const clipboard = {
  readText: () => clipboardText,
  writeText: (text: string) => {
    clipboardText = text
  },
  readImage: () => ({
    isEmpty: () => clipboardImagePng == null,
    toPNG: () => clipboardImagePng ?? Buffer.alloc(0),
  }),
  __setImage: (png: Buffer | null) => {
    clipboardImagePng = png
  },
}

export default { ipcMain, app, BrowserWindow, clipboard }
