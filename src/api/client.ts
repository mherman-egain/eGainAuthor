import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  ArticleVersion,
  AttachmentRef,
  CreateArticleInput,
  CreateFolderInput,
  EditArticleInput,
  EditFolderInput,
  FolderNode,
  UserProfile,
} from '@/types'
import type { RequestAuth } from './http'
import * as authApi from './auth'
import * as foldersApi from './folders'
import * as articlesApi from './articles'
import { getDemoStore, resetDemoStore } from './demo/demoAdapter'

export type ApiClient = {
  mode: 'live' | 'demo'
  auth: RequestAuth
  getFolderTree: () => Promise<FolderNode[]>
  /** Load remaining child pages for a folder that still has `hasMoreChildren`. */
  loadMoreFolderChildren: (folder: FolderNode) => Promise<FolderNode>
  createFolder: (input: CreateFolderInput) => Promise<FolderNode>
  editFolder: (input: EditFolderInput) => Promise<FolderNode>
  deleteFolder: (id: string) => Promise<void>
  moveFolder: (folderId: string, destinationParentId: string) => Promise<void>
  copyFolder: (folderId: string, destinationParentId: string) => Promise<FolderNode | void>
  listArticles: (folderId: string, language?: string) => Promise<ArticleSummary[]>
  getArticle: (id: string, language?: string) => Promise<ArticleDetail>
  createArticle: (input: CreateArticleInput) => Promise<ArticleDetail>
  editArticle: (input: EditArticleInput) => Promise<ArticleDetail>
  deleteArticle: (id: string, language?: string) => Promise<void>
  deleteArticles: (ids: string[], language?: string) => Promise<void>
  moveArticle: (id: string, destinationFolderId: string) => Promise<void>
  moveArticles: (ids: string[], destinationFolderId: string) => Promise<void>
  copyArticle: (
    id: string,
    destinationFolderId: string,
    language?: string,
  ) => Promise<ArticleDetail | void>
  copyArticles: (
    ids: string[],
    destinationFolderId: string,
    language?: string,
  ) => Promise<ArticleDetail[]>
  checkout: (
    id: string,
    lastModifiedDate?: string,
    language?: string,
  ) => Promise<ArticleDetail>
  checkin: (
    id: string,
    lastModifiedDate?: string,
    language?: string,
  ) => Promise<ArticleDetail>
  publish: (
    id: string,
    lastModifiedDate?: string,
    language?: string,
  ) => Promise<ArticleDetail>
  getVersions: (id: string, language?: string) => Promise<ArticleVersion[]>
  listArticleTypes: () => Promise<ArticleType[]>
  getAttachments: (id: string, language?: string) => Promise<AttachmentRef[]>
  getNotes: (id: string, language?: string) => Promise<string>
  searchArticles: (query: string, language?: string) => Promise<ArticleSummary[]>
  fetchCurrentUser: () => Promise<UserProfile | null>
  logout: () => Promise<void>
}

export function createDemoClient(): ApiClient {
  const store = resetDemoStore()
  const auth: RequestAuth = {
    serverUrl: 'demo://local',
    demoMode: true,
  }

  return {
    mode: 'demo',
    auth,
    getFolderTree: async () => store.getFolderTree(),
    loadMoreFolderChildren: async (folder) => ({
      ...folder,
      hasMoreChildren: false,
      childrenNextPage: undefined,
    }),
    createFolder: async (input) => store.createFolder(input),
    editFolder: async (input) => store.editFolder(input),
    deleteFolder: async (id) => store.deleteFolder(id),
    moveFolder: async (folderId, dest) => {
      store.moveFolder(folderId, dest)
    },
    copyFolder: async (folderId, dest) => store.copyFolder(folderId, dest),
    listArticles: async (folderId) => store.listArticles(folderId),
    getArticle: async (id) => store.getArticle(id),
    createArticle: async (input) => store.createArticle(input),
    editArticle: async (input) => store.editArticle(input),
    deleteArticle: async (id) => store.deleteArticle(id),
    deleteArticles: async (ids) => {
      for (const id of ids) store.deleteArticle(id)
    },
    moveArticle: async (id, dest) => {
      store.moveArticle(id, dest)
    },
    moveArticles: async (ids, dest) => {
      for (const id of ids) store.moveArticle(id, dest)
    },
    copyArticle: async (id, dest) => store.copyArticle(id, dest),
    copyArticles: async (ids, dest) =>
      ids.map((id) => store.copyArticle(id, dest)),
    checkout: async (id) => store.checkout(id),
    checkin: async (id) => store.checkin(id),
    publish: async (id) => store.publish(id),
    getVersions: async (id) => store.getArticle(id).versions ?? [],
    listArticleTypes: async () => store.articleTypes,
    getAttachments: async (id) => store.getArticle(id).attachments ?? [],
    getNotes: async (id) => store.getArticle(id).notes ?? '',
    searchArticles: async (query) => store.searchArticles(query),
    fetchCurrentUser: async () => store.user, // demo: already has departmentId
    logout: async () => {
      resetDemoStore()
    },
  }
}

export function createLiveClient(auth: RequestAuth): ApiClient {
  return {
    mode: 'live',
    auth,
    getFolderTree: () => foldersApi.getFolderTree(auth),
    loadMoreFolderChildren: (folder) =>
      foldersApi.loadMoreFolderChildren(auth, folder),
    createFolder: (input) => foldersApi.createFolder(auth, input),
    editFolder: (input) => foldersApi.editFolder(auth, input),
    deleteFolder: (id) => foldersApi.deleteFolder(auth, id),
    moveFolder: async (folderId, dest) => {
      await foldersApi.moveFolder(auth, folderId, dest)
    },
    copyFolder: (folderId, dest) => foldersApi.copyFolder(auth, folderId, dest),
    listArticles: (folderId, language) =>
      articlesApi.listArticlesInFolder(auth, folderId, language),
    getArticle: (id, language) => articlesApi.getArticle(auth, id, language),
    createArticle: (input) => articlesApi.createArticle(auth, input),
    editArticle: (input) => articlesApi.editArticle(auth, input),
    deleteArticle: (id, language) => articlesApi.deleteArticle(auth, id, language),
    deleteArticles: (ids, language) =>
      articlesApi.deleteArticles(auth, ids, language),
    moveArticle: async (id, dest) => {
      await articlesApi.moveArticles(auth, [id], dest)
    },
    moveArticles: (ids, dest) => articlesApi.moveArticles(auth, ids, dest),
    copyArticle: (id, dest, language) =>
      articlesApi.copyArticle(auth, id, dest, language),
    copyArticles: (ids, dest, language) =>
      articlesApi.copyArticles(auth, ids, dest, language),
    checkout: (id, lastModifiedDate, language) =>
      articlesApi.checkoutArticle(auth, id, lastModifiedDate, language),
    checkin: (id, lastModifiedDate, language) =>
      articlesApi.checkinArticle(auth, id, lastModifiedDate, language),
    publish: (id, lastModifiedDate, language) =>
      articlesApi.publishArticle(auth, id, lastModifiedDate, language),
    getVersions: (id, language) => articlesApi.getArticleVersions(auth, id, language),
    listArticleTypes: () => articlesApi.listArticleTypes(auth),
    getAttachments: (id, language) =>
      articlesApi.getArticleAttachments(auth, id, language),
    getNotes: (id, language) => articlesApi.getArticleNotes(auth, id, language),
    searchArticles: (query, language) =>
      articlesApi.searchArticles(auth, query, language),
    fetchCurrentUser: async () => {
      // Prefer login id from session if caller has one in auth.serverUrl context — not available here.
      // Console uses resolveLoggedInUser at login time; this is a best-effort refresh.
      const result = await authApi.fetchCurrentUser(auth)
      return result.user
    },
    logout: () => authApi.sessionLogout(auth),
  }
}

export function getOrCreateDemoStoreUser() {
  return getDemoStore().user
}
