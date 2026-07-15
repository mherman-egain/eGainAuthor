import type { CreateFolderInput, EditFolderInput, FolderNode } from '@/types'
import { apiRequest, proxyWs, wsPath, type RequestAuth } from './http'
import {
  findFolderByName,
  mapFolder,
  pickDepartmentId,
  unwrapList,
} from './mappers'

const PAGE_SIZE = 75

/** Department Shared folder id from the last successful getFolderTree call. */
let sharedFolderIdCache: string | undefined

export function getSharedFolderId(): string | undefined {
  return sharedFolderIdCache
}

function resolveDepartmentId(auth: RequestAuth): string | undefined {
  return auth.departmentId
}

function sortFolderTree(nodes: FolderNode[]): FolderNode[] {
  return [...nodes].sort((a, b) => a.name.localeCompare(b.name))
}

function mergeChildren(existing: FolderNode[], incoming: FolderNode[]): FolderNode[] {
  const byId = new Map(existing.map((c) => [c.id, c]))
  for (const child of incoming) {
    byId.set(child.id, { ...byId.get(child.id), ...child })
  }
  return [...byId.values()]
}

type PageResult = {
  folders: FolderNode[]
  count: number
  pagenum: number
  pagesize: number
  nextHref?: string
}

function readCollectionPagination(data: unknown): {
  count: number
  pagenum: number
  pagesize: number
  nextHref?: string
} {
  const root = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >
  const info = (
    root.paginationInfo && typeof root.paginationInfo === 'object'
      ? root.paginationInfo
      : {}
  ) as Record<string, unknown>
  const count = Number(info.count ?? root.count ?? 0)
  const pagenum = Number(info.pagenum ?? 1)
  const pagesize = Number(info.pagesize ?? PAGE_SIZE)

  let nextHref: string | undefined
  const link = root.link
  const links = Array.isArray(link) ? link : link ? [link] : []
  for (const item of links) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    if (String(l.rel ?? '').toLowerCase() === 'next' && typeof l.href === 'string') {
      nextHref = l.href
      break
    }
  }

  return { count, pagenum, pagesize, nextHref }
}

/**
 * One page of **direct** children only.
 * Do not use `$level=-1` here — expanding the full Shared tree times out (504).
 */
async function fetchChildrenPage(
  auth: RequestAuth,
  parentId: string,
  pagenum: number,
): Promise<PageResult> {
  // Avoid `$attribute=all` on large collections — it can 504 on busy tenants.
  const data = await apiRequest(
    auth,
    `${wsPath('kb/folder')}?parent=${encodeURIComponent(parentId)}&$pagesize=${PAGE_SIZE}&$pagenum=${pagenum}`,
    { method: 'GET' },
  )
  const folders = unwrapList(data, ['folder', 'folders']).map(mapFolder)
  const page = readCollectionPagination(data)
  return {
    folders,
    count: page.count || folders.length,
    pagenum: page.pagenum || pagenum,
    pagesize: page.pagesize || PAGE_SIZE,
    nextHref: page.nextHref,
  }
}

async function fetchViaHref(auth: RequestAuth, href: string): Promise<PageResult> {
  let path = href
  try {
    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href)
      path = proxyWs(`${u.pathname}${u.search}`)
    } else if (href.startsWith('/ws/') || href.startsWith('/system/')) {
      path = proxyWs(href)
    } else if (!href.startsWith('/api-proxy')) {
      path = proxyWs(href.startsWith('/') ? href : `/${href}`)
    }
  } catch {
    path = href
  }

  const data = await apiRequest(auth, path, { method: 'GET' })
  const folders = unwrapList(data, ['folder', 'folders']).map(mapFolder)
  const page = readCollectionPagination(data)
  return {
    folders,
    count: page.count || folders.length,
    pagenum: page.pagenum || 1,
    pagesize: page.pagesize || PAGE_SIZE,
    nextHref: page.nextHref,
  }
}

/**
 * Mark folders so the UI can expand them and load children on demand.
 * Direct children from a one-level GET are not nested yet.
 */
function asExpandableNodes(
  folders: FolderNode[],
  parentId: string,
): FolderNode[] {
  return sortFolderTree(
    folders.map((f) => {
      const knownCount = f.childCount
      const nested = f.children?.length ?? 0
      // Nested children shouldn't appear on a shallow parent= GET; strip if present
      // so we always load one level at a time.
      const hasKnownChildren = knownCount != null && knownCount > 0
      return {
        ...f,
        parentId: f.parentId ?? parentId,
        children: [],
        // If childCount is unknown, allow expand so we can probe; if 0, leaf.
        hasMoreChildren: knownCount == null ? true : hasKnownChildren || nested > 0,
        childrenNextPage: 1,
        childCount: knownCount,
      }
    }),
  )
}

/** Load every page of direct children under parentId (shallow — no $level=-1). */
async function loadAllDirectChildren(
  auth: RequestAuth,
  parentId: string,
): Promise<FolderNode[]> {
  let children: FolderNode[] = []
  let page = 1
  let count = Infinity
  let guard = 0

  while (children.length < count && guard < 50) {
    guard += 1
    const result = await fetchChildrenPage(auth, parentId, page)
    children = mergeChildren(children, result.folders)
    count = result.count || children.length

    if (result.nextHref && children.length < count) {
      const next = await fetchViaHref(auth, result.nextHref)
      children = mergeChildren(children, next.folders)
      count = next.count || count
      page = (next.pagenum || page) + 1
      continue
    }

    if (children.length >= count || result.folders.length === 0) break
    page += 1
  }

  return asExpandableNodes(children, parentId)
}

/**
 * Resolve Shared folder id via a shallow department listing (Personal + Shared only).
 * Never walks Personal's tree.
 */
async function findSharedFolderId(
  auth: RequestAuth,
  departmentId: string,
): Promise<string> {
  const data = await apiRequest(
    auth,
    `${wsPath('kb/folder')}?department=${encodeURIComponent(departmentId)}&$pagesize=${PAGE_SIZE}&$pagenum=1`,
    { method: 'GET' },
  )
  const roots = unwrapList(data, ['folder', 'folders']).map(mapFolder)
  const shared =
    roots.find((f) => f.name.trim().toLowerCase() === 'shared') ||
    findFolderByName(roots, 'Shared')

  if (!shared?.id) {
    throw new Error(
      'Could not find the department "Shared" folder. Personal is ignored; Shared is required.',
    )
  }
  return shared.id
}

/**
 * Load folders under Shared only (Personal ignored).
 *
 * Uses shallow `parent=` pages (`$pagesize=75`) — not `$level=-1`, which 504s
 * on large Shared trees. Deeper levels load when the user expands a folder.
 */
export async function getFolderTree(auth: RequestAuth): Promise<FolderNode[]> {
  const departmentId = resolveDepartmentId(auth)
  if (!departmentId) {
    throw new Error(
      'Cannot load folders: logged-in user has no home department id (departments.department[].id). Re-login so the user profile can be loaded.',
    )
  }

  const sharedId = await findSharedFolderId(auth, departmentId)
  sharedFolderIdCache = sharedId
  return loadAllDirectChildren(auth, sharedId)
}

/**
 * Load remaining / initial child pages for a folder when it is expanded.
 * Shallow pages only (no `$level=-1`).
 */
export async function loadMoreFolderChildren(
  auth: RequestAuth,
  folder: FolderNode,
): Promise<FolderNode> {
  // Already have a complete child list
  if (
    !folder.hasMoreChildren &&
    folder.children &&
    folder.children.length > 0 &&
    folder.childrenNextPage == null
  ) {
    return folder
  }

  // If children were never loaded, fetch all direct child pages
  if (
    folder.childrenNextPage === 1 ||
    (!folder.children?.length && folder.hasMoreChildren)
  ) {
    const children = await loadAllDirectChildren(auth, folder.id)
    return {
      ...folder,
      children,
      childCount: children.length,
      hasMoreChildren: false,
      childrenNextPage: undefined,
    }
  }

  // Append remaining pages onto an existing partial list
  let children = [...(folder.children ?? [])]
  let page = folder.childrenNextPage ?? Math.floor(children.length / PAGE_SIZE) + 1
  let count = folder.childCount ?? Infinity
  let guard = 0

  while (children.length < count && guard < 50) {
    guard += 1
    const result = await fetchChildrenPage(auth, folder.id, page)
    children = mergeChildren(children, result.folders)
    count = result.count || children.length

    if (result.nextHref && children.length < count) {
      const next = await fetchViaHref(auth, result.nextHref)
      children = mergeChildren(children, next.folders)
      count = next.count || count
      page = (next.pagenum || page) + 1
      continue
    }

    if (children.length >= count || result.folders.length === 0) break
    page += 1
  }

  return {
    ...folder,
    children: asExpandableNodes(children, folder.id),
    childCount: count === Infinity ? children.length : count,
    hasMoreChildren: false,
    childrenNextPage: undefined,
  }
}

export function replaceFolderInTree(
  nodes: FolderNode[],
  updated: FolderNode,
): FolderNode[] {
  return nodes.map((n) => {
    if (n.id === updated.id) return updated
    if (n.children?.length) {
      return { ...n, children: replaceFolderInTree(n.children, updated) }
    }
    return n
  })
}

export function findFolderInTree(
  nodes: FolderNode[],
  id: string,
): FolderNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const hit = findFolderInTree(n.children, id)
      if (hit) return hit
    }
  }
  return undefined
}

export async function getChildFolders(
  auth: RequestAuth,
  parentId: string,
): Promise<FolderNode[]> {
  return loadAllDirectChildren(auth, parentId)
}

export async function getFolder(
  auth: RequestAuth,
  folderId: string,
): Promise<FolderNode> {
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/folder/${folderId}`)}?$attribute=all`,
    { method: 'GET' },
  )
  const list = unwrapList(data, ['folder'])
  return mapFolder(list[0] ?? data)
}

export async function discoverDepartmentId(
  auth: RequestAuth,
  seedFolderId?: string,
): Promise<string | undefined> {
  if (auth.departmentId) return auth.departmentId
  if (!seedFolderId) return undefined
  try {
    const data = await apiRequest(
      auth,
      `${wsPath(`kb/folder/${seedFolderId}`)}?$attribute=all`,
      { method: 'GET' },
    )
    const list = unwrapList(data, ['folder'])
    return pickDepartmentId(list[0] ?? data)
  } catch {
    return undefined
  }
}

export async function createFolder(
  auth: RequestAuth,
  input: CreateFolderInput,
): Promise<FolderNode> {
  const departmentId = resolveDepartmentId(auth)
  const parentId = input.parentId || sharedFolderIdCache
  const body = {
    folder: {
      name: input.name,
      description: input.description,
      ...(parentId
        ? { parent: { id: parentId } }
        : departmentId
          ? { department: { id: departmentId } }
          : {}),
    },
  }
  const data = await apiRequest(auth, `${wsPath('kb/folder')}?$attribute=all`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const list = unwrapList(data, ['folder'])
  return mapFolder(list[0] ?? data)
}

export async function editFolder(
  auth: RequestAuth,
  input: EditFolderInput,
): Promise<FolderNode> {
  const body = {
    folder: {
      id: input.id,
      name: input.name,
      description: input.description,
      lastModified: input.lastModifiedDate
        ? { date: input.lastModifiedDate }
        : undefined,
    },
  }
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/folder/${input.id}`)}?$attribute=all`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  )
  const list = unwrapList(data, ['folder'])
  return mapFolder(list[0] ?? data)
}

export async function deleteFolder(
  auth: RequestAuth,
  folderId: string,
): Promise<void> {
  await apiRequest(auth, wsPath(`kb/folder/${folderId}`), {
    method: 'DELETE',
  })
}

export async function moveFolder(
  auth: RequestAuth,
  folderId: string,
  destinationParentId: string,
  merge = false,
): Promise<FolderNode | void> {
  const body = {
    folder: {
      id: destinationParentId,
    },
  }
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/folder/move/${folderId}`)}?merge=${merge ? 1 : 0}&$attribute=all`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  if (!data) return
  const list = unwrapList(data, ['folder'])
  return mapFolder(list[0] ?? data)
}

export async function copyFolder(
  auth: RequestAuth,
  folderId: string,
  destinationParentId: string,
): Promise<FolderNode | void> {
  const body = {
    folder: {
      id: destinationParentId,
    },
  }
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/folder/copy/${folderId}`)}?$attribute=all`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  if (!data) return
  const list = unwrapList(data, ['folder'])
  return mapFolder(list[0] ?? data)
}
