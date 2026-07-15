import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import type { ArticleStatus } from '@/types'

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = parseISO(value)
  if (!isValid(d)) return value
  return format(d, 'MMM d, yyyy h:mm a')
}

export function formatRelative(value?: string | null): string {
  if (!value) return '—'
  const d = parseISO(value)
  if (!isValid(d)) return value
  return formatDistanceToNow(d, { addSuffix: true })
}

export function statusLabel(status: ArticleStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'live':
      return 'Live'
    case 'pending':
      return 'Pending'
    case 'retired':
      return 'Retired'
    default:
      return 'Unknown'
  }
}

export function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }
  return url
}
