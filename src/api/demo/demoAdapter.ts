import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  CreateArticleInput,
  CreateFolderInput,
  EditArticleInput,
  EditFolderInput,
  FolderNode,
  UserProfile,
} from '@/types'
import {
  DEMO_SHARED_FOLDER_ID,
  demoArticleTypes,
  demoUser,
  nextId,
  seedArticles,
  seedFolders,
} from './demoData'

function cloneFolders(nodes: FolderNode[]): FolderNode[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children ? cloneFolders(n.children) : undefined,
  }))
}

function findFolder(
  nodes: FolderNode[],
  id: string,
): { node: FolderNode; parent: FolderNode | null } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, parent: null }
    if (node.children) {
      for (const child of node.children) {
        if (child.id === id) return { node: child, parent: node }
        const nested = findFolder([child], id)
        if (nested) {
          if (nested.parent === null && nested.node.id !== child.id) {
            return nested
          }
          if (nested.node.id === id) {
            return nested.parent ? nested : { node: nested.node, parent: child }
          }
        }
      }
      const deep = findInChildren(node, id)
      if (deep) return deep
    }
  }
  return null
}

function findInChildren(
  parent: FolderNode,
  id: string,
): { node: FolderNode; parent: FolderNode } | null {
  if (!parent.children) return null
  for (const child of parent.children) {
    if (child.id === id) return { node: child, parent }
    const nested = findInChildren(child, id)
    if (nested) return nested
  }
  return null
}

function flattenFolders(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = []
  const walk = (list: FolderNode[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export class DemoStore {
  folders: FolderNode[]
  articles: ArticleDetail[]
  user: UserProfile
  articleTypes: ArticleType[]

  constructor() {
    this.folders = cloneFolders(seedFolders())
    this.articles = seedArticles().map((a) => ({ ...a }))
    this.user = { ...demoUser }
    this.articleTypes = [...demoArticleTypes]
  }

  getFolderTree(): FolderNode[] {
    return cloneFolders(this.folders)
  }

  createFolder(input: CreateFolderInput): FolderNode {
    const parentId = input.parentId || DEMO_SHARED_FOLDER_ID
    // Root of the demo tree is Shared's children (Shared itself is hidden)
    if (parentId === DEMO_SHARED_FOLDER_ID) {
      const node: FolderNode = {
        id: nextId('f-'),
        name: input.name,
        parentId: DEMO_SHARED_FOLDER_ID,
        path: `/Shared/${input.name}`,
        description: input.description,
        articleCount: 0,
        children: [],
        createdDate: new Date().toISOString(),
        lastModifiedDate: new Date().toISOString(),
      }
      this.folders.push(node)
      return { ...node }
    }

    const found = findFolder(this.folders, parentId)
    const parent = found?.node
    if (!parent) throw new Error('Parent folder not found')
    const node: FolderNode = {
      id: nextId('f-'),
      name: input.name,
      parentId,
      path: `${parent.path ?? ''}/${input.name}`,
      description: input.description,
      articleCount: 0,
      children: [],
      createdDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
    }
    parent.children = parent.children ?? []
    parent.children.push(node)
    return { ...node }
  }

  editFolder(input: EditFolderInput): FolderNode {
    const found = findFolder(this.folders, input.id)
    if (!found) throw new Error('Folder not found')
    found.node.name = input.name
    if (input.description !== undefined) found.node.description = input.description
    found.node.lastModifiedDate = new Date().toISOString()
    return { ...found.node, children: undefined }
  }

  deleteFolder(id: string): void {
    if (id === DEMO_SHARED_FOLDER_ID) throw new Error('Cannot delete the Shared folder')

    const topIndex = this.folders.findIndex((f) => f.id === id)
    if (topIndex >= 0) {
      const [removed] = this.folders.splice(topIndex, 1)
      const removeIds = new Set(flattenFolders([removed]).map((f) => f.id))
      this.articles = this.articles.filter((a) => !removeIds.has(a.folderId))
      return
    }

    const found = findFolder(this.folders, id)
    if (!found?.parent) throw new Error('Folder not found')
    found.parent.children = (found.parent.children ?? []).filter((c) => c.id !== id)
    const removeIds = new Set(flattenFolders([found.node]).map((f) => f.id))
    this.articles = this.articles.filter((a) => !removeIds.has(a.folderId))
  }

  moveFolder(folderId: string, destinationParentId: string): FolderNode {
    const destIsShared = destinationParentId === DEMO_SHARED_FOLDER_ID
    const dest = destIsShared
      ? null
      : findFolder(this.folders, destinationParentId)
    if (!destIsShared && !dest) throw new Error('Invalid move')

    const topIndex = this.folders.findIndex((f) => f.id === folderId)
    let moving: FolderNode
    if (topIndex >= 0) {
      ;[moving] = this.folders.splice(topIndex, 1)
    } else {
      const found = findFolder(this.folders, folderId)
      if (!found?.parent) throw new Error('Invalid move')
      found.parent.children = (found.parent.children ?? []).filter((c) => c.id !== folderId)
      moving = found.node
    }

    moving.parentId = destinationParentId
    if (destIsShared) {
      moving.path = `/Shared/${moving.name}`
      this.folders.push(moving)
    } else {
      moving.path = `${dest!.node.path ?? ''}/${moving.name}`
      dest!.node.children = dest!.node.children ?? []
      dest!.node.children.push(moving)
    }
    return { ...moving, children: undefined }
  }

  copyFolder(folderId: string, destinationParentId: string): FolderNode {
    const found = findFolder(this.folders, folderId)
    const dest = findFolder(this.folders, destinationParentId)
    if (!found || !dest) throw new Error('Invalid copy')
    const copy: FolderNode = {
      ...found.node,
      id: nextId('f-'),
      name: `${found.node.name} (Copy)`,
      parentId: destinationParentId,
      path: `${dest.node.path ?? ''}/${found.node.name} (Copy)`,
      children: [],
      createdDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
    }
    dest.node.children = dest.node.children ?? []
    dest.node.children.push(copy)
    return { ...copy }
  }

  listArticles(folderId: string): ArticleSummary[] {
    return this.articles
      .filter((a) => a.folderId === folderId)
      .map((a) => stripContent(a))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getArticle(id: string): ArticleDetail {
    const a = this.articles.find((x) => x.id === id)
    if (!a) throw new Error('Article not found')
    return { ...a, content: a.content, attachments: [...(a.attachments ?? [])] }
  }

  createArticle(input: CreateArticleInput): ArticleDetail {
    const article: ArticleDetail = {
      id: nextId('a-'),
      name: input.name,
      alternateId: `KB-${nextId('')}`,
      folderId: input.folderId,
      status: 'draft',
      articleType: input.articleType ?? 'General',
      author: `${this.user.firstName} ${this.user.lastName}`,
      createdBy: `${this.user.firstName} ${this.user.lastName}`,
      createdDate: new Date().toISOString(),
      lastModifiedBy: `${this.user.firstName} ${this.user.lastName}`,
      lastModifiedDate: new Date().toISOString(),
      language: input.language ?? 'en-us',
      checkedOut: true,
      checkedOutBy: `${this.user.firstName} ${this.user.lastName}`,
      version: '1',
      includeInGenAI: false,
      content: input.content ?? '<p></p>',
      summary: input.summary,
      keywords: input.keywords,
      description: input.description,
      notes: '',
      topics: [],
      attachments: [],
      versions: [
        {
          id: nextId('v-'),
          versionNumber: 1,
          createdDate: new Date().toISOString(),
          createdBy: `${this.user.firstName} ${this.user.lastName}`,
          isPublished: false,
        },
      ],
      customAttributes: [],
    }
    this.articles.push(article)
    return { ...article }
  }

  editArticle(input: EditArticleInput): ArticleDetail {
    const a = this.articles.find((x) => x.id === input.id)
    if (!a) throw new Error('Article not found')
    if (input.name !== undefined) a.name = input.name
    if (input.content !== undefined) a.content = input.content
    if (input.description !== undefined) a.description = input.description
    if (input.keywords !== undefined) a.keywords = input.keywords
    if (input.summary !== undefined) a.summary = input.summary
    if (input.notes !== undefined) a.notes = input.notes
    if (input.includeInGenAI !== undefined) a.includeInGenAI = input.includeInGenAI
    if (input.articleType !== undefined) a.articleType = input.articleType
    if (input.customAttributes) a.customAttributes = input.customAttributes
    a.lastModifiedDate = new Date().toISOString()
    a.lastModifiedBy = `${this.user.firstName} ${this.user.lastName}`
    return { ...a }
  }

  deleteArticle(id: string): void {
    this.articles = this.articles.filter((a) => a.id !== id)
  }

  moveArticle(id: string, destinationFolderId: string): ArticleDetail {
    const a = this.articles.find((x) => x.id === id)
    if (!a) throw new Error('Article not found')
    a.folderId = destinationFolderId
    a.lastModifiedDate = new Date().toISOString()
    return { ...a }
  }

  copyArticle(id: string, destinationFolderId?: string): ArticleDetail {
    const a = this.articles.find((x) => x.id === id)
    if (!a) throw new Error('Article not found')
    const copy: ArticleDetail = {
      ...a,
      id: nextId('a-'),
      name: `${a.name} (Copy)`,
      alternateId: `KB-${nextId('')}`,
      folderId: destinationFolderId ?? a.folderId,
      status: 'draft',
      checkedOut: true,
      checkedOutBy: `${this.user.firstName} ${this.user.lastName}`,
      includeInGenAI: false,
      createdDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
      versions: [],
    }
    this.articles.push(copy)
    return { ...copy }
  }

  checkout(id: string): ArticleDetail {
    const a = this.getArticle(id)
    a.checkedOut = true
    a.checkedOutBy = `${this.user.firstName} ${this.user.lastName}`
    a.checkedOutById = this.user.id
    a.lastModifiedDate = new Date().toISOString()
    const idx = this.articles.findIndex((x) => x.id === id)
    this.articles[idx] = a
    return a
  }

  checkin(id: string): ArticleDetail {
    const a = this.getArticle(id)
    a.checkedOut = false
    a.checkedOutBy = undefined
    a.checkedOutById = undefined
    a.lastModifiedDate = new Date().toISOString()
    const idx = this.articles.findIndex((x) => x.id === id)
    this.articles[idx] = a
    return a
  }

  publish(id: string): ArticleDetail {
    const a = this.getArticle(id)
    a.status = 'live'
    a.checkedOut = false
    a.checkedOutBy = undefined
    a.checkedOutById = undefined
    a.lastModifiedDate = new Date().toISOString()
    a.publishDate = new Date().toISOString()
    a.includeInGenAI = a.includeInGenAI ?? true
    a.versions = [
      {
        id: nextId('v-'),
        versionNumber: Number(a.version ?? 0) + 1,
        createdDate: new Date().toISOString(),
        createdBy: `${this.user.firstName} ${this.user.lastName}`,
        isPublished: true,
      },
      ...(a.versions ?? []),
    ]
    a.version = String(Number(a.version ?? 0) + 1)
    const idx = this.articles.findIndex((x) => x.id === id)
    this.articles[idx] = a
    return a
  }

  searchArticles(query: string): ArticleSummary[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return this.articles
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.includes(q) ||
          a.alternateId?.toLowerCase().includes(q) ||
          a.keywords?.toLowerCase().includes(q),
      )
      .map(stripContent)
  }
}

function stripContent(a: ArticleDetail): ArticleSummary {
  const {
    content: _c,
    attachments: _a,
    topics: _t,
    versions: _v,
    customAttributes: _ca,
    notes: _n,
    summary: _s,
    keywords: _k,
    description: _d,
    publishDate: _p,
    expiryDate: _e,
    availableDate: _ad,
    ...summary
  } = a
  return summary
}

let singleton: DemoStore | null = null

export function getDemoStore(): DemoStore {
  if (!singleton) singleton = new DemoStore()
  return singleton
}

export function resetDemoStore(): DemoStore {
  singleton = new DemoStore()
  return singleton
}
