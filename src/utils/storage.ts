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

export type UiPrefs = {
  autoSave?: boolean
  /** Dock article properties to the right side of the console. */
  propertiesAnchored?: boolean
}

export function loadUiPrefs(): UiPrefs {
  return loadJson<UiPrefs>(STORAGE_KEYS.uiPrefs, {})
}

export function saveUiPrefs(patch: Partial<UiPrefs>): void {
  saveJson(STORAGE_KEYS.uiPrefs, { ...loadUiPrefs(), ...patch })
}
