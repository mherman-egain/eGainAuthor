import { useToastStore } from '@/store/toastStore'
import { Button } from './Button'
import styles from './Toast.module.css'
import clsx from 'clsx'

export function ToastStack() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            styles.toast,
            t.type === 'success' && styles.success,
            t.type === 'error' && styles.error,
            t.type === 'info' && styles.info,
          )}
          role="status"
        >
          <div className={styles.message}>{t.message}</div>
          <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ✕
          </Button>
        </div>
      ))}
    </div>
  )
}
