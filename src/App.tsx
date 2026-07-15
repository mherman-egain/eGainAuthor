import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { OAuthCallbackPage } from '@/pages/OAuthCallbackPage'
import { ConsolePage } from '@/pages/ConsolePage'
import { ToastStack } from '@/components/common/Toast'
import { useSessionStore } from '@/store/sessionStore'

/**
 * OAuth providers redirect to index.html?code=…&state=… (no hash).
 * Move those params onto the in-app /oauth/callback route.
 */
function OAuthQueryBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error') || params.get('error_description')
    if (!code && !state && !oauthError) return

    const qs = params.toString()
    navigate(`/oauth/callback?${qs}`, { replace: true })
    // Drop the search string so CloudFront keeps serving index.html on reload.
    const path = window.location.pathname || '/'
    window.history.replaceState(null, '', `${path}${window.location.hash}`)
  }, [navigate])

  return null
}

function BootGate({ children }: { children: ReactNode }) {
  const bootstrapped = useSessionStore((s) => s.bootstrapped)
  const hydrate = useSessionStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (!bootstrapped) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--eg-muted)',
          background: 'var(--eg-surface-2)',
        }}
      >
        Starting eGain Author…
      </div>
    )
  }

  return children
}

export default function App() {
  return (
    <BootGate>
      <OAuthQueryBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/" element={<ConsolePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
    </BootGate>
  )
}
