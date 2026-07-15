import { useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/common/Button'
import { getOAuthConfig } from '@/api/auth'
import { useSessionStore } from '@/store/sessionStore'
import { loadJson, STORAGE_KEYS } from '@/utils/storage'
import { normalizeServerUrl } from '@/utils/format'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const {
    serverUrl,
    setServerUrl,
    loginWithPassword,
    loginWithOAuth,
    enterDemoMode,
    isAuthenticated,
  } = useSessionStore()

  const [url, setUrl] = useState(serverUrl || '')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const oauthReady = useMemo(() => Boolean(getOAuthConfig()), [])
  const recent = loadJson<string[]>(STORAGE_KEYS.recentServers, [])

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  const applyServer = () => {
    const normalized = normalizeServerUrl(url)
    setUrl(normalized)
    setServerUrl(normalized)
    return normalized
  }

  const onLogin = async () => {
    setError(null)
    if (!url.trim()) {
      setError('Enter your eGain server URL first.')
      return
    }
    setBusy(true)
    try {
      applyServer()
      if (oauthReady) {
        await loginWithOAuth()
        return
      }
      setError(
        'OAuth is not configured. Set VITE_OAUTH_CLIENT_ID, VITE_OAUTH_AUTH_URL, and VITE_OAUTH_TOKEN_URL in .env — or use Password session login / Demo Mode.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const onPassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
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
            Enter your tenant server URL, then Login to open the OAuth / remote
            authentication flow for your client application and user.
          </p>

          {error ? <div className={styles.error}>{error}</div> : null}

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

          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={busy || !url.trim()}
              onClick={() => void onLogin()}
            >
              {busy ? 'Connecting…' : 'Login'}
            </Button>
            {!oauthReady ? (
              <p className={styles.hint} style={{ margin: 0 }}>
                OAuth env vars are not set yet. Configure <code>VITE_OAUTH_*</code>, use
                password session login, or enter Demo Mode.
              </p>
            ) : (
              <p className={styles.hint} style={{ margin: 0 }}>
                Login opens OAuth (Authorization Code + PKCE) against your tenant.
              </p>
            )}
          </div>

          <div className={styles.divider}>or</div>

          <details className={styles.advanced}>
            <summary>Password session login (X-egain-session)</summary>
            <form onSubmit={(e) => void onPassword(e)}>
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
              <Button
                variant="default"
                disabled={busy || !userName || !password || !url.trim()}
                type="submit"
                style={{ width: '100%' }}
              >
                Login with password
              </Button>
            </form>
          </details>

          <div className={styles.divider}>explore without a tenant</div>

          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void onDemo()}
            style={{ width: '100%' }}
          >
            Enter Demo Mode
          </Button>

          <p className={styles.hint}>
            OAuth redirect URI (register on the client app):{' '}
            <code>{window.location.origin}/oauth/callback</code>
          </p>
        </div>
      </section>
    </div>
  )
}
