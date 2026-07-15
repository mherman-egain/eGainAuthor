const PREFIX = 'egain-author:'

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function removeKey(key: string): void {
  localStorage.removeItem(PREFIX + key)
}

export const STORAGE_KEYS = {
  session: 'session',
  serverUrl: 'serverUrl',
  recentServers: 'recentServers',
  uiPrefs: 'uiPrefs',
} as const
