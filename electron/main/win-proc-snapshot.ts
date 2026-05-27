import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export interface WinProcEntry {
  pid: number
  ppid: number
  name: string
  exePath: string | null
}

export type WinProcMap = Map<number, WinProcEntry>

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

export function parseWinProcCsv(stdout: string): WinProcMap {
  const map: WinProcMap = new Map()
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return map

  let headerIdx = lines.findIndex(
    (l) => /processid/i.test(l) && /parentprocessid/i.test(l)
  )
  if (headerIdx < 0) headerIdx = 0
  const header = splitCsvLine(lines[headerIdx]!).map((h) => h.trim().toLowerCase())
  const iPid = header.indexOf('processid')
  const iPpid = header.indexOf('parentprocessid')
  const iName = header.indexOf('name')
  const iExe = header.indexOf('executablepath')
  if (iPid < 0 || iPpid < 0) return map

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]!)
    const pid = Number(f[iPid])
    if (!Number.isFinite(pid)) continue
    const ppid = Number(f[iPpid])
    const name = iName >= 0 ? (f[iName] ?? '').trim() : ''
    const exeRaw = iExe >= 0 ? (f[iExe] ?? '').trim() : ''
    map.set(pid, {
      pid,
      ppid: Number.isFinite(ppid) ? ppid : 0,
      name,
      exePath: exeRaw.length > 0 ? exeRaw : null,
    })
  }
  return map
}

export function descendantNodes(
  map: WinProcMap,
  rootPid: number
): Array<{ pid: number; ppid: number }> {
  const childrenByParent = new Map<number, number[]>()
  for (const e of map.values()) {
    const arr = childrenByParent.get(e.ppid)
    if (arr) arr.push(e.pid)
    else childrenByParent.set(e.ppid, [e.pid])
  }
  const out: Array<{ pid: number; ppid: number }> = []
  const seen = new Set<number>([rootPid])
  let frontier = [rootPid]
  let depth = 0
  while (frontier.length > 0 && depth < 64) {
    const next: number[] = []
    for (const parent of frontier) {
      const kids = childrenByParent.get(parent)
      if (!kids) continue
      for (const k of kids) {
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ pid: k, ppid: parent })
        next.push(k)
      }
    }
    frontier = next
    depth++
  }
  return out
}

const SNAPSHOT_TTL_MS = 1500
const MAX_BUFFER = 32 * 1024 * 1024

let cache: { expiresAt: number; promise: Promise<WinProcMap> } | null = null
let backend: 'cim' | 'wmic' | null = null

async function loadCim(): Promise<WinProcMap> {
  const script =
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Csv -NoTypeInformation'
  const { stdout } = await execFileP(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true }
  )
  const map = parseWinProcCsv(stdout)
  if (map.size === 0) throw new Error('empty CIM snapshot')
  return map
}

async function loadWmic(): Promise<WinProcMap> {
  const { stdout } = await execFileP(
    'wmic',
    [
      'process',
      'get',
      'Name,ParentProcessId,ProcessId,ExecutablePath',
      '/format:csv',
    ],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true }
  )
  return parseWinProcCsv(stdout)
}

async function loadSnapshot(): Promise<WinProcMap> {
  if (backend === 'cim') return loadCim()
  if (backend === 'wmic') return loadWmic()
  try {
    const map = await loadCim()
    backend = 'cim'
    return map
  } catch {
    const map = await loadWmic()
    backend = 'wmic'
    return map
  }
}

export function getWinProcSnapshot(): Promise<WinProcMap> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.promise
  const promise = loadSnapshot()
  cache = { expiresAt: now + SNAPSHOT_TTL_MS, promise }
  promise.catch(() => {
    cache = null
  })
  return promise
}

export function __resetWinProcSnapshotForTests(): void {
  cache = null
  backend = null
}
