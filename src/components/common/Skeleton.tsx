import styles from './Skeleton.module.css'

export function SkeletonLine({ width = '100%' }: { width?: string | number }) {
  return <div className={styles.line} style={{ width }} />
}

export function SkeletonBlock({ height = 40 }: { height?: number }) {
  return <div className={styles.block} style={{ height }} />
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem', padding: '0.75rem' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={`${70 + ((i * 13) % 30)}%`} />
      ))}
    </div>
  )
}
