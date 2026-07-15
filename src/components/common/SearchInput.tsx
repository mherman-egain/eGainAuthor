import type { InputHTMLAttributes } from 'react'
import styles from './SearchInput.module.css'

type Props = InputHTMLAttributes<HTMLInputElement>

export function SearchInput(props: Props) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden>
        ⌕
      </span>
      <input className={styles.input} type="search" {...props} />
    </div>
  )
}
