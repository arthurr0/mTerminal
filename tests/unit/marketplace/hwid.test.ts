import { describe, it, expect, beforeEach } from 'vitest'
import {
  getClientId,
  getRawMachineId,
  hashMachineId,
  resetClientIdCacheForTests,
} from '../../../electron/main/marketplace/hwid'

beforeEach(() => {
  resetClientIdCacheForTests()
})

describe('marketplace hwid', () => {
  it('hashMachineId returns 32 lowercase hex chars', () => {
    const h = hashMachineId('abc123')
    expect(h).toMatch(/^[a-f0-9]{32}$/)
  })

  it('hashMachineId is deterministic and namespace-bound', () => {
    expect(hashMachineId('m1')).toBe(hashMachineId('m1'))
    expect(hashMachineId('m1')).not.toBe(hashMachineId('m2'))
  })

  it('getClientId returns a stable 32-hex string', async () => {
    const a = await getClientId({ platform: 'linux', readFile: (async () => 'fake-machine-id-1\n') as never })
    const b = await getClientId({ platform: 'linux', readFile: (async () => 'fake-machine-id-1\n') as never })
    expect(a).toMatch(/^[a-f0-9]{32}$/)
    expect(a).toBe(b)
  })

  it('different machine ids produce different client ids', async () => {
    const a = await getClientId({ platform: 'linux', readFile: (async () => 'machine-a') as never })
    const b = await getClientId({ platform: 'linux', readFile: (async () => 'machine-b') as never })
    expect(a).not.toBe(b)
  })

  it('falls back when machine-id files are unreadable', async () => {
    const id = await getRawMachineId({
      platform: 'linux',
      readFile: (async () => {
        throw new Error('enoent')
      }) as never,
      hostname: () => 'box',
      username: () => 'tester',
    })
    expect(id).toBe('box|tester|fallback')
    const hashed = hashMachineId(id)
    expect(hashed).toMatch(/^[a-f0-9]{32}$/)
  })

  it('darwin reads ioreg output', async () => {
    const exec = (async () => ({
      stdout: '          "IOPlatformUUID" = "ABCDEF12-3456-7890-ABCD-EF1234567890"\n',
      stderr: '',
    })) as never
    const id = await getRawMachineId({ platform: 'darwin', execFile: exec })
    expect(id).toBe('ABCDEF12-3456-7890-ABCD-EF1234567890')
  })

  it('win32 reads registry output', async () => {
    const exec = (async () => ({
      stdout: '\n    MachineGuid    REG_SZ    00112233-4455-6677-8899-aabbccddeeff\n',
      stderr: '',
    })) as never
    const id = await getRawMachineId({ platform: 'win32', execFile: exec })
    expect(id).toBe('00112233-4455-6677-8899-aabbccddeeff')
  })

  it('two no-deps calls return the same value (process-wide cache)', async () => {
    const a = await getClientId()
    const b = await getClientId()
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{32}$/)
  })
})
