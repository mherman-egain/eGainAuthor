/** Safe in-app return paths for post-login redirect. */

/** When set, unauthenticated redirects go to /login with no `next` (manual logout). */
let suppressReturnPath = false

export function beginSuppressReturnPath(): void {
  suppressReturnPath = true
}

export function endSuppressReturnPath(): void {
  suppressReturnPath = false
}

export function isReturnPathSuppressed(): boolean {
  return suppressReturnPath
}

/** Login URL for an unauthenticated redirect from the current location. */
export function loginRedirectForLocation(returnPath: string): string {
  if (suppressReturnPath) return '/login'
  return loginPathWithReturn(returnPath)
}

export function sanitizeReturnPath(raw: string | null | undefined): string {
  if (!raw) return '/'
  let path = raw.trim()
  try {
    path = decodeURIComponent(path)
  } catch {
    // keep path as-is
  }
  if (path.startsWith('http://') || path.startsWith('https://')) return '/'
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')) {
    return '/'
  }
  return path
}

/** Build /login, preserving a deep-link return destination when useful. */
export function loginPathWithReturn(returnPath: string): string {
  const safe = sanitizeReturnPath(returnPath)
  if (safe === '/') return '/login'
  return `/login?next=${encodeURIComponent(safe)}`
}

export function returnPathFromSearch(search: string): string {
  const q = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(q)
  return sanitizeReturnPath(params.get('next'))
}
