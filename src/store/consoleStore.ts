import { create } from 'zustand'
import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  FolderNode,
} from '@/types'
import {
  findFolderInTree,
  replaceFolderInTree,
} from '@/api/folders'
import { useSessionStore } from './sessionStore'
import { useToastStore } from './toastStore'

type ConsoleStore = {
  folders: FolderNode[]
  foldersLoading: boolean
  folderFilter: string
  selectedFolderId: string | null
  expandedFolderIds: Set<string>

  articles: ArticleSummary[]
  articlesLoading: boolean
  selectedArticleId: string | null
  articleDetail: ArticleDetail | null
  articleLoading: boolean
  articleDirty: boolean
  draftTitle: string
  draftContent: string

  articleTypes: ArticleType[]
  language: string
  propertiesOpen: boolean
  globalSearch: string
  searchResults: ArticleSummary[]
  searching: boolean

  mobilePanel: 'folders' | 'articles' | 'editor'

  loadFolders: () => Promise<void>
  selectFolder: (id: string | null) => Promise<void>
  toggleFolderExpanded: (id: string) => void
  ensureFolderChildren: (id: string) => Promise<void>
  setFolderFilter: (q: string) => void
  loadArticles: (folderId: string) => Promise<void>
  selectArticle: (id: string | null) => Promise<void>
  setDraftTitle: (title: string) => void
  setDraftContent: (html: string) => void
  markClean: () => void
  refreshArticle: () => Promise<void>
  setLanguage: (lang: string) => void
  setPropertiesOpen: (open: boolean) => void
  setMobilePanel: (panel: 'folders' | 'articles' | 'editor') => void
  setGlobalSearch: (q: string) => void
  runGlobalSearch: () => Promise<void>
  loadArticleTypes: () => Promise<void>
  resetConsole: () => void
}

function toastError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  useToastStore.getState().push({ type: 'error', message })
}

export const useConsoleStore = create<ConsoleStore>((set, get) => ({
  folders: [],
  foldersLoading: false,
  folderFilter: '',
  selectedFolderId: null,
  expandedFolderIds: new Set<string>(),

  articles: [],
  articlesLoading: false,
  selectedArticleId: null,
  articleDetail: null,
  articleLoading: false,
  articleDirty: false,
  draftTitle: '',
  draftContent: '',

  articleTypes: [],
  language: 'en-us',
  propertiesOpen: false,
  globalSearch: '',
  searchResults: [],
  searching: false,
  mobilePanel: 'folders',

  loadFolders: async () => {
    set({ foldersLoading: true })
    try {
      const client = useSessionStore.getState().getClient()
      const folders = await client.getFolderTree()
      // Keep collapsed; children load when the user expands a folder
      set({ folders, expandedFolderIds: new Set() })

      if (!get().selectedFolderId && folders[0]) {
        await get().selectFolder(folders[0].id)
      }
    } catch (err) {
      toastError(err, 'Failed to load folders')
    } finally {
      set({ foldersLoading: false })
    }
  },

  selectFolder: async (id) => {
    set({
      selectedFolderId: id,
      selectedArticleId: null,
      articleDetail: null,
      draftTitle: '',
      draftContent: '',
      articleDirty: false,
      mobilePanel: 'articles',
    })
    if (id) await get().loadArticles(id)
  },

  toggleFolderExpanded: (id) => {
    const next = new Set(get().expandedFolderIds)
    if (next.has(id)) {
      next.delete(id)
      set({ expandedFolderIds: next })
      return
    }
    next.add(id)
    set({ expandedFolderIds: next })
    void get().ensureFolderChildren(id)
  },

  ensureFolderChildren: async (id) => {
    const current = findFolderInTree(get().folders, id)
    if (!current) return
    // Need a load when expandable and children not yet fetched
    const needsLoad =
      current.hasMoreChildren ||
      current.childrenNextPage === 1 ||
      (current.hasMoreChildren !== false &&
        (current.children?.length ?? 0) === 0 &&
        (current.childCount == null || current.childCount > 0))
    if (!needsLoad) return
    try {
      const client = useSessionStore.getState().getClient()
      const updated = await client.loadMoreFolderChildren(current)
      set({ folders: replaceFolderInTree(get().folders, updated) })
    } catch (err) {
      toastError(err, 'Failed to load folder children')
    }
  },

  setFolderFilter: (q) => set({ folderFilter: q }),

  loadArticles: async (folderId) => {
    set({ articlesLoading: true })
    try {
      const client = useSessionStore.getState().getClient()
      const articles = await client.listArticles(folderId, get().language)
      set({ articles })
    } catch (err) {
      toastError(err, 'Failed to load articles')
      set({ articles: [] })
    } finally {
      set({ articlesLoading: false })
    }
  },

  selectArticle: async (id) => {
    if (!id) {
      set({
        selectedArticleId: null,
        articleDetail: null,
        draftTitle: '',
        draftContent: '',
        articleDirty: false,
      })
      return
    }
    set({
      selectedArticleId: id,
      articleLoading: true,
      mobilePanel: 'editor',
    })
    try {
      const client = useSessionStore.getState().getClient()
      const article = await client.getArticle(id, get().language)
      set({
        articleDetail: article,
        draftTitle: article.name,
        draftContent: article.content,
        articleDirty: false,
      })
    } catch (err) {
      toastError(err, 'Failed to load article')
    } finally {
      set({ articleLoading: false })
    }
  },

  setDraftTitle: (title) =>
    set({ draftTitle: title, articleDirty: true }),

  setDraftContent: (html) =>
    set({ draftContent: html, articleDirty: true }),

  markClean: () => set({ articleDirty: false }),

  refreshArticle: async () => {
    const id = get().selectedArticleId
    if (id) await get().selectArticle(id)
    const folderId = get().selectedFolderId
    if (folderId) await get().loadArticles(folderId)
  },

  setLanguage: (lang) => {
    const language = lang.trim() || 'en-us'
    set({ language })
    // Keep Accept-Language on subsequent API calls in sync
    const client = useSessionStore.getState().client
    if (client) client.auth.language = language
  },

  setPropertiesOpen: (open) => set({ propertiesOpen: open }),

  setMobilePanel: (panel) => set({ mobilePanel: panel }),

  setGlobalSearch: (q) => set({ globalSearch: q }),

  runGlobalSearch: async () => {
    const q = get().globalSearch.trim()
    if (!q) {
      set({ searchResults: [] })
      return
    }
    set({ searching: true })
    try {
      const client = useSessionStore.getState().getClient()
      const searchResults = await client.searchArticles(q, get().language)
      set({ searchResults })
    } catch (err) {
      toastError(err, 'Search failed')
    } finally {
      set({ searching: false })
    }
  },

  loadArticleTypes: async () => {
    try {
      const client = useSessionStore.getState().getClient()
      const articleTypes = await client.listArticleTypes()
      set({ articleTypes })
    } catch {
      set({
        articleTypes: [
          { id: '1', name: 'General' },
          { id: '2', name: 'FAQ' },
          { id: '3', name: 'How-to' },
        ],
      })
    }
  },

  resetConsole: () =>
    set({
      folders: [],
      selectedFolderId: null,
      articles: [],
      selectedArticleId: null,
      articleDetail: null,
      draftTitle: '',
      draftContent: '',
      articleDirty: false,
      searchResults: [],
      globalSearch: '',
    }),
}))
