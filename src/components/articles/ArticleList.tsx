import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonList } from '@/components/common/Skeleton'
import { ConfirmDialog, Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
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
    selectArticle,
    selectedFolderId,
    folders,
    loadArticles,
    refreshArticle,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const pushToast = useToastStore((s) => s.push)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [destId, setDestId] = useState('')

  const flat = useMemo(() => collectFolders(folders), [folders])
  const selected = articles.find((a) => a.id === selectedArticleId)

  const statusClass = (status: string) => {
    if (status === 'live') return styles.live
    if (status === 'draft') return styles.draft
    if (status === 'pending') return styles.pending
    return styles.retired
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Articles</span>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Refresh"
          disabled={!selectedFolderId}
          onClick={() => selectedFolderId && void loadArticles(selectedFolderId)}
        >
          ↻
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="New article"
          disabled={!selectedFolderId}
          onClick={onCreateArticle}
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Copy"
          disabled={!selected}
          onClick={async () => {
            if (!selected || !selectedFolderId) return
            try {
              const copy = await getClient().copyArticle(selected.id, selectedFolderId)
              pushToast({ type: 'success', message: 'Article copied' })
              await loadArticles(selectedFolderId)
              if (copy?.id) await selectArticle(copy.id)
            } catch (err) {
              pushToast({
                type: 'error',
                message: err instanceof Error ? err.message : 'Copy failed',
              })
            }
          }}
        >
          ⎘
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Move"
          disabled={!selected}
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
          disabled={!selected}
          onClick={() => setDeleteOpen(true)}
        >
          ⌫
        </Button>
      </div>

      <div className={`${styles.list} app-scroll`} role="listbox" aria-label="Articles">
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
          articles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={styles.item}
              role="option"
              aria-selected={selectedArticleId === article.id}
              onClick={() => void selectArticle(article.id)}
            >
              <p className={styles.itemName}>{article.name}</p>
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
          ))
        )}
      </div>

      <Modal
        open={moveOpen}
        title="Move article"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!selected || !destId) return
                try {
                  await getClient().moveArticle(selected.id, destId)
                  pushToast({ type: 'success', message: 'Article moved' })
                  setMoveOpen(false)
                  if (selectedFolderId) await loadArticles(selectedFolderId)
                  await selectArticle(null)
                } catch (err) {
                  pushToast({
                    type: 'error',
                    message: err instanceof Error ? err.message : 'Move failed',
                  })
                }
              }}
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
        title="Delete article"
        message={`Delete “${selected?.name ?? 'this article'}”? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!selected || !selectedFolderId) return
          void (async () => {
            try {
              await getClient().deleteArticle(selected.id)
              pushToast({ type: 'success', message: 'Article deleted' })
              await loadArticles(selectedFolderId)
              await selectArticle(null)
              await refreshArticle()
            } catch (err) {
              pushToast({
                type: 'error',
                message: err instanceof Error ? err.message : 'Delete failed',
              })
            }
          })()
        }}
      />
    </div>
  )
}
