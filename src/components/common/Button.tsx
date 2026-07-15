import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: boolean
  children: ReactNode
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={clsx(
        styles.btn,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        size === 'sm' && styles.sm,
        icon && styles.icon,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
