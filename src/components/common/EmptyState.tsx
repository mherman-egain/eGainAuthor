import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Props = {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}

export function EmptyState({ icon = '◇', title, body, action }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon} aria-hidden>
        {icon}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action}
    </div>
  )
}
