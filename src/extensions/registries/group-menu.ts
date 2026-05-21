/**
 * Extension-contributed items for the sidebar workspace-group right-click menu.
 *
 * Plugins call `ctx.workspace.registerGroupMenuProvider((group) => items)`.
 * On every group context-menu open, the host invokes each provider with the
 * target group and merges their returned items into the menu.
 */

import type { Disposable } from '../ctx-types'

export type GroupMenuItemSpec =
  | {
      kind: 'item'
      label: string
      onSelect(): void
      danger?: boolean
      disabled?: boolean
    }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: GroupMenuItemSpec[] }
  | {
      kind: 'custom'
      label: string
      render(host: HTMLElement): void | (() => void)
    }

export interface GroupContext {
  id: string
  label: string
}

export type GroupMenuProvider = (group: GroupContext) => GroupMenuItemSpec[]

interface ProviderEntry {
  provider: GroupMenuProvider
  source: string
}

type Listener = () => void

export class GroupMenuRegistry {
  private providers: ProviderEntry[] = []
  private listeners = new Set<Listener>()

  register(provider: GroupMenuProvider, source: string): Disposable {
    const entry: ProviderEntry = { provider, source }
    this.providers.push(entry)
    this.fire()
    return {
      dispose: () => {
        const i = this.providers.indexOf(entry)
        if (i >= 0) {
          this.providers.splice(i, 1)
          this.fire()
        }
      },
    }
  }

  removeBySource(source: string): void {
    const before = this.providers.length
    this.providers = this.providers.filter((p) => p.source !== source)
    if (this.providers.length !== before) this.fire()
  }

  collect(group: GroupContext): GroupMenuItemSpec[] {
    const out: GroupMenuItemSpec[] = []
    for (const p of this.providers) {
      try {
        const items = p.provider(group)
        if (Array.isArray(items)) {
          for (const item of items) out.push(item)
        }
      } catch (err) {
        console.error('[group-menu provider]', err)
      }
    }
    return out
  }

  subscribe(cb: Listener): Disposable {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  private fire(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }
}

let instance: GroupMenuRegistry | null = null

export function getGroupMenuRegistry(): GroupMenuRegistry {
  if (!instance) instance = new GroupMenuRegistry()
  return instance
}
