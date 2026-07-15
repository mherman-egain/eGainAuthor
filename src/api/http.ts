import { ApiError, isSessionExpiredError, type ApiErrorBody } from '@/types'

const DEFAULT_LANGUAGE = 'en-us'

export type RequestAuth = {
  serverUrl: string
  sessionId?: string
  accessToken?: string
  /** Required for Get Folder by department. */
  departmentId?: string
  /** KB / Accept-Language code (default en-us). */
  language?: string
  demoMode?: boolean
}

type SessionExpiredHandler = (message: string) => void
let sessionExpiredHandler: SessionExpiredHandler | null = null
let sessionExpiredNotified = false

/** Register once from the session store to clear local auth on expiry. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler
  sessionExpiredNotified = false
}

export function resetSessionExpiredGuard() {
  sessionExpiredNotified = false
}

function notifySessionExpired(message: string) {
  if (sessionExpiredNotified) return
  sessionExpiredNotified = true
  try {
    sessionExpiredHandler?.(message)
  } catch {
    // ignore handler failures
  }
}

/**
 * Knowledge Authoring / session APIs: always use v20 (docs may still list v12).
 * OAuth client endpoints documented as v19 must keep version "v19".
 * Override authoring version via VITE_API_VERSION if needed.
 */
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v20'
/** Typical eGain context root seen in Location/href examples. */
const CONTEXT_ROOT = (import.meta.env.VITE_CONTEXT_ROOT as string) || 'system'

export function apiVersion(): string {
  return API_VERSION
}

export function contextRoot(): string {
  return CONTEXT_ROOT.replace(/^\/+|\/+$/g, '')
}

export function defaultLanguage(): string {
  return DEFAULT_LANGUAGE
}

/** Normalize language for Accept-Language (default en-us). */
export function acceptLanguage(language?: string): string {
  const lang = (language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE
  return lang
}

/** Docs often show /ws/v12/... — rewrite those segments to the active version (v20). Never rewrite v19. */
export function normalizeWsVersion(path: string): string {
  return path.replace(/\/ws\/v12(\/|$)/g, `/ws/${API_VERSION}$1`)
}

/** Build proxied path: /api-proxy/system/ws/v20/... */
export function wsPath(resourcePath: string, version = API_VERSION): string {
  const clean = resourcePath.replace(/^\//, '')
  const ctx = contextRoot()
  return `/api-proxy/${ctx}/ws/${version}/${clean}`
}

/** Proxy an absolute /ws/... path; v12 is rewritten to v20; context root inserted if missing. */
export function proxyWs(absoluteWsPath: string): string {
  let clean = absoluteWsPath.startsWith('/')
    ? absoluteWsPath
    : `/${absoluteWsPath}`
  clean = normalizeWsVersion(clean)
  if (clean.startsWith('/ws/')) {
    clean = `/${contextRoot()}${clean}`
  }
  return `/api-proxy${clean}`
}

/**
 * Resolve a browser fetch URL for authoring API calls.
 *
 * Paths are always generated as `/api-proxy/...` (same as local Vite).
 * - Dev / preview: Vite middleware handles `/api-proxy`.
 * - Production (S3/CloudFront): there is no proxy unless configured.
 *
 * Override with:
 * - `VITE_API_PROXY_BASE` → absolute proxy host prefix (e.g. https://api.example.com)
 * - `VITE_API_DIRECT=true` → call the tenant `serverUrl` directly (needs CORS)
 *
 * Deployed S3 builds default to direct mode when neither env is set.
 */
export function resolveApiUrl(path: string, serverUrl?: string): string {
  if (/^https?:\/\//i.test(path)) return path

  const proxyBase = (import.meta.env.VITE_API_PROXY_BASE as string | undefined)?.replace(
    /\/+$/,
    '',
  )
  if (proxyBase) {
    const suffix = path.startsWith('/') ? path : `/${path}`
    return `${proxyBase}${suffix}`
  }

  const directFlag = import.meta.env.VITE_API_DIRECT
  const useDirect =
    directFlag === 'true' ||
    (import.meta.env.PROD && directFlag !== 'false' && !proxyBase)

  if (useDirect && serverUrl) {
    const origin = serverUrl.replace(/\/+$/, '')
    const suffix = path.replace(/^\/api-proxy/, '')
    return `${origin}${suffix.startsWith('/') ? suffix : `/${suffix}`}`
  }

  return path
}

/**
 * All authoring API calls send:
 * - Accept: application/json
 * - Content-Type: application/json (unless skipJsonContentType for OAuth form posts)
 * - Accept-Language: current language (default en-us)
 * - X-egain-session: when a session exists
 */
export async function apiRequest<T = unknown>(
  auth: RequestAuth,
  path: string,
  options: RequestInit & { raw?: boolean; skipJsonContentType?: boolean } = {},
): Promise<T> {
  const { raw, skipJsonContentType, ...init } = options
  const headers = new Headers(init.headers)
  const method = (init.method || 'GET').toUpperCase()
  const url = resolveApiUrl(path, auth.serverUrl)

  headers.set('Accept', 'application/json')
  headers.set('Accept-Language', acceptLanguage(auth.language))

  if (!skipJsonContentType) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth.sessionId) {
    headers.set('X-egain-session', auth.sessionId)
  }

  if (auth.accessToken) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  // Only needed when going through a reverse proxy that picks the tenant.
  if (auth.serverUrl && url.includes('/api-proxy')) {
    headers.set('X-Target-Server', auth.serverUrl)
  }

  const response = await fetch(url, {
    ...init,
    method,
    headers,
  })

  if (raw) {
    return response as unknown as T
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (import.meta.env.DEV && !response.ok) {
    console.warn(
      `[apiRequest] ${method} ${url} → ${response.status}`,
      typeof data === 'object' && data
        ? Object.keys(data as object).slice(0, 8)
        : typeof data,
    )
  }

  if (!response.ok) {
    const body = (typeof data === 'object' && data !== null
      ? data
      : { message: String(data || response.statusText) }) as ApiErrorBody
    const nested = data as {
      error?: { message?: string; developerMessage?: string }
      developerMessage?: string
      Error?: { message?: string }
    }
    const top = data as {
      message?: string
      developerMessage?: string
      code?: string
    }
    let message =
      top?.developerMessage ||
      body.message ||
      nested?.error?.developerMessage ||
      nested?.error?.message ||
      nested?.developerMessage ||
      nested?.Error?.message ||
      (top?.code ? `${top.code}` : '') ||
      (typeof data === 'string' ? data : '') ||
      `Request failed (${response.status})`

    // CloudFront S3 distributions return HTML 403 for POST — make that readable.
    if (
      typeof message === 'string' &&
      (message.includes('cloudfront') ||
        message.includes('ERROR: The request could not be satisfied') ||
        message.includes('<!DOCTYPE'))
    ) {
      message =
        'API proxy is not available on this host (CloudFront/S3 only serves static files). ' +
        'Use Demo Mode, enable direct tenant calls (VITE_API_DIRECT), or configure an /api-proxy origin.'
    }

    const xmlMsg = /<message>([^<]+)<\/message>/i.exec(String(message))
    if (xmlMsg) message = xmlMsg[1]

    const err = new ApiError(response.status, message, body)
    if (isSessionExpiredError(err)) {
      err.sessionExpired = true
      // Logout endpoints may also report expiry — still clear local auth
      notifySessionExpired(message)
    }
    throw err
  }

  return data as T
}

/** Extract X-egain-session from a Response (login). */
export function extractSessionId(response: Response): string | null {
  return (
    response.headers.get('X-egain-session') ||
    response.headers.get('x-egain-session')
  )
}
