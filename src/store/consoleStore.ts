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
import { collectFolderIdsDepthFirst } from '@/utils/folderSelection'
import { loadUiPrefs, saveUiPrefs } from '@/utils/storage'
import { useSessionStore } from './sessionStore'
import { useToastStore } from './toastStore'

function draftsDirty(
  draftTitle: string,
  draftContent: string,
  savedTitle: string,
  savedContent: string,
) {
  return draftTitle !== savedTitle || draftContent !== savedContent
}

/** In-app clipboard for cut/copy of articles or folders. */
export type KbClipboard =
  | { kind: 'articles'; ids: string[]; mode: 'copy' | 'cut' }
  | { kind: 'folders'; ids: string[]; mode: 'copy' | 'cut' }

type ConsoleStore = {
  folders: FolderNode[]
  foldersLoading: boolean
  folderFilter: string
  /** Open folder (article list target). */
  selectedFolderId: string | null
  /** Multi-select set for bulk folder actions (includes open folder when set). */
  selectedFolderIds: Set<string>
  /** Anchor for Shift+click range selection in the folder tree. */
  folderSelectionAnchorId: string | null
  expandedFolderIds: Set<string>

  articles: ArticleSummary[]
  articlesLoading: boolean
  /** Editor focus / primary selection. */
  selectedArticleId: string | null
  /** Multi-select set (includes primary when set). */
  selectedArticleIds: Set<string>
  /** Anchor for Shift+click range selection. */
  articleSelectionAnchorId: string | null
  /** In-memory clipboard for cut/copy/paste across folders. */
  clipboard: KbClipboard | null
  /** Article ids currently being dragged (for folder drop-target affordance). */
  draggingArticleIds: string[]
  articleDetail: ArticleDetail | null
  articleLoading: boolean
  /** Set when the selected article failed to load, so the editor can show a retry state instead of loading forever. */
  articleLoadError: string | null
  articleDirty: boolean
  draftTitle: string
  draftContent: string
  /** Last saved / loaded title — used to compute dirty state. */
  savedTitle: string
  /** Last saved / loaded content (TinyMCE-normalized after editor mounts). */
  savedContent: string
  /** Persist idle auto-save preference. */
  autoSave: boolean
  /** Persist whether properties is docked on the right. */
  propertiesAnchored: boolean

  articleTypes: ArticleType[]
  language: string
  propertiesOpen: boolean
  globalSearch: string
  searchResults: ArticleSummary[]
  searching: boolean

  mobilePanel: 'folders' | 'articles' | 'editor'

  loadFolders: () => Promise<void>
  /** Open a folder and replace folder multi-selection. */
  selectFolder: (id: string | null) => Promise<void>
  toggleFolderSelected: (id: string) => void
  selectFolderRange: (toId: string) => void
  clearFolderSelection: () => void
  getSelectedFolderIds: () => string[]
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
  copyArticlesToClipboard: (ids?: string[]) => void
  cutArticlesToClipboard: (ids?: string[]) => void
  copyFoldersToClipboard: (ids?: string[]) => void
  cutFoldersToClipboard: (ids?: string[]) => void
  clearClipboard: () => void
  setDraggingArticleIds: (ids: string[]) => void
  setDraftTitle: (title: string) => void
  setDraftContent: (html: string) => void
  /**
   * TinyMCE rewrites HTML on mount; adopt that serialization as the clean
   * baseline so the Unsaved badge does not flash for an untouched article.
   */
  acceptEditorBaseline: (html: string) => void
  markClean: () => void
  setAutoSave: (enabled: boolean) => void
  setPropertiesAnchored: (anchored: boolean) => void
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
  selectedFolderIds: new Set(),
  folderSelectionAnchorId: null,
  expandedFolderIds: new Set<string>(),

  articles: [],
  articlesLoading: false,
  selectedArticleId: null,
  selectedArticleIds: new Set(),
  articleSelectionAnchorId: null,
  clipboard: null,
  draggingArticleIds: [],
  articleDetail: null,
  articleLoading: false,
  articleLoadError: null,
  articleDirty: false,
  draftTitle: '',
  draftContent: '',
  savedTitle: '',
  savedContent: '',
  autoSave: Boolean(loadUiPrefs().autoSave),
  propertiesAnchored: Boolean(loadUiPrefs().propertiesAnchored),

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
      selectedFolderIds: id ? new Set([id]) : new Set(),
      folderSelectionAnchorId: id,
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

  toggleFolderSelected: (id) => {
    const next = new Set(get().selectedFolderIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Multi-select does not change the open folder / article list.
    set({
      selectedFolderIds: next,
      folderSelectionAnchorId: id,
    })
  },

  selectFolderRange: (toId) => {
    const { folders, folderSelectionAnchorId, selectedFolderIds } = get()
    const order = collectFolderIdsDepthFirst(folders)
    const anchor = folderSelectionAnchorId ?? toId
    const from = order.indexOf(anchor)
    const to = order.indexOf(toId)
    if (from < 0 || to < 0) {
      get().toggleFolderSelected(toId)
      return
    }
    const [start, end] = from < to ? [from, to] : [to, from]
    const next = new Set(selectedFolderIds)
    for (let i = start; i <= end; i++) next.add(order[i]!)
    set({
      selectedFolderIds: next,
      folderSelectionAnchorId: anchor,
    })
  },

  clearFolderSelection: () =>
    set({
      selectedFolderIds: get().selectedFolderId
        ? new Set([get().selectedFolderId!])
        : new Set(),
      folderSelectionAnchorId: get().selectedFolderId,
    }),

  getSelectedFolderIds: () => {
    const { selectedFolderIds, selectedFolderId } = get()
    if (selectedFolderIds.size > 0) return [...selectedFolderIds]
    return selectedFolderId ? [selectedFolderId] : []
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
    // Only fetch when we already know the folder has (or may still have) children.
    const needsLoad =
      Boolean(current.hasMoreChildren) ||
      current.childrenNextPage === 1 ||
      ((current.childCount ?? 0) > 0 && (current.children?.length ?? 0) === 0)
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
        savedTitle: '',
        savedContent: '',
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
        savedTitle: article.name,
        savedContent: article.content,
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

  copyArticlesToClipboard: (ids) => {
    const list = ids ?? get().getSelectedArticleIds()
    if (!list.length) return
    set({ clipboard: { kind: 'articles', ids: list, mode: 'copy' } })
  },

  cutArticlesToClipboard: (ids) => {
    const list = ids ?? get().getSelectedArticleIds()
    if (!list.length) return
    set({ clipboard: { kind: 'articles', ids: list, mode: 'cut' } })
  },

  copyFoldersToClipboard: (ids) => {
    const list = ids ?? get().getSelectedFolderIds()
    if (!list.length) return
    set({ clipboard: { kind: 'folders', ids: list, mode: 'copy' } })
  },

  cutFoldersToClipboard: (ids) => {
    const list = ids ?? get().getSelectedFolderIds()
    if (!list.length) return
    set({ clipboard: { kind: 'folders', ids: list, mode: 'cut' } })
  },

  clearClipboard: () => set({ clipboard: null }),

  setDraggingArticleIds: (ids) => set({ draggingArticleIds: ids }),

  setDraftTitle: (title) =>
    set((s) => ({
      draftTitle: title,
      articleDirty: draftsDirty(title, s.draftContent, s.savedTitle, s.savedContent),
    })),

  setDraftContent: (html) =>
    set((s) => ({
      draftContent: html,
      articleDirty: draftsDirty(s.draftTitle, html, s.savedTitle, s.savedContent),
    })),

  acceptEditorBaseline: (html) =>
    set((s) => {
      const contentWasDirty = s.draftContent !== s.savedContent
      if (contentWasDirty) {
        return {
          draftContent: html,
          articleDirty: draftsDirty(s.draftTitle, html, s.savedTitle, s.savedContent),
        }
      }
      return {
        draftContent: html,
        savedContent: html,
        articleDirty: s.draftTitle !== s.savedTitle,
      }
    }),

  markClean: () =>
    set((s) => ({
      articleDirty: false,
      savedTitle: s.draftTitle,
      savedContent: s.draftContent,
    })),

  setAutoSave: (enabled) => {
    saveUiPrefs({ autoSave: enabled })
    set({ autoSave: enabled })
  },

  setPropertiesAnchored: (anchored) => {
    saveUiPrefs({ propertiesAnchored: anchored })
    set({ propertiesAnchored: anchored })
  },

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

    // Keep editor drafts (often TinyMCE-normalized) so a save/check-in does not
    // reintroduce a false dirty flag when the API returns different markup.
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
      selectedFolderIds: new Set(),
      folderSelectionAnchorId: null,
      articles: [],
      selectedArticleId: null,
      selectedArticleIds: new Set(),
      articleSelectionAnchorId: null,
      clipboard: null,
      draggingArticleIds: [],
      articleDetail: null,
      articleLoadError: null,
      draftTitle: '',
      draftContent: '',
      savedTitle: '',
      savedContent: '',
      articleDirty: false,
      searchResults: [],
      globalSearch: '',
    }),
}))
