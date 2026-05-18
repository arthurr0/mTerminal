import fs from 'node:fs/promises'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const NAMESPACE = 'mterminal-marketplace'

export interface HwidDeps {
  platform?: NodeJS.Platform
  readFile?: typeof fs.readFile
  execFile?: typeof execFileP
  hostname?: () => string
  username?: () => string
}

async function readLinux(readFile: typeof fs.readFile): Promise<string | null> {
  for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const raw = (await readFile(p, 'utf-8')).toString().trim()
      if (raw) return raw
    } catch {}
  }
  return null
}

async function readDarwin(exec: typeof execFileP): Promise<string | null> {
  try {
    const { stdout } = await exec('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
    const m = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

async function readWin32(exec: typeof execFileP): Promise<string | null> {
  try {
    const { stdout } = await exec('reg', [
      'query',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ])
    const m = stdout.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

export async function getRawMachineId(deps: HwidDeps = {}): Promise<string> {
  const platform = deps.platform ?? process.platform
  const readFile = deps.readFile ?? fs.readFile
  const exec = deps.execFile ?? execFileP
  let id: string | null = null
  if (platform === 'linux') id = await readLinux(readFile)
  else if (platform === 'darwin') id = await readDarwin(exec)
  else if (platform === 'win32') id = await readWin32(exec)
  if (!id) {
    const host = deps.hostname ? deps.hostname() : os.hostname()
    const user = deps.username ? deps.username() : os.userInfo().username
    id = `${host}|${user}|fallback`
  }
  return id
}

export function hashMachineId(rawId: string): string {
  return createHash('sha256').update(`${rawId}|${NAMESPACE}`).digest('hex').slice(0, 32)
}

let cached: Promise<string> | null = null

export async function getClientId(deps?: HwidDeps): Promise<string> {
  if (!deps && cached) return cached
  const compute = (async () => hashMachineId(await getRawMachineId(deps)))()
  if (!deps) cached = compute
  return compute
}

export function resetClientIdCacheForTests(): void {
  cached = null
}
