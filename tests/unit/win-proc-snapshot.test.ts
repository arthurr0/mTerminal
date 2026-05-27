import { describe, it, expect } from 'vitest'
import {
  parseWinProcCsv,
  descendantNodes,
} from '../../electron/main/win-proc-snapshot'
import { parseDarwinPsComm } from '../../electron/main/agents/process-watcher'

describe('parseWinProcCsv', () => {
  it('parses PowerShell CIM ConvertTo-Csv output', () => {
    const stdout = [
      '"ProcessId","ParentProcessId","Name","ExecutablePath"',
      '"1000","4","explorer.exe","C:\\Windows\\explorer.exe"',
      '"1234","1000","powershell.exe","C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
      '"5678","1234","claude.exe",""',
    ].join('\r\n')
    const map = parseWinProcCsv(stdout)
    expect(map.size).toBe(3)
    expect(map.get(1234)).toEqual({
      pid: 1234,
      ppid: 1000,
      name: 'powershell.exe',
      exePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    })
    expect(map.get(5678)?.exePath).toBeNull()
  })

  it('parses wmic /format:csv output regardless of column order', () => {
    const stdout = [
      'Node,ExecutablePath,Name,ParentProcessId,ProcessId',
      'MACHINE,C:\\Windows\\explorer.exe,explorer.exe,4,1000',
      'MACHINE,,codex.exe,1000,2222',
    ].join('\r\n')
    const map = parseWinProcCsv(stdout)
    expect(map.size).toBe(2)
    expect(map.get(2222)).toEqual({
      pid: 2222,
      ppid: 1000,
      name: 'codex.exe',
      exePath: null,
    })
  })

  it('returns an empty map for unusable output', () => {
    expect(parseWinProcCsv('').size).toBe(0)
    expect(parseWinProcCsv('garbage\nlines').size).toBe(0)
  })
})

describe('descendantNodes', () => {
  it('walks the full descendant tree from a root pid', () => {
    const map = parseWinProcCsv(
      [
        '"ProcessId","ParentProcessId","Name","ExecutablePath"',
        '"100","1","shell.exe",""',
        '"200","100","node.exe",""',
        '"300","200","claude.exe",""',
        '"999","1","unrelated.exe",""',
      ].join('\n')
    )
    const nodes = descendantNodes(map, 100)
    const pids = nodes.map((n) => n.pid).sort((a, b) => a - b)
    expect(pids).toEqual([200, 300])
  })

  it('tolerates cycles without infinite looping', () => {
    const map = parseWinProcCsv(
      [
        '"ProcessId","ParentProcessId","Name","ExecutablePath"',
        '"10","20","a.exe",""',
        '"20","10","b.exe",""',
      ].join('\n')
    )
    const nodes = descendantNodes(map, 10)
    expect(nodes.map((n) => n.pid)).toEqual([20])
  })
})

describe('parseDarwinPsComm', () => {
  it('maps pid to basename of comm', () => {
    const stdout = [
      '  1234 /usr/local/bin/node',
      '  5678 claude',
      'badline',
    ].join('\n')
    const map = parseDarwinPsComm(stdout)
    expect(map.get(1234)).toBe('node')
    expect(map.get(5678)).toBe('claude')
    expect(map.size).toBe(2)
  })
})
