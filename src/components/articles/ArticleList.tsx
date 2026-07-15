import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonList } from '@/components/common/Skeleton'
import { ConfirmDialog, Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { setArticleDragData } from '@/utils/articleDnD'
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
    selectArticle,
    selectArticleExclusive,
    toggleArticleSelected,
    selectArticleRange,
    clearArticleSelection,
    getSelectedArticleIds,
    copySelectionToClipboard,
    articleClipboard,
    selectedFolderId,
    folders,
    loadArticles,
    language,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const pushToast = useToastStore((s) => s.push)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [destId, setDestId] = useState('')
  const [busy, setBusy] = useState(false)

  const flat = useMemo(() => collectFolders(folders), [folders])
  const selectedIds = getSelectedArticleIds()
  const selectedCount = selectedIds.length
  const hasSelection = selectedCount > 0

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
    await selectArticle(null)
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
    copySelectionToClipboard()
    pushToast({
      type: 'success',
      message:
        ids.length === 1
          ? 'Article copied — paste into a folder'
          : `${ids.length} articles copied — paste into a folder`,
    })
  }

  const runPaste = async () => {
    const clip = useConsoleStore.getState().articleClipboard
    if (!clip?.articleIds.length || !selectedFolderId) return
    setBusy(true)
    try {
      const copied = await getClient().copyArticles(
        clip.articleIds,
        selectedFolderId,
        language,
      )
      pushToast({
        type: 'success',
        message:
          copied.length === 1
            ? 'Article pasted'
            : `${copied.length} articles pasted`,
      })
      await loadArticles(selectedFolderId)
      if (copied[0]?.id) await selectArticle(copied[0].id)
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Paste failed',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>
          Articles
          {selectedCount > 1 ? (
            <span className={styles.count}> · {selectedCount} selected</span>
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
          icon
          title="Copy (to clipboard)"
          disabled={!hasSelection || busy}
          onClick={runCopyToClipboard}
        >
          ⎘
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Paste into this folder"
          disabled={!selectedFolderId || !articleClipboard?.articleIds.length || busy}
          onClick={() => void runPaste()}
        >
          ⎖
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Move"
          disabled={!hasSelection || busy}
          onClick={() => {
            setDestId(selectedFolderId || '')
            setMoveOpen(true)
          }}
        >
          ↗
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Delete"
          disabled={!hasSelection || busy}
          onClick={() => setDeleteOpen(true)}
        >
          ⌫
        </Button>
      </div>

      <div className={`${styles.list} app-scroll`} role="listbox" aria-label="Articles" aria-multiselectable>
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
            return (
              <button
                key={article.id}
                type="button"
                className={clsx(styles.item, isSelected && styles.itemSelected)}
                role="option"
                aria-selected={isSelected}
                draggable
                onDragStart={(e) => {
                  const ids = idsForDrag(article.id)
                  setArticleDragData(e.dataTransfer, ids)
                  e.dataTransfer.setDragImage(
                    e.currentTarget,
                    24,
                    16,
                  )
                }}
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
                  void selectArticleExclusive(article.id)
                }}
              >
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
              </button>
            )
          })
        )}
      </div>

      <p className={styles.hint}>
        Tip: ⌘/Ctrl+click to multi-select, Shift+click for a range. Drag onto a folder to move.
      </p>

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
