import { useEffect, useRef, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { ConsolePage } from '@/pages/ConsolePage'
import { ToastStack } from '@/components/common/Toast'
import { setSessionExpiredHandler } from '@/api/http'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { loginPathWithReturn } from '@/utils/authReturn'

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

/** Clear auth and return to login (preserving deep link) when the session dies. */
function SessionExpiryBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    setSessionExpiredHandler((_message) => {
      // Intentional logout clears auth before the logout API returns; ignore.
      if (!useSessionStore.getState().isAuthenticated()) return
      useSessionStore.getState().clearLocalAuth()
      useToastStore.getState().push({
        type: 'info',
        message: 'Your session expired. Please sign in again.',
      })
      const { pathname, search } = locationRef.current
      if (pathname === '/login') return
      navigate(loginPathWithReturn(pathname + search), { replace: true })
    })
    return () => setSessionExpiredHandler(null)
  }, [navigate])

  return null
}

export default function App() {
  return (
    <BootGate>
      <SessionExpiryBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ConsolePage />} />
        <Route path="/folder/:folderId" element={<ConsolePage />} />
        <Route
          path="/folder/:folderId/article/:articleId"
          element={<ConsolePage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
    </BootGate>
  )
}
