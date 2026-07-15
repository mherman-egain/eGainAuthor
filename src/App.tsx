import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { ConsolePage } from '@/pages/ConsolePage'
import { ToastStack } from '@/components/common/Toast'
import { useSessionStore } from '@/store/sessionStore'

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ConsolePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
    </BootGate>
  )
}
