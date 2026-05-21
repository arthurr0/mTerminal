import { useEffect, useState, type ReactElement } from 'react'
import { getRendererHost } from '../host-renderer'

function buildIconUrl(extId: string, iconPath: string): string {
  const clean = iconPath.replace(/^\.?\/+/, '')
  return `mt-ext://${extId}/${clean}`
}

function resolveIconUrl(extId: string): string | null {
  const snap = getRendererHost()
    .list()
    .find((s) => s.manifest.id === extId)
  return snap?.manifest.icon ? buildIconUrl(extId, snap.manifest.icon) : null
}

interface ExtensionIconProps {
  extId: string
  size?: number
  title?: string
  className?: string
}

export function ExtensionIcon({
  extId,
  size = 16,
  title,
  className,
}: ExtensionIconProps): ReactElement | null {
  const [iconUrl, setIconUrl] = useState<string | null>(() => resolveIconUrl(extId))

  useEffect(() => {
    const host = getRendererHost()
    const refresh = (): void => setIconUrl(resolveIconUrl(extId))
    refresh()
    return host.subscribe(refresh)
  }, [extId])

  if (!iconUrl) return null

  const mask = `url("${iconUrl}") center / contain no-repeat`
  return (
    <span
      className={className}
      title={title}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMask: mask,
        mask,
      }}
    />
  )
}
