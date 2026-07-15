import { create } from 'zustand'
import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  FolderNode,
} from '@/types'
import { rememberArticleLastModified } from '@/api/articleStamp'
import {
  findFolderInTree,
  replaceFolderInTree,
} from '@/api/folders'
import { useSessionStore } from './sessionStore'
import { useToastStore } from './toastStore'

export type ArticleClipboard = {
  articleIds: string[]
  /** Copy into destination folder via copy API. */
  mode: 'copy'
}

type ConsoleStore = {
  folders: FolderNode[]
  foldersLoading: boolean
  folderFilter: string
  selectedFolderId: string | null
  expandedFolderIds: Set<string>

  articles: ArticleSummary[]
  articlesLoading: boolean
  /** Editor focus / primary selection. */
  selectedArticleId: string | null
  /** Multi-select set (includes primary when set). */
  selectedArticleIds: Set<string>
  /** Anchor for Shift+click range selection. */
  articleSelectionAnchorId: string | null
  /** In-memory clipboard for copy/paste across folders. */
  articleClipboard: ArticleClipboard | null
  /** Article ids currently being dragged (for folder drop-target affordance). */
  draggingArticleIds: string[]
  articleDetail: ArticleDetail | null
  articleLoading: boolean
  /** Set when the selected article failed to load, so the editor can show a retry state instead of loading forever. */
  articleLoadError: string | null
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
  /** Plain click / open in editor — replaces multi-selection. */
  selectArticleExclusive: (id: string) => Promise<void>
  toggleArticleSelected: (id: string) => void
  selectArticleRange: (toId: string) => void
  clearArticleSelection: () => void
  /** Select every article currently loaded in the folder. */
  selectAllArticles: () => void
  /** IDs for bulk actions (multi-select, else primary). */
  getSelectedArticleIds: () => string[]
  copySelectionToClipboard: () => void
  clearArticleClipboard: () => void
  setDraggingArticleIds: (ids: string[]) => void
  setDraftTitle: (title: string) => void
  setDraftContent: (html: string) => void
  markClean: () => void
  /** Merge an article API response into the open editor + list (keeps draft if dirty). */
  applyArticleApiResult: (article: ArticleDetail) => void
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
  selectedArticleIds: new Set(),
  articleSelectionAnchorId: null,
  articleClipboard: null,
  draggingArticleIds: [],
  articleDetail: null,
  articleLoading: false,
  articleLoadError: null,
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
      selectedArticleIds: new Set(),
      articleSelectionAnchorId: null,
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
        selectedArticleIds: new Set(),
        articleSelectionAnchorId: null,
        articleDetail: null,
        articleLoadError: null,
        draftTitle: '',
        draftContent: '',
        articleDirty: false,
      })
      return
    }
    set({
      selectedArticleId: id,
      selectedArticleIds: new Set([id]),
      articleSelectionAnchorId: id,
      articleLoading: true,
      articleLoadError: null,
      mobilePanel: 'editor',
    })
    try {
      const client = useSessionStore.getState().getClient()
      const article = await client.getArticle(id, get().language)
      rememberArticleLastModified(article.id, article.lastModifiedDate)
      set({
        articleDetail: article,
        articleLoadError: null,
        draftTitle: article.name,
        draftContent: article.content,
        articleDirty: false,
      })
    } catch (err) {
      toastError(err, 'Failed to load article')
      set({
        articleLoadError: err instanceof Error ? err.message : 'Failed to load article',
      })
    } finally {
      set({ articleLoading: false })
    }
  },

  selectArticleExclusive: async (id) => {
    await get().selectArticle(id)
  },

  toggleArticleSelected: (id) => {
    const next = new Set(get().selectedArticleIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const primary =
      get().selectedArticleId && next.has(get().selectedArticleId!)
        ? get().selectedArticleId
        : next.size
          ? [...next][next.size - 1]
          : null
    set({
      selectedArticleIds: next,
      selectedArticleId: primary,
      articleSelectionAnchorId: id,
    })
  },

  selectArticleRange: (toId) => {
    const { articles, articleSelectionAnchorId, selectedArticleIds } = get()
    const anchor = articleSelectionAnchorId ?? toId
    const from = articles.findIndex((a) => a.id === anchor)
    const to = articles.findIndex((a) => a.id === toId)
    if (from < 0 || to < 0) {
      get().toggleArticleSelected(toId)
      return
    }
    const [start, end] = from < to ? [from, to] : [to, from]
    const next = new Set(selectedArticleIds)
    for (let i = start; i <= end; i++) next.add(articles[i]!.id)
    set({
      selectedArticleIds: next,
      selectedArticleId: toId,
      articleSelectionAnchorId: anchor,
    })
  },

  clearArticleSelection: () =>
    set({
      selectedArticleIds: new Set(),
      selectedArticleId: null,
      articleSelectionAnchorId: null,
    }),

  selectAllArticles: () => {
    const { articles } = get()
    if (!articles.length) return
    set({
      selectedArticleIds: new Set(articles.map((a) => a.id)),
      selectedArticleId: articles[articles.length - 1]!.id,
      articleSelectionAnchorId: articles[0]!.id,
    })
  },

  getSelectedArticleIds: () => {
    const { selectedArticleIds, selectedArticleId } = get()
    if (selectedArticleIds.size > 0) return [...selectedArticleIds]
    return selectedArticleId ? [selectedArticleId] : []
  },

  copySelectionToClipboard: () => {
    const ids = get().getSelectedArticleIds()
    if (ids.length === 0) return
    set({ articleClipboard: { articleIds: ids, mode: 'copy' } })
  },

  clearArticleClipboard: () => set({ articleClipboard: null }),

  setDraggingArticleIds: (ids) => set({ draggingArticleIds: ids }),

  setDraftTitle: (title) =>
    set({ draftTitle: title, articleDirty: true }),

  setDraftContent: (html) =>
    set({ draftContent: html, articleDirty: true }),

  markClean: () => set({ articleDirty: false }),

  applyArticleApiResult: (article) => {
    rememberArticleLastModified(article.id, article.lastModifiedDate)
    const state = get()
    const articles = state.articles.map((a) =>
      a.id === article.id
        ? {
            ...a,
            name: article.name,
            status: article.status,
            checkedOut: article.checkedOut,
            checkedOutBy: article.checkedOutBy,
            checkedOutById: article.checkedOutById,
            lastModifiedDate: article.lastModifiedDate,
            lastModifiedBy: article.lastModifiedBy,
            version: article.version,
            includeInGenAI: article.includeInGenAI,
            articleType: article.articleType,
          }
        : a,
    )

    if (state.selectedArticleId !== article.id) {
      set({ articles })
      return
    }

    if (state.articleDirty) {
      // Keep in-progress title/content; always take concurrency + lock from API.
      set({
        articles,
        articleDetail: {
          ...article,
          name: state.draftTitle || article.name,
          content: state.draftContent || article.content,
          lastModifiedDate:
            article.lastModifiedDate ?? state.articleDetail?.lastModifiedDate,
        },
      })
      return
    }

    set({
      articles,
      articleDetail: article,
      draftTitle: article.name,
      draftContent: article.content,
      articleDirty: false,
    })
  },

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
      selectedArticleIds: new Set(),
      articleSelectionAnchorId: null,
      articleClipboard: null,
      draggingArticleIds: [],
      articleDetail: null,
      articleLoadError: null,
      draftTitle: '',
      draftContent: '',
      articleDirty: false,
      searchResults: [],
      globalSearch: '',
    }),
}))
