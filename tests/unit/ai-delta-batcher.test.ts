import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDeltaBatcher } from '../../electron/main/ai/delta-batcher'
import type { AiEvent } from '../../electron/main/ai/types'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createDeltaBatcher', () => {
  it('coalesces consecutive deltas into one send', () => {
    const sent: AiEvent[] = []
    const b = createDeltaBatcher((e) => sent.push(e), 30)
    b.emit({ id: 'a', kind: 'delta', value: 'He' })
    b.emit({ id: 'a', kind: 'delta', value: 'llo' })
    expect(sent).toHaveLength(0)
    vi.advanceTimersByTime(30)
    expect(sent).toEqual([{ id: 'a', kind: 'delta', value: 'Hello' }])
  })

  it('flushes pending deltas before a non-delta event, preserving order', () => {
    const sent: AiEvent[] = []
    const b = createDeltaBatcher((e) => sent.push(e), 30)
    b.emit({ id: 'a', kind: 'delta', value: 'hi' })
    b.emit({ id: 'a', kind: 'done', value: { inTokens: 1, outTokens: 2, costUsd: 0 } })
    expect(sent).toEqual([
      { id: 'a', kind: 'delta', value: 'hi' },
      { id: 'a', kind: 'done', value: { inTokens: 1, outTokens: 2, costUsd: 0 } },
    ])
  })

  it('flushes the previous stream when the id changes', () => {
    const sent: AiEvent[] = []
    const b = createDeltaBatcher((e) => sent.push(e), 30)
    b.emit({ id: 'a', kind: 'delta', value: 'x' })
    b.emit({ id: 'b', kind: 'delta', value: 'y' })
    expect(sent).toEqual([{ id: 'a', kind: 'delta', value: 'x' }])
    b.flush()
    expect(sent).toEqual([
      { id: 'a', kind: 'delta', value: 'x' },
      { id: 'b', kind: 'delta', value: 'y' },
    ])
  })

  it('flush() emits nothing when there is no buffered text', () => {
    const sent: AiEvent[] = []
    const b = createDeltaBatcher((e) => sent.push(e), 30)
    b.flush()
    expect(sent).toHaveLength(0)
  })
})
