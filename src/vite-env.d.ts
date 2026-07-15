/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER_URL?: string
  readonly VITE_OAUTH_CLIENT_ID?: string
  readonly VITE_OAUTH_AUTH_URL?: string
  readonly VITE_OAUTH_TOKEN_URL?: string
  readonly VITE_OAUTH_SCOPES?: string
  readonly VITE_OAUTH_REDIRECT_URI?: string
  readonly VITE_API_VERSION?: string
  readonly VITE_CONTEXT_ROOT?: string
  readonly VITE_FORCE_DEMO?: string
  readonly VITE_BASE_PATH?: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
