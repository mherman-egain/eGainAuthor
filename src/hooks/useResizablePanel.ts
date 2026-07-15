import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { loadUiPrefs, saveUiPrefs, type UiPrefs } from '@/utils/storage'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

type PrefKey = keyof Pick<UiPrefs, 'folderWidth' | 'articleWidth'>

/**
 * Horizontal panel width with pointer-drag resize and localStorage persistence.
 */
export function useResizablePanel(
  prefKey: PrefKey,
  defaults: { initial: number; min: number; max: number },
) {
  const [width, setWidth] = useState(() => {
    const saved = loadUiPrefs()[prefKey]
    return typeof saved === 'number'
      ? clamp(saved, defaults.min, defaults.max)
      : defaults.initial
  })
  const widthRef = useRef(width)
  widthRef.current = width

  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { startX: e.clientX, startW: widthRef.current }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [],
  )

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const next = clamp(
        drag.startW + (e.clientX - drag.startX),
        defaults.min,
        defaults.max,
      )
      setWidth(next)
    },
    [defaults.max, defaults.min],
  )

  const onResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      saveUiPrefs({ [prefKey]: widthRef.current })
    },
    [prefKey],
  )

  return {
    width,
    resizeHandlers: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: onResizePointerUp,
      onPointerCancel: onResizePointerUp,
    },
  }
}
