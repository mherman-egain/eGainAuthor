import { create } from 'zustand'
import type { AuthMode, SessionState, UserProfile } from '@/types'
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '@/utils/storage'
import {
  createDemoClient,
  createLiveClient,
  type ApiClient,
} from '@/api/client'
import { resolveLoggedInUser, sessionLogin } from '@/api/auth'
import { clearArticleLastModified } from '@/api/articleStamp'
import { resetSessionExpiredGuard } from '@/api/http'
import { beginSuppressReturnPath } from '@/utils/authReturn'
import { normalizeServerUrl } from '@/utils/format'

type SessionStore = SessionState & {
  client: ApiClient | null
  bootstrapped: boolean
  hydrate: () => void
  setServerUrl: (url: string) => void
  enterDemoMode: () => Promise<void>
  loginWithPassword: (userName: string, password: string) => Promise<void>
  setUser: (user: UserProfile | null) => void
  /** Clear local auth without calling the logout API (session expiry). */
  clearLocalAuth: () => void
  logout: () => Promise<void>
  getClient: () => ApiClient
  isAuthenticated: () => boolean
}

function persistSession(state: SessionState) {
  saveJson(STORAGE_KEYS.session, state)
  saveJson(STORAGE_KEYS.serverUrl, state.serverUrl)
}

function clearSession() {
  removeKey(STORAGE_KEYS.session)
}

/** Department always comes from the logged-in user profile. */
function departmentFromUser(user?: UserProfile | null): string | undefined {
  return user?.departmentId
}

function buildLiveClient(state: SessionState, language = 'en-us'): ApiClient {
  return createLiveClient({
    serverUrl: state.serverUrl,
    sessionId: state.sessionId,
    accessToken: state.accessToken,
    departmentId: departmentFromUser(state.user) || state.departmentId,
    language: language || 'en-us',
    demoMode: false,
  })
}

const defaultServer =
  (import.meta.env.VITE_DEFAULT_SERVER_URL as string) ||
  'https://your-tenant.egain.cloud'

export const useSessionStore = create<SessionStore>((set, get) => ({
  serverUrl: defaultServer,
  authMode: 'demo',
  demoMode: false,
  client: null,
  bootstrapped: false,

  hydrate: () => {
    const saved = loadJson<SessionState | null>(STORAGE_KEYS.session, null)
    const serverUrl = loadJson(STORAGE_KEYS.serverUrl, defaultServer)

    if (import.meta.env.VITE_FORCE_DEMO === 'true') {
      const demo = createDemoClient()
      set({
        serverUrl: 'demo://local',
        authMode: 'demo',
        demoMode: true,
        user: {
          id: 'u-1001',
          userName: 'demo.author',
          firstName: 'Alex',
          lastName: 'Morgan',
          department: 'Knowledge Services',
          departmentId: '999',
        },
        departmentId: '999',
        client: demo,
        bootstrapped: true,
      })
      return
    }

    if (saved?.demoMode) {
      const demo = createDemoClient()
      set({
        ...saved,
        serverUrl: saved.serverUrl || 'demo://local',
        client: demo,
        bootstrapped: true,
      })
      return
    }

    if (saved?.sessionId) {
      const departmentId = departmentFromUser(saved.user) || saved.departmentId
      const restored = { ...saved, departmentId, authMode: 'session' as AuthMode }
      const live = buildLiveClient(restored)
      set({
        ...restored,
        accessToken: undefined,
        refreshToken: undefined,
        client: live,
        bootstrapped: true,
      })
      // Refresh user profile so department.id stays current
      if (!departmentId || !saved.user?.departmentId) {
        void resolveLoggedInUser(
          {
            serverUrl: restored.serverUrl,
            sessionId: restored.sessionId,
          },
          saved.user?.userName,
          saved.user,
        )
          .then((user) => {
            get().setUser(user)
          })
          .catch((err) => {
            console.warn('Could not refresh user profile after hydrate:', err)
          })
      }
      return
    }

    set({
      serverUrl,
      client: null,
      bootstrapped: true,
      demoMode: false,
    })
  },

  setServerUrl: (url) => {
    const serverUrl = normalizeServerUrl(url)
    set({ serverUrl })
    saveJson(STORAGE_KEYS.serverUrl, serverUrl)
    const recent = loadJson<string[]>(STORAGE_KEYS.recentServers, [])
    const next = [serverUrl, ...recent.filter((r) => r !== serverUrl)].slice(0, 5)
    saveJson(STORAGE_KEYS.recentServers, next)
  },

  enterDemoMode: async () => {
    const demo = createDemoClient()
    const user = await demo.fetchCurrentUser()
    const state: SessionState = {
      serverUrl: 'demo://local',
      authMode: 'demo',
      demoMode: true,
      user: user ?? undefined,
      departmentId: user?.departmentId,
    }
    persistSession(state)
    resetSessionExpiredGuard()
    set({ ...state, client: demo })
  },

  loginWithPassword: async (userName, password) => {
    const serverUrl = normalizeServerUrl(get().serverUrl)
    const { sessionId, userHint } = await sessionLogin(
      serverUrl,
      userName,
      password,
    )

    const auth = { serverUrl, sessionId, language: 'en-us' as const }
    const user = await resolveLoggedInUser(auth, userName, userHint)
    const language = user.defaultLanguage || 'en-us'
    const state: SessionState = {
      serverUrl,
      authMode: 'session',
      demoMode: false,
      sessionId,
      user,
      departmentId: user.departmentId,
    }
    persistSession(state)
    resetSessionExpiredGuard()
    set({ ...state, client: buildLiveClient(state, language) })
    // Apply user's default KB language to the console
    void import('./consoleStore').then(({ useConsoleStore }) => {
      useConsoleStore.getState().setLanguage(language)
    })
  },

  setUser: (user) => {
    const cur = get()
    const departmentId = departmentFromUser(user)
    const nextState: SessionState = {
      serverUrl: cur.serverUrl,
      authMode: cur.authMode,
      demoMode: cur.demoMode,
      accessToken: cur.accessToken,
      refreshToken: cur.refreshToken,
      sessionId: cur.sessionId,
      expiresAt: cur.expiresAt,
      departmentId,
      user: user ?? undefined,
    }
    persistSession(nextState)
    set({
      user: user ?? undefined,
      departmentId,
      client: cur.demoMode ? cur.client : buildLiveClient(nextState),
    })
  },

  clearLocalAuth: () => {
    clearSession()
    clearArticleLastModified()
    void import('./consoleStore').then(({ useConsoleStore }) => {
      useConsoleStore.getState().resetConsole()
    })
    set({
      accessToken: undefined,
      refreshToken: undefined,
      sessionId: undefined,
      expiresAt: undefined,
      user: undefined,
      departmentId: undefined,
      demoMode: false,
      authMode: 'session',
      client: null,
    })
  },

  logout: async () => {
    const client = get().client
    // Prevent ConsolePage's auth guard from capturing the current deep link
    // as `next` while local auth is cleared. Cleared when LoginPage mounts.
    beginSuppressReturnPath()
    // Drop local auth first so a dead-session logout response does not
    // race a "session expired → return to this page" redirect.
    get().clearLocalAuth()
    try {
      await client?.logout()
    } catch {
      // ignore
    }
    resetSessionExpiredGuard()
  },

  getClient: () => {
    const client = get().client
    if (!client) throw new Error('Not authenticated')
    // Ensure Accept-Language tracks the console language (default en-us)
    if (!client.auth.language) {
      client.auth.language = 'en-us'
    }
    return client
  },

  isAuthenticated: () => {
    const s = get()
    return Boolean(s.client && (s.demoMode || s.sessionId))
  },
}))
