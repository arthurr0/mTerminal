import type { AiEvent } from './types'

export interface DeltaBatcher {
  emit(e: AiEvent): void
  flush(): void
}

export function createDeltaBatcher(
  send: (e: AiEvent) => void,
  delayMs = 30
): DeltaBatcher {
  let pendingId: string | null = null
  let pendingText = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pendingId !== null && pendingText.length > 0) {
      send({ id: pendingId, kind: 'delta', value: pendingText })
    }
    pendingId = null
    pendingText = ''
  }

  const emit = (e: AiEvent): void => {
    if (e.kind === 'delta') {
      if (pendingId !== null && pendingId !== e.id) flush()
      pendingId = e.id
      pendingText += e.value
      if (!timer) timer = setTimeout(flush, delayMs)
      return
    }
    flush()
    send(e)
  }

  return { emit, flush }
}
