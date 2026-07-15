import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useSessionStore } from '@/store/sessionStore'

export function OAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const finishOAuth = useSessionStore((s) => s.finishOAuth)
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error_description') || params.get('error')

    if (err) {
      setError(err)
      return
    }
    if (!code || !state) {
      setError('Missing authorization code or state.')
      return
    }

    finishOAuth(code, state)
      .then(() => navigate('/', { replace: true }))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'OAuth callback failed'),
      )
  }, [params, finishOAuth, navigate])

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'var(--eg-surface-2)',
      }}
    >
      <div
        style={{
          background: 'white',
          border: '1px solid var(--eg-border)',
          borderRadius: 12,
          padding: '1.5rem',
          maxWidth: 420,
          width: '100%',
          boxShadow: 'var(--eg-shadow)',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: '1.2rem' }}>Completing sign-in…</h1>
        {error ? (
          <>
            <p style={{ color: 'var(--eg-danger)' }}>{error}</p>
            <button type="button" onClick={() => navigate('/login', { replace: true })}>
              Back to login
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--eg-muted)' }}>Exchanging authorization code…</p>
        )}
      </div>
    </div>
  )
}
