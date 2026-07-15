import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'
import styles from './Modal.module.css'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  /** Wider dialog for forms like article properties. */
  size?: 'default' | 'lg'
}

export function Modal({ open, title, children, onClose, footer, size = 'default' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.dialog} ${size === 'lg' ? styles.dialogLg : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" icon aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className={`${styles.body} ${size === 'lg' ? styles.bodyScroll : ''}`}>
          {children}
        </div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  )
}

type ConfirmProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--eg-ink-secondary)', lineHeight: 1.5 }}>
        {message}
      </p>
    </Modal>
  )
}
