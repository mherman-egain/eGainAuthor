function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomString(length = 64): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => ('0' + (b % 36).toString(36)).slice(-2))
    .join('')
    .slice(0, length)
}

export async function createPkcePair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = randomString(64)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return { verifier, challenge: toBase64Url(digest) }
}

export function buildAuthorizeUrl(params: {
  authUrl: string
  clientId: string
  redirectUri: string
  scopes: string
  state: string
  challenge: string
}): string {
  const url = new URL(params.authUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', params.scopes)
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}
