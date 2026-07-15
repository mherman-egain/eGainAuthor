import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import styles from './ContextMenu.module.css'

export type ContextMenuItem =
  | { type: 'separator'; id: string }
  | {
      type?: 'item'
      id: string
      label: string
      disabled?: boolean
      danger?: boolean
      onSelect: () => void
    }

export type ContextMenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
}

type Props = {
  menu: ContextMenuState | null
  onClose: () => void
}

export function ContextMenu({ menu, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 8
    let x = menu.x
    let y = menu.y
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    setPos({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item) => {
        if (item.type === 'separator') {
          return <div key={item.id} className={styles.separator} role="separator" />
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={clsx(styles.item, item.danger && styles.danger)}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
