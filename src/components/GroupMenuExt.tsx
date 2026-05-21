import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MenuItem } from './ContextMenu'
import type { GroupMenuItemSpec } from '../extensions/registries/group-menu'

/**
 * Renders a `custom` group-menu item: mounts the extension-provided `render`
 * callback inside a host element when the submenu opens, and runs the
 * optional cleanup when it unmounts.
 */
function CustomMount({
  render,
}: {
  render: (host: HTMLElement) => void | (() => void)
}): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    let cleanup: void | (() => void)
    try {
      cleanup = render(ref.current)
    } catch (err) {
      console.error('[group-menu custom render]', err)
    }
    return () => {
      if (typeof cleanup === 'function') {
        try {
          cleanup()
        } catch {
          /* ignore */
        }
      }
    }
  }, [render])
  return <div ref={ref} className="ctx-custom-mount" />
}

/**
 * Renders an inline nested menu inside `.ctx-submenu`. Same look as the
 * parent menu, but mouse hover does not open further nested levels — for
 * deeper layouts, use `kind: 'custom'`.
 */
function NestedMenu({
  items,
  onClose,
}: {
  items: GroupMenuItemSpec[]
  onClose: () => void
}): ReactNode {
  const [openSub, setOpenSub] = useState<number | null>(null)
  return (
    <div className="ctx-nested">
      {items.map((it, i) => {
        if (it.kind === 'separator') {
          return <div key={`sep-${i}`} className="ctx-sep" role="separator" />
        }
        if (it.kind === 'item') {
          return (
            <button
              key={i}
              className={`ctx-item ${it.danger ? 'danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                it.onSelect()
                onClose()
              }}
              role="menuitem"
            >
              <span className="ctx-item-label">{it.label}</span>
            </button>
          )
        }
        if (it.kind === 'submenu') {
          return (
            <div
              key={i}
              className="ctx-nested-submenu"
              onMouseEnter={() => setOpenSub(i)}
            >
              <button
                className={`ctx-item has-submenu ${openSub === i ? 'open' : ''}`}
                role="menuitem"
                onClick={() => setOpenSub((c) => (c === i ? null : i))}
              >
                <span className="ctx-item-label">{it.label}</span>
                <span className="ctx-item-arrow" aria-hidden>
                  ›
                </span>
              </button>
              {openSub === i && (
                <div className="ctx-nested-pop">
                  <NestedMenu items={it.items} onClose={onClose} />
                </div>
              )}
            </div>
          )
        }
        if (it.kind === 'custom') {
          return (
            <div key={i} className="ctx-custom-row">
              <CustomMount render={it.render} />
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

export function mapGroupItemsToMenu(
  items: GroupMenuItemSpec[],
  onClose: () => void,
): MenuItem[] {
  const out: MenuItem[] = []
  for (const it of items) {
    if (it.kind === 'separator') {
      out.push({ label: '', onSelect: () => {}, separator: true })
      continue
    }
    if (it.kind === 'item') {
      out.push({
        label: it.label,
        onSelect: () => {
          if (it.disabled) return
          it.onSelect()
        },
        danger: it.danger,
      })
      continue
    }
    if (it.kind === 'submenu') {
      out.push({
        label: it.label,
        submenu: <NestedMenu items={it.items} onClose={onClose} />,
      })
      continue
    }
    if (it.kind === 'custom') {
      out.push({
        label: it.label,
        submenu: <CustomMount render={it.render} />,
      })
      continue
    }
  }
  return out
}
