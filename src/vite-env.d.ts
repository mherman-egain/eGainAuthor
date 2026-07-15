/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER_URL?: string
  readonly VITE_API_VERSION?: string
  readonly VITE_CONTEXT_ROOT?: string
  readonly VITE_FORCE_DEMO?: string
  readonly VITE_BASE_PATH?: string
  /** Absolute proxy prefix for /api-proxy paths in production. */
  readonly VITE_API_PROXY_BASE?: string
  /** When true, call the tenant serverUrl directly (CORS required). */
  readonly VITE_API_DIRECT?: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
