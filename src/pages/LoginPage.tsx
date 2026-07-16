import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/common/Button'
import { useSessionStore } from '@/store/sessionStore'
import {
  endSuppressReturnPath,
  sanitizeReturnPath,
} from '@/utils/authReturn'
import { loadJson, STORAGE_KEYS } from '@/utils/storage'
import { normalizeServerUrl } from '@/utils/format'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const {
    serverUrl,
    setServerUrl,
    loginWithPassword,
    enterDemoMode,
    isAuthenticated,
  } = useSessionStore()
  const [searchParams] = useSearchParams()
  const returnTo = sanitizeReturnPath(searchParams.get('next'))

  useEffect(() => {
    endSuppressReturnPath()
  }, [])

  const [url, setUrl] = useState(serverUrl || '')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recent = loadJson<string[]>(STORAGE_KEYS.recentServers, [])

  if (isAuthenticated()) {
    return <Navigate to={returnTo} replace />
  }

  const applyServer = () => {
    const normalized = normalizeServerUrl(url)
    setUrl(normalized)
    setServerUrl(normalized)
    return normalized
  }

  const onPassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!url.trim()) {
      setError('Enter your eGain server URL first.')
      return
    }
    if (!userName.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setBusy(true)
    try {
      applyServer()
      await loginWithPassword(userName.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const onDemo = async () => {
    setError(null)
    setBusy(true)
    try {
      await enterDemoMode()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start demo mode')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brandMark}>
          <img
            className={styles.logoImg}
            src={`${import.meta.env.BASE_URL}egain-logo.png`}
            alt="eGain"
            height={36}
          />
          <div>
            <p className={styles.brandName}>Author</p>
            <p className={styles.brandTag}>Knowledge Authoring Console</p>
          </div>
        </div>

        <div className={styles.heroCopy}>
          <h2>Trusted knowledge authoring for CX automation.</h2>
          <p>
            Connect to your eGain tenant to manage folders and articles — with
            checkout, publish, and governance built in.
          </p>
        </div>

        <p className={styles.footNote}>
          Powered by eGain Knowledge Authoring Interaction APIs
        </p>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <h1>Sign in</h1>
          <p className={styles.cardIntro}>
            Enter your tenant server URL and credentials. Login creates an{' '}
            <code>X-egain-session</code> for Knowledge Authoring APIs.
          </p>

          {error ? <div className={styles.error}>{error}</div> : null}

          <form onSubmit={(e) => void onPassword(e)}>
            <div className={styles.field}>
              <label htmlFor="serverUrl">Server URL</label>
              <input
                id="serverUrl"
                name="serverUrl"
                placeholder="https://your-tenant.egain.cloud"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                list="recent-servers"
                autoComplete="url"
              />
              <datalist id="recent-servers">
                {recent.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div className={styles.field}>
              <label htmlFor="userName">Username</label>
              <input
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className={styles.actions}>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || !url.trim() || !userName.trim() || !password}
                style={{ width: '100%' }}
              >
                {busy ? 'Signing in…' : 'Login'}
              </Button>
            </div>
          </form>

          <div className={styles.divider}>explore without a tenant</div>

          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void onDemo()}
            style={{ width: '100%' }}
          >
            Enter Demo Mode
          </Button>
        </div>
      </section>
    </div>
  )
}
