import { ApiError, type ApiErrorBody } from '@/types'
import { apiRequest, contextRoot, apiVersion, type RequestAuth } from './http'

/**
 * Composite Request API — POST /ws/v20/composite
 * Docs: https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/d1/de5/class_composite_request_page.html
 *
 * ## How it works
 * - One HTTP call runs many nested REST calls **serially** (same X-egain-session).
 * - Nested `url` must be an **absolute** tenant URL (host + /system/ws/v20/…).
 * - Outer status is typically **201** even when some nested calls fail — always
 *   inspect each `resultObject[].httpStatus`.
 * - Execution **continues after nested errors** (no abort-on-first-failure).
 * - Do not send Accept-Encoding (docs: compression unsupported).
 *
 * ## When to use
 * Prefer composite when you need **many round-trips to different endpoints**
 * (or the same endpoint that does **not** take comma-separated IDs), e.g.:
 * - paste/copy N articles (`POST …/article/copy` is one-id-only)
 * - mixed fan-out: create folder + create articles, etc.
 *
 * Prefer a **native multi-ID API** when it exists — lower overhead, one
 * server operation — e.g. `POST …/article/{ids}/move`, `DELETE …/article/{ids}`.
 *
 * Do **not** use composite when request B’s body depends on response A
 * (stamp → edit) unless A’s result is already known; nested bodies are fixed
 * when the composite is submitted.
 */

export type CompositeNestedRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS'
  /** Absolute URL including query string. */
  url: string
  /** JSON/XML body as a string (POST/PUT). */
  requestBodyText?: string
}

export type CompositeNestedResult = {
  httpStatus: number
  /** Nested payload (`any` in the CompositeResult schema). */
  body: unknown
  ok: boolean
}

/** Soft limit to keep composite payloads bounded. */
export const COMPOSITE_CHUNK_SIZE = 25

/**
 * Build an absolute Authoring WS URL for a nested composite request.
 * `resourcePath` example: `kb/article/copy?$attribute=all&$lang=en-us`
 */
export function absoluteCompositeUrl(
  auth: RequestAuth,
  resourcePath: string,
): string {
  const base = (auth.serverUrl || '').replace(/\/+$/, '')
  if (!base) {
    throw new Error('Composite requests require auth.serverUrl (tenant host).')
  }
  const clean = resourcePath.replace(/^\//, '')
  const ctx = contextRoot()
  const version = apiVersion()
  const path = clean.startsWith(`${ctx}/ws/`)
    ? `/${clean}`
    : clean.startsWith('ws/')
      ? `/${ctx}/${clean}`
      : `/${ctx}/ws/${version}/${clean}`
  return `${base}${path}`
}

export async function executeComposite(
  auth: RequestAuth,
  requests: CompositeNestedRequest[],
): Promise<CompositeNestedResult[]> {
  if (requests.length === 0) return []

  const data = await apiRequest<unknown>(auth, absoluteCompositeProxyPath(), {
    method: 'POST',
    body: JSON.stringify({ request: requests }),
  })

  return parseCompositeResult(data)
}

/** Proxied path for the composite endpoint itself. */
function absoluteCompositeProxyPath(): string {
  const ctx = contextRoot()
  const version = apiVersion()
  return `/api-proxy/${ctx}/ws/${version}/composite`
}

function parseCompositeResult(data: unknown): CompositeNestedResult[] {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const list = root.resultObject
  const items = Array.isArray(list) ? list : list ? [list] : []

  return items.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const statusRaw = o.httpStatus
    const httpStatus =
      typeof statusRaw === 'number'
        ? statusRaw
        : Number.parseInt(String(statusRaw ?? '0'), 10) || 0
    const body = 'any' in o ? o.any : o
    return {
      httpStatus,
      body,
      ok: httpStatus >= 200 && httpStatus < 300,
    }
  })
}

/** Throw if any nested call failed; message summarizes the first failure. */
export function assertCompositeAllOk(
  results: CompositeNestedResult[],
  label = 'Composite request',
): void {
  const failed = results.find((r) => !r.ok)
  if (!failed) return
  const msg = extractNestedErrorMessage(failed.body)
  throw new ApiError(
    failed.httpStatus || 500,
    msg || `${label}: nested call failed (${failed.httpStatus})`,
    failed.body as ApiErrorBody,
  )
}

function extractNestedErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return typeof body === 'string' ? body : undefined
  }
  const o = body as Record<string, unknown>
  if (typeof o.message === 'string') return o.message
  if (typeof o.developerMessage === 'string') return o.developerMessage
  const err = o.error
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.developerMessage === 'string') return e.developerMessage
    if (typeof e.message === 'string') return e.message
  }
  return undefined
}

/** Split into chunks for large fan-outs. */
export function chunkArray<T>(items: T[], size = COMPOSITE_CHUNK_SIZE): T[][] {
  if (size < 1) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
