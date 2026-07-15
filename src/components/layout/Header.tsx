import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/common/Button'
import { SearchInput } from '@/components/common/SearchInput'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { initials } from '@/utils/format'
import styles from './Header.module.css'

type Props = {
  onCreateArticle: () => void
}

export function Header({ onCreateArticle }: Props) {
  const navigate = useNavigate()
  const { user, demoMode, serverUrl, logout } = useSessionStore()
  const {
    language,
    setLanguage,
    globalSearch,
    setGlobalSearch,
    runGlobalSearch,
    searchResults,
    searching,
    selectArticle,
    selectFolder,
  } = useConsoleStore()
  const pushToast = useToastStore((s) => s.push)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (globalSearch.trim()) {
        void runGlobalSearch()
        setSearchOpen(true)
      } else {
        setSearchOpen(false)
      }
    }, 280)
    return () => window.clearTimeout(t)
  }, [globalSearch, runGlobalSearch])

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.userName ||
    'User'

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img
          className={styles.logoImg}
          src={`${import.meta.env.BASE_URL}egain-logo.png`}
          alt="eGain"
          height={28}
        />
        <span className={styles.divider} aria-hidden />
        <span className={styles.product}>Author</span>
      </div>

      <div className={styles.search}>
        <SearchInput
          placeholder="Search articles…"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          onFocus={() => searchResults.length && setSearchOpen(true)}
          aria-label="Search articles"
        />
      </div>

      {searchOpen && (searchResults.length > 0 || searching) ? (
        <div className={styles.searchResults} role="listbox">
          {searching ? (
            <div style={{ padding: '0.85rem', color: 'var(--eg-muted)' }}>Searching…</div>
          ) : (
            searchResults.map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.searchItem}
                onClick={() => {
                  void selectFolder(a.folderId)
                  void selectArticle(a.id)
                  setSearchOpen(false)
                  setGlobalSearch('')
                }}
              >
                <strong>{a.name}</strong>
                <span>
                  {a.id} · {a.status}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className={styles.actions}>
        {demoMode ? <span className={styles.badge}>Demo Mode</span> : null}
        <Button variant="primary" size="sm" onClick={onCreateArticle}>
          Create
        </Button>
        <select
          className={styles.select}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Language"
        >
          {(user?.languages && user.languages.length > 0
            ? user.languages
            : [
                { code: 'en-us', label: 'English (US)' },
                { code: 'en-gb', label: 'English (UK)' },
                { code: 'es-es', label: 'Spanish' },
                { code: 'fr-fr', label: 'French' },
                { code: 'de-de', label: 'German' },
              ]
          ).map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <div className={styles.userMenu} ref={menuRef}>
          <Button
            variant="ghost"
            icon
            aria-label="User menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.avatar}>{initials(displayName)}</span>
          </Button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <div style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}>
                <strong>{displayName}</strong>
                <div style={{ color: 'var(--eg-muted)', wordBreak: 'break-all' }}>
                  {demoMode ? 'demo://local' : serverUrl}
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false)
                  await logout()
                  pushToast({ type: 'info', message: 'Signed out' })
                  navigate('/login', { replace: true })
                }}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
