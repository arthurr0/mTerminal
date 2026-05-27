/**
 * Process-tree watcher that emits synthetic AgentEvents for AI CLI binaries
 * running inside a PTY tab.
 *
 * Why this exists: Claude Code has a rich hooks system (PreToolUse / Stop /
 * Notification / …) that fires on every lifecycle moment, so the bridge gets
 * a precise "thinking → done" trace for free. Codex has no equivalent — its
 * MCP integration only surfaces `initialize` and stdio-close, with nothing
 * in between unless the agent voluntarily calls our `notify_user` tool.
 *
 * To get a usable yellow/green dot for Codex (and as a fallback for Claude
 * if the user hasn't installed hooks yet) we poll `pidtree` for AI CLI
 * descendants and synthesize:
 *
 *    - process appears  → `session_start` event (ready → idle; only when no
 *      hook/MCP source is already live for the tab, so we never clobber it)
 *    - process disappears (with no replacement) → `done`
 *
 * The interval is intentionally low-frequency (2s) — we're catching launches
 * and exits, not per-tool transitions. The hooks-based path covers the fast
 * stuff for Claude.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import pidtree from 'pidtree'
import { agentBridge, type AgentEvent } from './bridge-server'
import { listSessionIds, sessionPid } from '../sessions'
import { isLive } from './status-tracker'
import { getWinProcSnapshot, descendantNodes } from '../win-proc-snapshot'

const execFileP = promisify(execFile)

const POLL_MS = 2000

type Agent = 'claude' | 'codex'

function classify(name: string): Agent | null {
  let n = name.trim().toLowerCase()
  if (n.endsWith('.exe')) n = n.slice(0, -4)
  if (n === 'claude' || n === 'claude-code' || n.startsWith('claude-')) return 'claude'
  if (n === 'codex' || n === 'codex-cli' || n.startsWith('codex-')) return 'codex'
  return null
}

export function parseDarwinPsComm(stdout: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const sp = line.indexOf(' ')
    if (sp < 0) continue
    const pid = Number(line.slice(0, sp))
    if (!Number.isFinite(pid)) continue
    const comm = line.slice(sp + 1).trim()
    const name = comm.split('/').pop() || comm
    if (name) map.set(pid, name)
  }
  return map
}

async function readCommandNames(pids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (pids.length === 0) return map
  if (process.platform === 'linux') {
    await Promise.all(
      pids.map(async (pid) => {
        try {
          const txt = await fs.readFile(`/proc/${pid}/comm`, 'utf8')
          const name = txt.replace(/\n+$/, '').trim()
          if (name) map.set(pid, name)
        } catch {
          /* gone */
        }
      })
    )
    return map
  }
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileP('ps', [
        '-o',
        'pid=,comm=',
        '-p',
        pids.join(','),
      ])
      return parseDarwinPsComm(stdout)
    } catch {
      return map
    }
  }
  return map
}

async function detectAgent(rootPid: number): Promise<Agent | null> {
  if (process.platform === 'win32') {
    let descendants: Array<{ pid: number }>
    try {
      const snapshot = await getWinProcSnapshot()
      descendants = descendantNodes(snapshot, rootPid)
      for (const node of descendants) {
        const name = snapshot.get(node.pid)?.name
        if (!name) continue
        const a = classify(name)
        if (a) return a
      }
    } catch {
      return null
    }
    return null
  }

  let descendants: number[] = []
  try {
    descendants = await pidtree(rootPid, { root: false })
  } catch {
    return null
  }
  if (descendants.length === 0) return null
  const names = await readCommandNames(descendants)
  for (const name of names.values()) {
    const a = classify(name)
    if (a) return a
  }
  return null
}

const lastSeen = new Map<number, Agent | null>()
let timer: NodeJS.Timeout | null = null

function emit(tabId: number, agent: Agent, event: AgentEvent['event']): void {
  agentBridge.emit('event', {
    tabId,
    agent,
    event,
    ts: Date.now(),
    source: 'watcher',
  } satisfies AgentEvent)
}

async function tick(): Promise<void> {
  for (const tabId of listSessionIds()) {
    const pid = sessionPid(tabId)
    if (pid == null) {
      lastSeen.delete(tabId)
      continue
    }
    if (isLive(tabId)) continue
    const agent = await detectAgent(pid)
    const prev = lastSeen.get(tabId) ?? null

    if (agent && !prev) {
      if (!isLive(tabId)) emit(tabId, agent, 'session_start')
    } else if (!agent && prev) {
      emit(tabId, prev, 'done')
    }

    if (agent) lastSeen.set(tabId, agent)
    else lastSeen.delete(tabId)
  }
}

export function startProcessWatcher(): void {
  if (timer) return
  timer = setInterval(() => {
    void tick().catch((err) => console.error('[agent-watcher] tick failed:', err))
  }, POLL_MS)
}

export function stopProcessWatcher(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  lastSeen.clear()
}
