import type { UserProfile } from '@/types'
import {
  apiRequest,
  extractSessionId,
  proxyWs,
  wsPath,
  type RequestAuth,
} from './http'
import { mapUser, unwrapList } from './mappers'
import { createPkcePair, buildAuthorizeUrl, randomString } from '@/utils/pkce'

const PKCE_KEY = 'egain-author:oauth-pkce'

export interface OAuthConfig {
  clientId: string
  authUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string
}

export function getOAuthConfig(): OAuthConfig | null {
  const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID as string | undefined
  const authUrl = import.meta.env.VITE_OAUTH_AUTH_URL as string | undefined
  const tokenUrl = import.meta.env.VITE_OAUTH_TOKEN_URL as string | undefined
  if (!clientId || !authUrl || !tokenUrl) return null

  return {
    clientId,
    authUrl,
    tokenUrl,
    redirectUri:
      (import.meta.env.VITE_OAUTH_REDIRECT_URI as string) ||
      `${window.location.origin}/oauth/callback`,
    scopes:
      (import.meta.env.VITE_OAUTH_SCOPES as string) ||
      'openid profile knowledge.authoring.manage',
  }
}

export async function startOAuthLogin(serverUrl: string): Promise<void> {
  const config = getOAuthConfig()
  if (!config) {
    throw new Error(
      'OAuth is not configured. Set VITE_OAUTH_CLIENT_ID, VITE_OAUTH_AUTH_URL, and VITE_OAUTH_TOKEN_URL in .env',
    )
  }

  const { verifier, challenge } = await createPkcePair()
  const state = randomString(32)
  sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({ verifier, state, serverUrl, ...config }),
  )

  const url = buildAuthorizeUrl({
    authUrl: config.authUrl,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    state,
    challenge,
  })

  window.location.href = url
}

export async function completeOAuthCallback(
  code: string,
  state: string,
): Promise<{
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  serverUrl: string
}> {
  const raw = sessionStorage.getItem(PKCE_KEY)
  if (!raw) throw new Error('OAuth session not found. Start login again.')
  const saved = JSON.parse(raw) as OAuthConfig & {
    verifier: string
    state: string
    serverUrl: string
  }
  sessionStorage.removeItem(PKCE_KEY)

  if (saved.state !== state) {
    throw new Error('OAuth state mismatch. Please try logging in again.')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: saved.redirectUri,
    client_id: saved.clientId,
    code_verifier: saved.verifier,
  })

  const tokenPath = saved.tokenUrl.startsWith('http')
    ? `/api-proxy${new URL(saved.tokenUrl).pathname}${new URL(saved.tokenUrl).search}`
    : saved.tokenUrl

  const response = await fetch(tokenPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'X-Target-Server': saved.serverUrl,
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text || response.statusText}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
    serverUrl: saved.serverUrl,
  }
}

/**
 * Classic eGain session login (Knowledge / Interaction Authoring APIs).
 * POST /ws/v20/authentication/user/login
 */
export async function sessionLogin(
  serverUrl: string,
  userName: string,
  password: string,
): Promise<{ sessionId: string; userHint?: UserProfile }> {
  const response = await apiRequest<Response>(
    { serverUrl, language: 'en-us' },
    `${wsPath('authentication/user/login')}?forceLogin=yes`,
    {
      method: 'POST',
      body: JSON.stringify({ userName, password }),
      raw: true,
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Login failed (${response.status})`)
  }

  const sessionId = extractSessionId(response)
  if (!sessionId) {
    throw new Error(
      'Login succeeded but no X-egain-session header was returned. Check proxy / tenant configuration.',
    )
  }

  let userHint: UserProfile | undefined
  try {
    const cloned = response.clone()
    const data = await cloned.json()
    const list = unwrapList(data, ['user', 'users'])
    if (list.length > 0) userHint = mapUser(list[0])
    else if (data && typeof data === 'object') {
      const mapped = mapUser(data)
      if (mapped.userName || mapped.departmentId) userHint = mapped
    }
  } catch {
    // login often returns empty body
  }

  return { sessionId, userHint }
}

export async function sessionLogout(auth: RequestAuth): Promise<void> {
  try {
    await apiRequest(auth, wsPath('authentication/user/logout'), {
      method: 'DELETE',
    })
  } catch {
    // best-effort
  }
}

/** Normalize eGain Get-User payloads into a UserProfile (exported for assertions). */
export function firstUserFromPayload(data: unknown): UserProfile | null {
  // Some gateways double-encode JSON as a string body.
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return firstUserFromPayload(JSON.parse(trimmed))
      } catch {
        return null
      }
    }
    return null
  }

  const list = unwrapList(data, ['user', 'users', 'User', 'Users'])
  if (list.length > 0) {
    const mapped = mapUser(list[0])
    if (mapped.id || mapped.userName || mapped.departmentId) return mapped
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const root = data as Record<string, unknown>
    // Direct user resource (unlikely, but cheap to try)
    if (root.id || root.loginId || root.userName) {
      const mapped = mapUser(data)
      if (mapped.id || mapped.userName || mapped.departmentId) return mapped
    }
  }
  return null
}

function payloadDebugSummary(data: unknown): string {
  if (data === undefined || data === null) return String(data)
  if (typeof data === 'string') {
    return `string(${data.length} chars, starts ${JSON.stringify(data.slice(0, 80))})`
  }
  if (Array.isArray(data)) return `array(len=${data.length})`
  if (typeof data === 'object') {
    return `object keys=[${Object.keys(data as object).slice(0, 12).join(', ')}]`
  }
  return typeof data
}

/**
 * Load the logged-in user's profile (including department.id).
 * GET /ws/v20/administration/user/login/{loginID}?$attribute=all
 */
export async function fetchCurrentUser(
  auth: RequestAuth,
  loginId?: string,
): Promise<{ user: UserProfile | null; lastError?: string }> {
  if (!loginId) {
    return {
      user: null,
      lastError:
        'No login id available to load the user profile (GET …/administration/user/login/{loginId}).',
    }
  }

  const encoded = encodeURIComponent(loginId)
  // Encode `$` so proxies / intermediaries cannot strip `$attribute`.
  const attempts = [
    `${wsPath(`administration/user/login/${encoded}`)}?%24attribute=all`,
  ]

  let lastError: string | undefined
  for (const path of attempts) {
    try {
      const data = await apiRequest(auth, path, { method: 'GET' })
      if (import.meta.env.DEV) {
        console.log(
          '[fetchCurrentUser] GET',
          path,
          payloadDebugSummary(data),
        )
      }
      const user = firstUserFromPayload(data)
      if (user) {
        if (user.id && !user.departmentId && /^\d+$/.test(user.id)) {
          try {
            const full = await apiRequest(
              auth,
              `${wsPath(`administration/user/${user.id}`)}?%24attribute=all`,
              { method: 'GET' },
            )
            const detailed = firstUserFromPayload(full)
            if (detailed?.departmentId) return { user: detailed }
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err)
          }
        }
        return { user }
      }
      lastError = `User API returned an unexpected payload from ${path} (${payloadDebugSummary(data)})`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return { user: null, lastError }
}

/**
 * After authentication, resolve the user and require a department id
 * for KB folder/article-type queries.
 */
export async function resolveLoggedInUser(
  auth: RequestAuth,
  loginId?: string,
  hint?: UserProfile,
): Promise<UserProfile> {
  if (hint?.departmentId) {
    return hint
  }

  const id = loginId || hint?.userName
  const { user: fetched, lastError } = await fetchCurrentUser(auth, id)
  const user = fetched ?? hint

  if (!user) {
    throw new Error(
      `Login succeeded but user profile could not be loaded${id ? ` for "${id}"` : ''}. ${lastError || 'GET /administration/user/login/{loginId} failed.'}`,
    )
  }

  if (!user.departmentId) {
    throw new Error(
      `Logged-in user "${user.userName || id}" has no department id on the user profile (expected user.department.id).${lastError ? ` Last API detail: ${lastError}` : ''}`,
    )
  }

  return user
}

/**
 * Authenticate client application (OAuth2).
 * POST /ws/v19/clientapplications/authentication/oauth2/token
 */
export async function authenticateClientApp(
  serverUrl: string,
  clientId: string,
  clientSecret: string,
  formBody: Record<string, string> = { grant_type: 'client_credentials' },
): Promise<{ accessToken?: string; sessionId?: string; raw?: unknown }> {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const body = new URLSearchParams(formBody)

  const response = await apiRequest<Response>(
    { serverUrl, language: 'en-us' },
    proxyWs('/ws/v19/clientapplications/authentication/oauth2/token'),
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      raw: true,
      skipJsonContentType: true,
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Client authentication failed (${response.status})`)
  }

  const sessionId = extractSessionId(response) ?? undefined
  let accessToken: string | undefined
  let raw: unknown
  try {
    raw = await response.json()
    const json = raw as { access_token?: string; accessToken?: string }
    accessToken = json.access_token ?? json.accessToken
  } catch {
    // no body
  }

  return { accessToken, sessionId, raw }
}

/** Revoke client application access token. */
export async function revokeClientAccessToken(
  serverUrl: string,
  clientId: string,
  clientSecret: string,
  token: string,
): Promise<void> {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const body = new URLSearchParams({ token })
  await apiRequest(
    { serverUrl, language: 'en-us' },
    proxyWs('/ws/v19/clientapplications/authentication/oauth2/revoke'),
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      skipJsonContentType: true,
    },
  )
}
