import type {
  ArticleDetail,
  ArticleStatus,
  ArticleSummary,
  ArticleType,
  ArticleVersion,
  AttachmentRef,
  FolderNode,
  TopicRef,
  UserProfile,
} from '@/types'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

function pickDate(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      const nested = asRecord(v)
      const d = nested.date ?? nested.value
      if (typeof d === 'string') return d
    }
  }
  return undefined
}

function mapStatus(raw: unknown): ArticleStatus {
  const s = String(raw ?? '').toLowerCase()
  if (s.includes('publish') || s === 'live' || s === 'available') return 'live'
  // Checked-out working copy ("transient") is still a draft for authors
  if (s.includes('draft') || s.includes('transient') || s.includes('checkout')) {
    return 'draft'
  }
  if (s.includes('pend') || s.includes('review')) return 'pending'
  if (s.includes('retir') || s.includes('archive')) return 'retired'
  return raw ? 'unknown' : 'draft'
}

function pickKey(obj: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in obj) return obj[key]
  }
  // Case-insensitive fallback (XML→JSON gateways sometimes capitalize)
  const lowerMap = new Map(
    Object.keys(obj).map((k) => [k.toLowerCase(), k] as const),
  )
  for (const key of candidates) {
    const actual = lowerMap.get(key.toLowerCase())
    if (actual !== undefined) return obj[actual]
  }
  return undefined
}

/**
 * Normalize eGain list payloads. Single resources are often returned as an
 * object (not a one-element array), e.g. `{ "user": { "id": "1011", ... } }`
 * or `{ "users": { "user": { ... } } }`.
 */
export function unwrapList<T = unknown>(
  payload: unknown,
  keys: string[],
): T[] {
  if (Array.isArray(payload)) return payload as T[]
  const root = asRecord(payload)
  for (const key of keys) {
    const v = pickKey(root, key)
    if (Array.isArray(v)) return v as T[]
    if (v && typeof v === 'object') {
      const nested = asRecord(v)
      // Nested collection: { users: { user: [...] | {...} } }
      for (const inner of [
        key,
        'user',
        'folder',
        'article',
        'item',
        'attachment',
        'topic',
        'version',
        'articleType',
      ]) {
        const innerVal = pickKey(nested, inner)
        if (Array.isArray(innerVal)) return innerVal as T[]
        if (innerVal && typeof innerVal === 'object') return [innerVal as T]
      }
      // Bare single resource under the key: { user: { id, ... } }
      if ('id' in nested || 'name' in nested || 'loginId' in nested) {
        return [v as T]
      }
    }
  }
  return []
}

export function mapFolder(raw: unknown): FolderNode {
  const o = asRecord(raw)
  const parent = asRecord(o.parent ?? o.parentFolder)

  let children: FolderNode[] | undefined
  let childCount: number | undefined
  let childrenPage = 1
  let childrenPageSize = 75

  const childrenRaw = o.folder ?? o.folders ?? o.children ?? o.childFolder
  if (Array.isArray(childrenRaw)) {
    children = childrenRaw.map(mapFolder)
  } else if (childrenRaw && typeof childrenRaw === 'object') {
    const nested = asRecord(childrenRaw)
    const nestedList = nested.folder ?? nested.folders
    if (Array.isArray(nestedList)) {
      children = nestedList.map(mapFolder)
    } else if (pickString(nested.id)) {
      children = [mapFolder(childrenRaw)]
    }
    const nestedPage = asRecord(nested.paginationInfo)
    if (nestedPage.count != null || nestedPage.pagenum != null) {
      childCount = Number(nestedPage.count ?? children?.length ?? 0)
      childrenPage = Number(nestedPage.pagenum ?? 1)
      childrenPageSize = Number(nestedPage.pagesize ?? 75)
    }
  }

  // Folder-level paginationInfo describes this folder's child collection
  const selfPage = asRecord(o.paginationInfo)
  if (selfPage.count != null || selfPage.pagenum != null) {
    childCount = Number(selfPage.count ?? childCount ?? children?.length ?? 0)
    childrenPage = Number(selfPage.pagenum ?? childrenPage)
    childrenPageSize = Number(selfPage.pagesize ?? childrenPageSize)
  }

  if (childCount == null) {
    childCount = Number(
      o.childCount ??
        o.folderCount ??
        o.childFolderCount ??
        o.numberOfFolders ??
        children?.length ??
        0,
    )
    // Keep 0 as a real leaf signal (don't coerce to undefined).
    if (!Number.isFinite(childCount)) childCount = undefined
  }

  const loaded = children?.length ?? 0
  const total = childCount ?? loaded
  const hasMoreChildren = total > loaded
  const childrenNextPage = hasMoreChildren ? childrenPage + 1 : undefined

  return {
    id: pickString(o.id, o.folderId) ?? '',
    name: pickString(o.name, o.folderName) ?? 'Untitled folder',
    parentId: pickString(parent.id, o.parentId) ?? null,
    path: pickString(o.path, o.folderPath),
    articleCount: Number(o.articleCount ?? o.count ?? 0) || undefined,
    childCount: total,
    children,
    hasMoreChildren,
    childrenNextPage,
    createdDate: pickDate(o, 'created', 'createdDate'),
    lastModifiedDate: pickDate(o, 'lastModified', 'lastModifiedDate'),
    description: pickString(o.description),
  }
}

function isCheckoutArticleState(raw: unknown): boolean {
  const s = String(raw ?? '').toLowerCase()
  return (
    s.includes('transient') ||
    s.includes('checkout') ||
    s.includes('checked_out') ||
    s.includes('checked-out') ||
    s.includes('checkedout')
  )
}

function pickCheckoutUser(
  o: Record<string, unknown>,
  version: Record<string, unknown>,
): Record<string, unknown> {
  const lock = asRecord(o.lock ?? version.lock)
  const lockedBy = asRecord(lock.lockedBy)
  const checkout = asRecord(
    o.checkoutInfo ?? version.checkoutInfo ?? o.checkedOutBy ?? version.checkedOutBy,
  )
  const fromCheckout = asRecord(checkout.user ?? checkout.lockedBy)
  if (Object.keys(lockedBy).length > 0) return lockedBy
  if (Object.keys(fromCheckout).length > 0) return fromCheckout
  if (Object.keys(checkout).length > 0 && (checkout.id || checkout.name)) return checkout
  return {}
}

/**
 * Concurrency lastModified MUST come from versions.version[].lastModified.date.
 * Article-level lastModified often differs and causes 412 on edit/checkin.
 */
export function extractVersionLastModified(raw: unknown): string | undefined {
  const version = pickWorkingVersion(asRecord(raw))
  return pickDate(version, 'lastModified', 'lastModifiedDate')
}

/** @deprecated use extractVersionLastModified — name kept for call sites. */
export function extractArticleLastModified(raw: unknown): string | undefined {
  return extractVersionLastModified(raw)
}

export function extractWorkingVersionId(raw: unknown): string | undefined {
  const version = pickWorkingVersion(asRecord(raw))
  return pickString(version.id, version.versionId)
}

/**
 * Prefer checked-out / transient working copy; else highest versionNumber.
 * Exported for concurrency helpers that need the version object itself.
 */
export function pickWorkingVersion(o: Record<string, unknown>): Record<string, unknown> {
  const versions = unwrapList(o.versions ?? o.version, ['version'])
  if (versions.length === 0) return {}

  for (const v of versions) {
    const x = asRecord(v)
    if (
      isCheckoutArticleState(x.articleState ?? x.state) ||
      asRecord(x.checkoutInfo).user ||
      asRecord(x.lock).lockedBy
    ) {
      return x
    }
  }

  let best = asRecord(versions[0])
  let bestNum = Number(best.versionNumber ?? best.number ?? -1)
  for (const v of versions) {
    const x = asRecord(v)
    const n = Number(x.versionNumber ?? x.number ?? -1)
    if (n >= bestNum) {
      best = x
      bestNum = n
    }
  }
  return best
}

/** @deprecated alias — use pickWorkingVersion */
function pickLatestVersion(o: Record<string, unknown>): Record<string, unknown> {
  return pickWorkingVersion(o)
}

/**
 * Editable only when the article is checked out **and** the lock holder is
 * the current user. Checked out by anyone else (or unknown) → read-only.
 */
export function isCheckedOutByUser(
  article: Pick<ArticleSummary, 'checkedOut' | 'checkedOutBy' | 'checkedOutById'>,
  user?: UserProfile | null,
): boolean {
  if (!article.checkedOut || !user) return false

  const lockId =
    article.checkedOutById != null && String(article.checkedOutById).trim()
      ? String(article.checkedOutById).trim().toLowerCase()
      : ''
  const myIds = [user.id, user.userName]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase())
  if (lockId && myIds.includes(lockId)) return true

  const lockName = article.checkedOutBy?.trim().toLowerCase()
  if (!lockName) {
    // Checked out but owner unknown — never assume it is the current user.
    return false
  }

  const myNames = [
    user.screenName,
    user.userName,
    [user.firstName, user.lastName].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase())

  // Exact name match only (no loose substring matching).
  return myNames.some((n) => n === lockName)
}

export function mapArticleSummary(raw: unknown, folderIdFallback?: string): ArticleSummary {
  const o = asRecord(raw)
  const folder = asRecord(o.folder)
  const createdBy = asRecord(o.createdBy ?? o.created)
  const lang = asRecord(o.language)
  // eGain stores the display title on versions.version[].name (not article.name)
  const version = pickLatestVersion(o)
  const versionType = asRecord(version.articleType)
  const lastMod = asRecord(version.lastModified ?? o.lastModified)
  const lastModBy = asRecord(lastMod.user ?? o.lastModifiedBy)
  const checkoutUser = pickCheckoutUser(o, version)
  const lock = asRecord(o.lock ?? version.lock)
  const checkedOut = Boolean(
    o.checkedOut === true ||
      o.isCheckedOut === true ||
      o.checkedOut === 'yes' ||
      o.isCheckedOut === 'yes' ||
      lock.lockedBy ||
      checkoutUser.id ||
      checkoutUser.name ||
      isCheckoutArticleState(version.articleState ?? version.state ?? o.articleState),
  )

  return {
    id: pickString(o.id, o.articleId) ?? '',
    name:
      pickString(version.name, o.name, o.articleName, o.title, o.alternateId) ??
      'Untitled article',
    alternateId: pickString(o.alternateId),
    folderId: pickString(folder.id, o.folderId) ?? folderIdFallback ?? '',
    status: mapStatus(
      version.articleState ??
        version.state ??
        version.status ??
        o.state ??
        o.status ??
        o.articleState ??
        o.availability,
    ),
    articleType: pickString(
      versionType.name,
      asRecord(o.articleType).name,
      version.articleType,
      o.articleType,
      o.type,
    ),
    author: pickString(
      createdBy.name,
      createdBy.userName,
      o.author,
      o.createdBy,
    ),
    createdBy: pickString(createdBy.name, createdBy.userName, o.createdBy),
    createdDate: pickDate(o, 'created', 'createdDate'),
    lastModifiedBy: pickString(lastModBy.name, lastModBy.userName, o.lastModifiedBy),
    // Only version lastModified — article-level date is a different field.
    lastModifiedDate: extractVersionLastModified(o),
    language: pickString(lang.code, o.language, o.$lang) ?? 'en-us',
    checkedOut,
    checkedOutBy: pickString(
      checkoutUser.name,
      checkoutUser.screenName,
      checkoutUser.userName,
      checkoutUser.loginId,
      typeof o.checkedOutBy === 'string' ? o.checkedOutBy : undefined,
    ),
    checkedOutById: pickString(
      checkoutUser.id,
      checkoutUser.userId,
      checkoutUser.loginId,
      checkoutUser.userName,
    ),
    version: pickString(
      version.versionNumber,
      version.number,
      o.versionNumber,
    ),
    versionId: pickString(version.id, version.versionId),
    includeInGenAI:
      o.includeInGenAI === true ||
      o.includeInGenAI === 'yes' ||
      o.includeInGenAi === true ||
      asRecord(o.genAI).include === true,
  }
}

export function mapArticleDetail(raw: unknown, folderIdFallback?: string): ArticleDetail {
  const summary = mapArticleSummary(raw, folderIdFallback)
  const o = asRecord(raw)
  const version = pickLatestVersion(o)
  const contentObj = asRecord(
    version.content ?? version.contents ?? o.content ?? o.contents,
  )
  const content =
    pickString(
      contentObj.text,
      contentObj.html,
      version.content,
      o.content,
      o.articleContent,
    ) ?? ''

  const attachments = unwrapList(o.attachments ?? o.attachment, ['attachment']).map(
    (a): AttachmentRef => {
      const x = asRecord(a)
      return {
        id: pickString(x.id) ?? '',
        name: pickString(x.name, x.fileName) ?? 'attachment',
        size: Number(x.size ?? x.contentLength) || undefined,
        contentType: pickString(x.contentType, x.mimeType),
        createdDate: pickDate(x, 'created', 'createdDate'),
      }
    },
  )

  const topics = unwrapList(o.topics ?? o.topic, ['topic']).map((t): TopicRef => {
    const x = asRecord(t)
    return {
      id: pickString(x.id) ?? '',
      name: pickString(x.name) ?? '',
    }
  })

  const versions = unwrapList(o.versions ?? o.version, ['version']).map(
    (v): ArticleVersion => {
      const x = asRecord(v)
      return {
        id: pickString(x.id, x.versionId) ?? '',
        versionNumber: pickString(x.versionNumber, x.number, x.id),
        createdDate: pickDate(x, 'created', 'createdDate'),
        createdBy: pickString(asRecord(x.createdBy).name, x.createdBy),
        isPublished: Boolean(x.isPublished ?? x.published),
        label: pickString(x.label, x.name),
      }
    },
  )

  return {
    ...summary,
    content,
    summary: pickString(version.summary, o.summary),
    keywords: pickString(version.keywords, o.keywords),
    description: pickString(version.description, o.description),
    notes: pickString(o.notes, o.additionalInfo, o.internalNotes),
    publishDate: pickDate(version, 'availabilityDate', 'publishDate', 'published') ??
      pickDate(o, 'publishDate', 'published'),
    expiryDate: pickDate(version, 'expirationDate', 'expiryDate') ??
      pickDate(o, 'expiryDate', 'expirationDate'),
    availableDate: pickDate(version, 'availabilityDate', 'availableDate') ??
      pickDate(o, 'availableDate'),
    topics,
    attachments,
    versions,
    customAttributes: unwrapList(o.customAttributes ?? o.customAttribute, [
      'customAttribute',
    ]).map((c) => {
      const x = asRecord(c)
      return {
        name: pickString(x.name, x.attribName) ?? '',
        value: pickString(x.value, x.attribValue) ?? '',
      }
    }),
  }
}

export function mapArticleType(raw: unknown): ArticleType {
  const o = asRecord(raw)
  return {
    id: pickString(o.id) ?? pickString(o.name) ?? '',
    name: pickString(o.name, o.label) ?? 'General',
  }
}

/**
 * Resolve home department from a User resource.
 *
 * Real tenant shape (`$attribute=all`):
 * ```
 * departments: { department: [{ id: 1006, name: "...", home: "yes" }] }
 * ```
 * Older summary shape: `department: { id, name }`
 */
export function departmentFromUserRaw(raw: unknown): {
  departmentId?: string
  department?: string
} {
  const o = asRecord(raw)

  // Primary: departments.department[] with home === "yes"
  const deptBlock = asRecord(o.departments)
  const fromArray = (() => {
    const list = Array.isArray(deptBlock.department)
      ? (deptBlock.department as unknown[])
      : deptBlock.department && typeof deptBlock.department === 'object'
        ? [deptBlock.department]
        : unwrapList(deptBlock, ['department', 'departments'])

    if (list.length === 0) return undefined
    const home =
      list.find((d) => {
        const r = asRecord(d)
        const homeFlag = String(r.home ?? r.isHome ?? '').toLowerCase()
        return homeFlag === 'yes' || homeFlag === 'true' || r.home === true
      }) ?? list[0]
    const h = asRecord(home)
    const departmentId = pickString(h.id, h.departmentId)
    if (!departmentId) return undefined
    return {
      departmentId,
      department: pickString(h.name, h.departmentName),
    }
  })()
  if (fromArray) return fromArray

  // Fallback: singular department summary
  const single = asRecord(o.department ?? o.homeDepartment)
  const singleId = pickString(single.id, o.departmentId)
  if (singleId) {
    return {
      departmentId: singleId,
      department: pickString(single.name),
    }
  }

  // Last resort: department nested under a userProfile / aiProfile entry
  for (const key of ['userProfiles', 'aiProfiles', 'settingGroups'] as const) {
    const block = asRecord(o[key])
    const items = unwrapList(block, [
      'userProfile',
      'aiProfile',
      'settingGroup',
      key,
    ])
    for (const item of items) {
      const dept = asRecord(asRecord(item).department)
      const id = pickString(dept.id)
      if (id) {
        return { departmentId: id, department: pickString(dept.name) }
      }
    }
  }

  return {}
}

export function languagesFromUserRaw(raw: unknown): {
  languages: { code: string; label: string; isDefault?: boolean }[]
  defaultLanguage?: string
} {
  const o = asRecord(raw)
  const block = asRecord(o.languages)
  const list = Array.isArray(block.language)
    ? (block.language as unknown[])
    : block.language && typeof block.language === 'object'
      ? [block.language]
      : unwrapList(block, ['language', 'languages'])

  const languages: { code: string; label: string; isDefault?: boolean }[] = []
  for (const item of list) {
    const r = asRecord(item)
    const code = pickString(r.code, r.languageCode)
    if (!code) continue
    languages.push({
      code,
      label: pickString(r.label, r.name) ?? code,
      isDefault:
        r.isDefault === true ||
        String(r.isDefault).toLowerCase() === 'true' ||
        String(r.default).toLowerCase() === 'true',
    })
  }

  const defaultLanguage =
    languages.find((l) => l.isDefault)?.code || languages[0]?.code || undefined

  return { languages, defaultLanguage }
}

export function mapUser(raw: unknown): UserProfile {
  const o = asRecord(raw)
  const { departmentId, department } = departmentFromUserRaw(raw)
  const { languages, defaultLanguage } = languagesFromUserRaw(raw)
  return {
    id: pickString(o.id, o.userId, o.objectId) ?? 'user',
    userName: pickString(o.loginId, o.loginID, o.userName, o.name) ?? 'user',
    firstName: pickString(o.firstName),
    lastName: pickString(o.lastName),
    screenName: pickString(o.screenName),
    email: pickString(o.emailAddress, o.email),
    department,
    departmentId,
    languages: languages.length > 0 ? languages : undefined,
    defaultLanguage,
  }
}

/** Pull department id from a folder/article payload when present. */
export function pickDepartmentId(raw: unknown): string | undefined {
  const o = asRecord(raw)
  return pickString(asRecord(o.department).id, o.departmentId)
}

export function buildFolderTree(flat: FolderNode[]): FolderNode[] {
  // Flatten first so nested `$level=-1` payloads don't lose descendants
  // when we rebuild from parentId links.
  const flattened = flattenFolderNodes(flat)
  const map = new Map<string, FolderNode>()
  flattened.forEach((f) => map.set(f.id, { ...f, children: [] }))

  const roots: FolderNode[] = []
  for (const folder of map.values()) {
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children!.push(folder)
    } else {
      roots.push(folder)
    }
  }

  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => n.children && sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

/** Flatten a possibly nested folder list; assign parentId from nest when missing. */
export function flattenFolderNodes(
  nodes: FolderNode[],
  parentId: string | null = null,
  acc: FolderNode[] = [],
): FolderNode[] {
  for (const n of nodes) {
    const id = n.id
    if (!id) continue
    const resolvedParent = n.parentId ?? parentId
    acc.push({ ...n, parentId: resolvedParent, children: undefined })
    if (n.children?.length) {
      flattenFolderNodes(n.children, id, acc)
    }
  }
  return acc
}

/** Find a folder by name (case-insensitive) anywhere in a tree. */
export function findFolderByName(
  nodes: FolderNode[],
  name: string,
): FolderNode | undefined {
  const needle = name.trim().toLowerCase()
  for (const n of nodes) {
    if (n.name.trim().toLowerCase() === needle) return n
    if (n.children?.length) {
      const hit = findFolderByName(n.children, name)
      if (hit) return hit
    }
  }
  return undefined
}

/** Collect every folder id under a tree (including roots). */
export function collectFolderIds(nodes: FolderNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(n.id)
    if (n.children?.length) collectFolderIds(n.children, acc)
  }
  return acc
}

/**
 * Build the subtree of descendants of `rootId` from a flat list,
 * returning roots that are direct children of `rootId`.
 * Nodes outside that subtree (e.g. under Personal) are omitted.
 */
export function buildSubtreeUnder(
  flat: FolderNode[],
  rootId: string,
): FolderNode[] {
  const map = new Map<string, FolderNode>()
  flat.forEach((f) => map.set(f.id, { ...f, children: [] }))

  const roots: FolderNode[] = []
  for (const folder of map.values()) {
    if (folder.id === rootId) continue
    if (folder.parentId === rootId) {
      roots.push(folder)
    } else if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children!.push(folder)
    }
  }

  // Drop branches that never hang off rootId (e.g. Personal subtree)
  const reachable = new Set<string>()
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      reachable.add(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(roots)
  for (const n of map.values()) {
    if (n.children) {
      n.children = n.children.filter((c) => reachable.has(c.id))
    }
  }

  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((n) => n.children && sortRec(n.children))
  }
  sortRec(roots)
  return roots
}
