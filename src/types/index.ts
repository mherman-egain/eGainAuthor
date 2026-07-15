export type ArticleStatus = 'draft' | 'live' | 'pending' | 'retired' | 'unknown'

export type AuthMode = 'session' | 'demo'

export interface UserLanguage {
  code: string
  label: string
  isDefault?: boolean
}

export interface UserProfile {
  id: string
  userName: string
  firstName?: string
  lastName?: string
  screenName?: string
  email?: string
  /** Display name of the home department. */
  department?: string
  /** Home department id for Get Folder (`?department=`). */
  departmentId?: string
  /** Languages from the user resource (`languages.language[]`). */
  languages?: UserLanguage[]
  /** Default language code (`isDefault: true`), e.g. en-us. */
  defaultLanguage?: string
}

export interface SessionState {
  serverUrl: string
  authMode: AuthMode
  accessToken?: string
  refreshToken?: string
  sessionId?: string
  expiresAt?: number
  user?: UserProfile
  /** Department id for KB folder/article-type queries. */
  departmentId?: string
  demoMode: boolean
}

export interface FolderNode {
  id: string
  name: string
  parentId?: string | null
  path?: string
  articleCount?: number
  /** Total child folders reported by paginationInfo.count (when present). */
  childCount?: number
  children?: FolderNode[]
  /** True when more child pages exist beyond what is currently loaded. */
  hasMoreChildren?: boolean
  /** Next $pagenum to fetch for children (1-based). */
  childrenNextPage?: number
  createdDate?: string
  lastModifiedDate?: string
  description?: string
}

export interface ArticleSummary {
  id: string
  name: string
  alternateId?: string
  folderId: string
  status: ArticleStatus
  articleType?: string
  author?: string
  createdBy?: string
  createdDate?: string
  lastModifiedBy?: string
  lastModifiedDate?: string
  language?: string
  checkedOut?: boolean
  checkedOutBy?: string
  /** User id from lock.lockedBy / checkoutInfo when present. */
  checkedOutById?: string
  /** Display version number (versions.version.versionNumber). */
  version?: string | number
  /** Internal version id (versions.version.id) — required for concurrency targeting. */
  versionId?: string
  includeInGenAI?: boolean
}

export interface ArticleDetail extends ArticleSummary {
  content: string
  summary?: string
  keywords?: string
  description?: string
  notes?: string
  publishDate?: string
  expiryDate?: string
  availableDate?: string
  topics?: TopicRef[]
  attachments?: AttachmentRef[]
  customAttributes?: CustomAttribute[]
  versions?: ArticleVersion[]
}

export interface ArticleVersion {
  id: string
  versionNumber?: string | number
  createdDate?: string
  createdBy?: string
  lastModifiedDate?: string
  isPublished?: boolean
  label?: string
}

export interface TopicRef {
  id: string
  name: string
}

export interface AttachmentRef {
  id: string
  name: string
  size?: number
  contentType?: string
  createdDate?: string
}

export interface CustomAttribute {
  name: string
  value: string
}

export interface ArticleType {
  id: string
  name: string
}

export interface CreateFolderInput {
  name: string
  /** When omitted, the folder is created under the department Shared folder. */
  parentId?: string
  description?: string
}

export interface EditFolderInput {
  id: string
  name: string
  description?: string
  lastModifiedDate?: string
}

export interface CreateArticleInput {
  name: string
  folderId: string
  content?: string
  description?: string
  keywords?: string
  summary?: string
  articleType?: string
  language?: string
}

export interface EditArticleInput {
  id: string
  name?: string
  content?: string
  description?: string
  keywords?: string
  summary?: string
  notes?: string
  includeInGenAI?: boolean
  articleType?: string
  lastModifiedDate?: string
  language?: string
  customAttributes?: CustomAttribute[]
}

export interface ApiErrorBody {
  message: string
  code?: string | number
  details?: unknown
}

export class ApiError extends Error {
  status: number
  body?: ApiErrorBody
  /** True when the server rejected X-egain-session as expired/invalid. */
  sessionExpired?: boolean

  constructor(
    status: number,
    message: string,
    body?: ApiErrorBody,
    sessionExpired?: boolean,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.sessionExpired = sessionExpired
  }
}

/** Detect eGain session expiry / invalid session messages. */
export function isSessionExpiredError(err: unknown): boolean {
  if (err instanceof ApiError && err.sessionExpired) return true
  const status = err instanceof ApiError ? err.status : 0
  const message = err instanceof Error ? err.message : String(err ?? '')
  const lower = message.toLowerCase()
  if (
    lower.includes('x-egain-session') &&
    (lower.includes('expir') || lower.includes('invalid') || lower.includes('not found'))
  ) {
    return true
  }
  if (lower.includes('session') && (lower.includes('expir') || lower.includes('invalid'))) {
    return true
  }
  if (status === 401) return true
  return false
}
