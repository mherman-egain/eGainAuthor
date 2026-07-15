import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Button } from '@/components/common/Button'
import {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuState,
} from '@/components/common/ContextMenu'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonList } from '@/components/common/Skeleton'
import { ConfirmDialog, Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { setArticleDragData } from '@/utils/articleDnD'
import { articlePath, folderPath } from '@/utils/deepLinks'
import { pasteClipboardIntoFolder, pasteSuccessMessage } from '@/utils/kbPaste'
import { formatRelative, statusLabel } from '@/utils/format'
import type { FolderNode } from '@/types'
import styles from './ArticleList.module.css'

function collectFolders(nodes: FolderNode[], acc: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    acc.push(n)
    if (n.children) collectFolders(n.children, acc)
  }
  return acc
}

export function ArticleList({ onCreateArticle }: { onCreateArticle: () => void }) {
  const {
    articles,
    articlesLoading,
    selectedArticleId,
    selectedArticleIds,
    toggleArticleSelected,
    selectArticleRange,
    clearArticleSelection,
    selectAllArticles,
    getSelectedArticleIds,
    copyArticlesToClipboard,
    cutArticlesToClipboard,
    clipboard,
    selectedFolderId,
    folders,
    loadArticles,
    loadFolders,
    language,
    setDraggingArticleIds,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const pushToast = useToastStore((s) => s.push)
  const navigate = useNavigate()

  const openArticle = (articleId: string) => {
    if (!selectedFolderId) return
    navigate(articlePath(selectedFolderId, articleId))
  }

  const openCurrentFolder = () => {
    if (selectedFolderId) navigate(folderPath(selectedFolderId))
  }

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [destId, setDestId] = useState('')
  const [busy, setBusy] = useState(false)

  const flat = useMemo(() => collectFolders(folders), [folders])
  const selectedIds = getSelectedArticleIds()
  const selectedCount = selectedIds.length
  const hasSelection = selectedCount > 0
  const canPaste = Boolean(selectedFolderId && clipboard?.ids.length)

  // A single opened article also lives in selectedArticleIds, so only treat
  // Escape as "clear selection" when there's an actual multi-selection —
  // otherwise it would surprise-close whatever article is open in the editor.
  const hasMultiSelection = selectedArticleIds.size > 1
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      if (document.querySelector('[role="dialog"]')) return
      if (document.querySelector('[role="menu"]')) return
      if (e.key === 'Escape' && hasMultiSelection) {
        clearArticleSelection()
      } else if (e.key === 'Delete' && hasSelection) {
        e.preventDefault()
        setDeleteOpen(true)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && hasSelection) {
        e.preventDefault()
        copyArticlesToClipboard()
        pushToast({
          type: 'info',
          message:
            selectedCount === 1
              ? 'Article copied — paste into a folder'
              : `${selectedCount} articles copied — paste into a folder`,
        })
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x' && hasSelection) {
        e.preventDefault()
        cutArticlesToClipboard()
        pushToast({
          type: 'info',
          message:
            selectedCount === 1
              ? 'Article cut — paste into a folder'
              : `${selectedCount} articles cut — paste into a folder`,
        })
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && canPaste) {
        e.preventDefault()
        void runPaste()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    hasSelection,
    hasMultiSelection,
    clearArticleSelection,
    copyArticlesToClipboard,
    cutArticlesToClipboard,
    canPaste,
    selectedCount,
    pushToast,
  ])

  const statusClass = (status: string) => {
    if (status === 'live') return styles.live
    if (status === 'draft') return styles.draft
    if (status === 'pending') return styles.pending
    return styles.retired
  }

  const idsForDrag = (articleId: string) => {
    if (selectedArticleIds.has(articleId)) return getSelectedArticleIds()
    return [articleId]
  }

  const afterBulkChange = async () => {
    if (selectedFolderId) await loadArticles(selectedFolderId)
    clearArticleSelection()
    openCurrentFolder()
  }

  const runMove = async (ids: string[], destinationFolderId: string) => {
    if (!ids.length || !destinationFolderId) return
    setBusy(true)
    try {
      await getClient().moveArticles(ids, destinationFolderId)
      pushToast({
        type: 'success',
        message:
          ids.length === 1
            ? 'Article moved'
            : `${ids.length} articles moved`,
      })
      setMoveOpen(false)
      await afterBulkChange()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Move failed',
      })
    } finally {
      setBusy(false)
    }
  }

  const runDelete = async () => {
    const ids = getSelectedArticleIds()
    if (!ids.length || !selectedFolderId) return
    setBusy(true)
    try {
      await getClient().deleteArticles(ids, language)
      pushToast({
        type: 'success',
        message:
          ids.length === 1
            ? 'Article deleted'
            : `${ids.length} articles deleted`,
      })
      setDeleteOpen(false)
      await afterBulkChange()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      })
    } finally {
      setBusy(false)
    }
  }

  const runCopyToClipboard = () => {
    const ids = getSelectedArticleIds()
    if (!ids.length) return
    copyArticlesToClipboard(ids)
    pushToast({
      type: 'info',
      message:
        ids.length === 1
          ? 'Article copied — paste into a folder'
          : `${ids.length} articles copied — paste into a folder`,
    })
  }

  const runCutToClipboard = () => {
    const ids = getSelectedArticleIds()
    if (!ids.length) return
    cutArticlesToClipboard(ids)
    pushToast({
      type: 'info',
      message:
        ids.length === 1
          ? 'Article cut — paste into a folder'
          : `${ids.length} articles cut — paste into a folder`,
    })
  }

  const runPaste = async () => {
    if (!selectedFolderId) return
    setBusy(true)
    try {
      const result = await pasteClipboardIntoFolder(selectedFolderId)
      if (!result) return
      pushToast({ type: 'success', message: pasteSuccessMessage(result) })
      if (result.kind === 'folders') {
        await loadFolders()
      } else {
        await loadArticles(selectedFolderId)
        if (result.mode === 'cut') {
          clearArticleSelection()
          openCurrentFolder()
        }
      }
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Paste failed',
      })
    } finally {
      setBusy(false)
    }
  }

  const onArticleContextMenu = useCallback(
    (e: React.MouseEvent, articleId: string) => {
      e.preventDefault()
      e.stopPropagation()
      const state = useConsoleStore.getState()
      let ids: string[]
      if (!state.selectedArticleIds.has(articleId)) {
        ids = [articleId]
        openArticle(articleId)
      } else {
        ids = state.getSelectedArticleIds()
      }
      const count = ids.length
      const dest = state.selectedFolderId
      const canPasteHere = Boolean(dest && state.clipboard?.ids.length)

      const items: ContextMenuItem[] = [
        {
          id: 'cut',
          label: count > 1 ? `Cut ${count} articles` : 'Cut',
          onSelect: () => {
            cutArticlesToClipboard(ids)
            pushToast({
              type: 'info',
              message:
                count === 1
                  ? 'Article cut — paste into a folder'
                  : `${count} articles cut — paste into a destination`,
            })
          },
        },
        {
          id: 'copy',
          label: count > 1 ? `Copy ${count} articles` : 'Copy',
          onSelect: () => {
            copyArticlesToClipboard(ids)
            pushToast({
              type: 'info',
              message:
                count === 1
                  ? 'Article copied — paste into a folder'
                  : `${count} articles copied — paste into a folder`,
            })
          },
        },
        {
          id: 'paste',
          label: 'Paste',
          disabled: !canPasteHere,
          onSelect: () => {
            if (dest) void runPaste()
          },
        },
        { type: 'separator', id: 'sep-1' },
        {
          id: 'move',
          label: count > 1 ? `Move ${count}…` : 'Move…',
          onSelect: () => {
            setDestId(dest || '')
            setMoveOpen(true)
          },
        },
        {
          id: 'delete',
          label: count > 1 ? `Delete ${count}…` : 'Delete…',
          danger: true,
          onSelect: () => setDeleteOpen(true),
        },
      ]
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cutArticlesToClipboard, copyArticlesToClipboard, pushToast, selectedFolderId, navigate],
  )

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>
          Articles
          {hasSelection ? (
            <span className={styles.count}>
              {' '}
              · {selectedCount} selected ·{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={clearArticleSelection}
              >
                Clear
              </button>
            </span>
          ) : articles.length > 0 ? (
            <>
              {' '}
              ·{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={selectAllArticles}
              >
                Select all
              </button>
            </>
          ) : null}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Refresh"
          disabled={!selectedFolderId || busy}
          onClick={() => selectedFolderId && void loadArticles(selectedFolderId)}
        >
          ↻
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="New article"
          disabled={!selectedFolderId || busy}
          onClick={onCreateArticle}
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Cut the selected article(s)"
          disabled={!hasSelection || busy}
          onClick={runCutToClipboard}
        >
          ✂ Cut
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Copy the selected article(s) to the clipboard"
          disabled={!hasSelection || busy}
          onClick={runCopyToClipboard}
        >
          ⎘ Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Paste the clipboard into this folder"
          disabled={!canPaste || busy}
          onClick={() => void runPaste()}
        >
          ⎖ Paste
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Move the selected article(s) to another folder"
          disabled={!hasSelection || busy}
          onClick={() => {
            setDestId(selectedFolderId || '')
            setMoveOpen(true)
          }}
        >
          ↗ Move
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Delete the selected article(s)"
          disabled={!hasSelection || busy}
          onClick={() => setDeleteOpen(true)}
        >
          ⌫ Delete
        </Button>
      </div>

      <div
        className={`${styles.list} app-scroll`}
        role="listbox"
        aria-label="Articles"
        aria-multiselectable
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest(`.${styles.item}`)) return
          e.preventDefault()
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              {
                id: 'paste',
                label: 'Paste',
                disabled: !canPaste,
                onSelect: () => void runPaste(),
              },
            ],
          })
        }}
      >
        {!selectedFolderId ? (
          <EmptyState title="Select a folder" body="Choose a folder to view its articles." />
        ) : articlesLoading ? (
          <SkeletonList rows={8} />
        ) : articles.length === 0 ? (
          <EmptyState
            title="No articles here"
            body="Create an article in this folder to get started."
            action={
              <Button variant="primary" size="sm" onClick={onCreateArticle}>
                + Article
              </Button>
            }
          />
        ) : (
          articles.map((article) => {
            const isSelected = selectedArticleIds.has(article.id)
            const isPrimary = selectedArticleId === article.id
            const isCut =
              clipboard?.kind === 'articles' &&
              clipboard.mode === 'cut' &&
              clipboard.ids.includes(article.id)
            return (
              <div
                key={article.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={clsx(
                  styles.item,
                  isSelected && styles.itemSelected,
                  isCut && styles.itemCut,
                )}
                draggable
                onDragStart={(e) => {
                  const ids = idsForDrag(article.id)
                  setArticleDragData(e.dataTransfer, ids)
                  e.dataTransfer.setDragImage(e.currentTarget, 24, 16)
                  setDraggingArticleIds(ids)
                }}
                onDragEnd={() => setDraggingArticleIds([])}
                onClick={(e) => {
                  if (e.shiftKey) {
                    e.preventDefault()
                    selectArticleRange(article.id)
                    return
                  }
                  if (e.metaKey || e.ctrlKey) {
                    e.preventDefault()
                    toggleArticleSelected(article.id)
                    return
                  }
                  openArticle(article.id)
                }}
                onContextMenu={(e) => onArticleContextMenu(e, article.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openArticle(article.id)
                  }
                }}
              >
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isSelected}
                  aria-label={`Select ${article.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleArticleSelected(article.id)}
                />
                <div className={styles.itemBody}>
                  <p className={styles.itemName}>
                    {isPrimary && selectedCount > 1 ? '▸ ' : null}
                    {article.name}
                  </p>
                  <div className={styles.meta}>
                    <span className={clsx(styles.pill, statusClass(article.status))}>
                      {statusLabel(article.status)}
                    </span>
                    <span>ID {article.alternateId || article.id}</span>
                    <span>{article.author || article.createdBy || '—'}</span>
                    <span>{formatRelative(article.lastModifiedDate)}</span>
                    {article.checkedOut ? <span>Checked out</span> : null}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className={styles.hint}>
        Tip: right-click for Cut / Copy / Paste. Check boxes or Ctrl/Cmd+click to
        multi-select; Shift+click for a range; drag onto a folder to move.
      </p>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      <Modal
        open={moveOpen}
        title={selectedCount > 1 ? `Move ${selectedCount} articles` : 'Move article'}
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !destId}
              onClick={() => void runMove(getSelectedArticleIds(), destId)}
            >
              Move
            </Button>
          </>
        }
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Destination folder
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            style={{ padding: '0.55rem', borderRadius: 6, border: '1px solid var(--eg-border)' }}
          >
            {flat.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path || f.name}
              </option>
            ))}
          </select>
        </label>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title={selectedCount > 1 ? `Delete ${selectedCount} articles` : 'Delete article'}
        message={
          selectedCount > 1
            ? `Delete ${selectedCount} selected articles? This cannot be undone.`
            : `Delete “${articles.find((a) => a.id === selectedIds[0])?.name ?? 'this article'}”? This cannot be undone.`
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void runDelete()}
      />
    </div>
  )
}
