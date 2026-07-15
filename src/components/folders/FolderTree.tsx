import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { FolderNode } from '@/types'
import { Button } from '@/components/common/Button'
import {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuState,
} from '@/components/common/ContextMenu'
import { EmptyState } from '@/components/common/EmptyState'
import { SearchInput } from '@/components/common/SearchInput'
import { SkeletonList } from '@/components/common/Skeleton'
import { ConfirmDialog, Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { ARTICLE_DND_MIME, readArticleDragIds } from '@/utils/articleDnD'
import { folderPath } from '@/utils/deepLinks'
import {
  isInvalidFolderMoveDestination,
  pruneNestedFolderIds,
} from '@/utils/folderSelection'
import { pasteClipboardIntoFolder, pasteSuccessMessage } from '@/utils/kbPaste'
import styles from './FolderTree.module.css'

function filterTree(nodes: FolderNode[], q: string): FolderNode[] {
  if (!q.trim()) return nodes
  const needle = q.toLowerCase()
  const walk = (list: FolderNode[]): FolderNode[] => {
    const out: FolderNode[] = []
    for (const n of list) {
      const children = n.children ? walk(n.children) : []
      if (n.name.toLowerCase().includes(needle) || children.length) {
        out.push({ ...n, children })
      }
    }
    return out
  }
  return walk(nodes)
}

function FolderRow({
  node,
  depth,
  onArticlesDropped,
  onFolderContextMenu,
}: {
  node: FolderNode
  depth: number
  onArticlesDropped: (articleIds: string[], folderId: string) => void
  onFolderContextMenu: (e: React.MouseEvent, folderId: string) => void
}) {
  const {
    selectedFolderId,
    selectedFolderIds,
    expandedFolderIds,
    toggleFolderExpanded,
    toggleFolderSelected,
    selectFolderRange,
    clipboard,
  } = useConsoleStore()
  const navigate = useNavigate()
  const [dropActive, setDropActive] = useState(false)
  const hasChildren =
    (node.childCount != null && node.childCount > 0) ||
    Boolean(node.children?.length) ||
    Boolean(node.hasMoreChildren)
  const expanded = expandedFolderIds.has(node.id)
  const isSelected = selectedFolderIds.has(node.id)
  const isOpen = selectedFolderId === node.id
  const isCut =
    clipboard?.kind === 'folders' &&
    clipboard.mode === 'cut' &&
    clipboard.ids.includes(node.id)

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        className={clsx(
          styles.nodeBtn,
          dropActive && styles.dropTarget,
          isSelected && styles.nodeSelected,
          isOpen && styles.nodeOpen,
          isCut && styles.nodeCut,
        )}
        style={{ paddingLeft: `${0.4 + depth * 0.85}rem` }}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault()
            selectFolderRange(node.id)
            return
          }
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            toggleFolderSelected(node.id)
            return
          }
          navigate(folderPath(node.id))
        }}
        onContextMenu={(e) => onFolderContextMenu(e, node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            navigate(folderPath(node.id))
          }
          if (e.key === 'ArrowRight' && hasChildren && !expanded) {
            toggleFolderExpanded(node.id)
          }
          if (e.key === 'ArrowLeft' && hasChildren && expanded) {
            toggleFolderExpanded(node.id)
          }
        }}
        onDragEnter={(e) => {
          if (
            e.dataTransfer.types.includes(ARTICLE_DND_MIME) ||
            e.dataTransfer.types.includes('text/plain')
          ) {
            e.preventDefault()
            setDropActive(true)
          }
        }}
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes(ARTICLE_DND_MIME) ||
            e.dataTransfer.types.includes('text/plain')
          ) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropActive(true)
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDropActive(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDropActive(false)
          const ids = readArticleDragIds(e.dataTransfer)
          if (ids.length) onArticlesDropped(ids, node.id)
        }}
      >
        <span
          className={clsx(styles.chevron, !hasChildren && styles.chevronEmpty)}
          onClick={(e) => {
            if (!hasChildren) return
            e.stopPropagation()
            toggleFolderExpanded(node.id)
          }}
          role={hasChildren ? 'button' : undefined}
          aria-hidden={!hasChildren}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : null}
        </span>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={isSelected}
          aria-label={`Select ${node.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleFolderSelected(node.id)}
        />
        <span className={styles.name}>{node.name}</span>
      </div>
      {hasChildren && expanded
        ? node.children!.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onArticlesDropped={onArticlesDropped}
              onFolderContextMenu={onFolderContextMenu}
            />
          ))
        : null}
    </div>
  )
}

function collectFolderOptions(nodes: FolderNode[], acc: FolderNode[] = []): FolderNode[] {
  for (const n of nodes) {
    acc.push(n)
    if (n.children) collectFolderOptions(n.children, acc)
  }
  return acc
}

export function FolderTree() {
  const {
    folders,
    foldersLoading,
    folderFilter,
    setFolderFilter,
    selectedFolderId,
    selectedFolderIds,
    getSelectedFolderIds,
    loadFolders,
    loadArticles,
    clearArticleSelection,
    draggingArticleIds,
    clipboard,
    copyFoldersToClipboard,
    cutFoldersToClipboard,
    clearFolderSelection,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const pushToast = useToastStore((s) => s.push)
  const navigate = useNavigate()

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [destId, setDestId] = useState('')

  const visible = useMemo(
    () => filterTree(folders, folderFilter),
    [folders, folderFilter],
  )
  const flat = useMemo(() => collectFolderOptions(folders), [folders])
  const selectedIds = getSelectedFolderIds()
  const selectedCount = selectedIds.length
  const primary = flat.find((f) => f.id === selectedFolderId)
  const renameTarget =
    selectedCount === 1 ? flat.find((f) => f.id === selectedIds[0]) : null

  const onArticlesDropped = async (articleIds: string[], folderId: string) => {
    const currentFolder = useConsoleStore.getState().selectedFolderId
    if (!articleIds.length) return
    if (folderId === currentFolder) {
      pushToast({ type: 'info', message: 'Articles are already in this folder' })
      return
    }
    try {
      await getClient().moveArticles(articleIds, folderId)
      pushToast({
        type: 'success',
        message:
          articleIds.length === 1
            ? 'Article moved'
            : `${articleIds.length} articles moved`,
      })
      clearArticleSelection()
      if (currentFolder) {
        navigate(folderPath(currentFolder))
        await loadArticles(currentFolder)
      }
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Move failed',
      })
    }
  }

  const run = async (fn: () => Promise<void>, success: string) => {
    try {
      await fn()
      pushToast({ type: 'success', message: success })
      await loadFolders()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Folder action failed',
      })
    }
  }

  const runPasteInto = async (destinationFolderId: string) => {
    try {
      const result = await pasteClipboardIntoFolder(destinationFolderId)
      if (!result) return
      pushToast({ type: 'success', message: pasteSuccessMessage(result) })
      if (result.kind === 'folders' || result.mode === 'cut') {
        await loadFolders()
      }
      const openId = useConsoleStore.getState().selectedFolderId
      if (openId && (result.kind === 'articles' || result.mode === 'cut')) {
        await loadArticles(openId)
      }
      if (result.kind === 'articles' && result.mode === 'cut') {
        clearArticleSelection()
        if (openId) navigate(folderPath(openId))
      }
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Paste failed',
      })
    }
  }

  const runBulkMove = async (destinationParentId: string) => {
    const ids = pruneNestedFolderIds(getSelectedFolderIds(), folders)
    if (!ids.length || !destinationParentId) return
    if (isInvalidFolderMoveDestination(folders, ids, destinationParentId)) {
      pushToast({
        type: 'error',
        message: 'Cannot move a folder into itself or one of its children',
      })
      return
    }
    await run(async () => {
      for (const id of ids) {
        await getClient().moveFolder(id, destinationParentId)
      }
      setMoveOpen(false)
    }, ids.length === 1 ? 'Folder moved' : `${ids.length} folders moved`)
  }

  const runBulkCopy = async (destinationParentId: string) => {
    const ids = pruneNestedFolderIds(getSelectedFolderIds(), folders)
    if (!ids.length || !destinationParentId) return
    if (isInvalidFolderMoveDestination(folders, ids, destinationParentId)) {
      pushToast({
        type: 'error',
        message: 'Cannot copy a folder into itself or one of its children',
      })
      return
    }
    await run(async () => {
      for (const id of ids) {
        await getClient().copyFolder(id, destinationParentId)
      }
      setMoveOpen(false)
    }, ids.length === 1 ? 'Folder copied' : `${ids.length} folders copied`)
  }

  const onFolderContextMenu = useCallback(
    (e: React.MouseEvent, folderId: string) => {
      e.preventDefault()
      e.stopPropagation()
      const state = useConsoleStore.getState()
      let ids: string[]
      if (!state.selectedFolderIds.has(folderId)) {
        ids = [folderId]
        navigate(folderPath(folderId))
      } else {
        ids = [...state.selectedFolderIds]
      }
      const count = ids.length
      const canPaste = Boolean(state.clipboard?.ids.length)

      const items: ContextMenuItem[] = [
        {
          id: 'cut',
          label: count > 1 ? `Cut ${count} folders` : 'Cut',
          onSelect: () => {
            cutFoldersToClipboard(ids)
            pushToast({
              type: 'info',
              message:
                count === 1
                  ? 'Folder cut — paste into a destination'
                  : `${count} folders cut — paste into a destination`,
            })
          },
        },
        {
          id: 'copy',
          label: count > 1 ? `Copy ${count} folders` : 'Copy',
          onSelect: () => {
            copyFoldersToClipboard(ids)
            pushToast({
              type: 'info',
              message:
                count === 1
                  ? 'Folder copied — paste into a destination'
                  : `${count} folders copied — paste into a destination`,
            })
          },
        },
        {
          id: 'paste',
          label: 'Paste',
          disabled: !canPaste,
          onSelect: () => void runPasteInto(folderId),
        },
        { type: 'separator', id: 'sep-1' },
        {
          id: 'move',
          label: count > 1 ? `Move ${count}…` : 'Move…',
          onSelect: () => {
            setDestId(
              useConsoleStore.getState().selectedFolderId || flat[0]?.id || '',
            )
            setMoveOpen(true)
          },
        },
        {
          id: 'rename',
          label: 'Rename…',
          disabled: count !== 1,
          onSelect: () => {
            const f = flat.find((x) => x.id === ids[0])
            setName(f?.name ?? '')
            setRenameOpen(true)
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
    // runPasteInto reads fresh store state; omit from deps to keep menu stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cutFoldersToClipboard, copyFoldersToClipboard, flat, pushToast, navigate],
  )

  const hasMultiFolderSelection = selectedFolderIds.size > 1

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>
          Folders
          {hasMultiFolderSelection ? (
            <span className={styles.count}>
              {' '}
              · {selectedFolderIds.size} selected ·{' '}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={clearFolderSelection}
              >
                Clear
              </button>
            </span>
          ) : null}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Refresh"
          aria-label="Refresh folders"
          onClick={() => void loadFolders()}
        >
          ↻
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="New folder"
          aria-label="Create folder"
          onClick={() => {
            setName('New folder')
            setCreateOpen(true)
          }}
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Rename"
          disabled={!renameTarget}
          onClick={() => {
            setName(renameTarget?.name ?? '')
            setRenameOpen(true)
          }}
        >
          ✎
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Copy / Move"
          disabled={selectedCount === 0}
          onClick={() => {
            setDestId(primary?.parentId || flat[0]?.id || '')
            setMoveOpen(true)
          }}
        >
          ⎘
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon
          title="Delete"
          disabled={selectedCount === 0}
          onClick={() => setDeleteOpen(true)}
        >
          ⌫
        </Button>
      </div>
      <div className={styles.search}>
        <SearchInput
          placeholder="Filter folders…"
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          aria-label="Filter folders"
        />
      </div>
      {draggingArticleIds.length > 0 ? (
        <p className={styles.dropHint}>
          Drop on a folder below to move{' '}
          {draggingArticleIds.length === 1
            ? 'this article'
            : `these ${draggingArticleIds.length} articles`}
        </p>
      ) : null}
      <div
        className={clsx(
          styles.tree,
          'app-scroll',
          draggingArticleIds.length > 0 && styles.treeDragging,
        )}
        role="tree"
        aria-multiselectable
        onContextMenu={(e) => {
          // Empty-area paste into the open folder
          if ((e.target as HTMLElement).closest(`.${styles.nodeBtn}`)) return
          e.preventDefault()
          const dest = selectedFolderId
          const canPaste = Boolean(clipboard?.ids.length && dest)
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              {
                id: 'paste',
                label: 'Paste',
                disabled: !canPaste,
                onSelect: () => {
                  if (dest) void runPasteInto(dest)
                },
              },
            ],
          })
        }}
      >
        {foldersLoading ? (
          <SkeletonList rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState title="No folders" body="Create a folder or adjust your filter." />
        ) : (
          visible.map((node) => (
            <FolderRow
              key={node.id}
              node={node}
              depth={0}
              onArticlesDropped={(ids, folderId) => {
                void onArticlesDropped(ids, folderId)
              }}
              onFolderContextMenu={onFolderContextMenu}
            />
          ))
        )}
      </div>
      <p className={styles.hint}>
        Tip: check boxes or Ctrl/Cmd+click to multi-select folders. Right-click for
        Cut / Copy / Paste. Shift+click selects a range.
      </p>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      <Modal
        open={createOpen}
        title="Create folder"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!name.trim()) return
                void run(async () => {
                  await getClient().createFolder({
                    name: name.trim(),
                    parentId: selectedFolderId ?? undefined,
                  })
                  setCreateOpen(false)
                }, 'Folder created')
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '0.55rem', borderRadius: 6, border: '1px solid var(--eg-border)' }}
          />
        </label>
      </Modal>

      <Modal
        open={renameOpen}
        title="Rename folder"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const target = renameTarget
                if (!target || !name.trim()) return
                void run(async () => {
                  await getClient().editFolder({
                    id: target.id,
                    name: name.trim(),
                    lastModifiedDate: target.lastModifiedDate,
                  })
                  setRenameOpen(false)
                }, 'Folder renamed')
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '0.55rem', borderRadius: 6, border: '1px solid var(--eg-border)' }}
          />
        </label>
      </Modal>

      <Modal
        open={moveOpen}
        title={
          selectedCount > 1
            ? `Copy / move ${selectedCount} folders`
            : 'Copy / move folder'
        }
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!destId) return
                void runBulkCopy(destId)
              }}
            >
              Copy
            </Button>
            <Button
              onClick={() => {
                if (!destId) return
                void runBulkMove(destId)
              }}
            >
              Move
            </Button>
          </>
        }
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Destination parent
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            style={{ padding: '0.55rem', borderRadius: 6, border: '1px solid var(--eg-border)' }}
          >
            {flat
              .filter((f) => !selectedIds.includes(f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path || f.name}
                </option>
              ))}
          </select>
        </label>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title={selectedCount > 1 ? `Delete ${selectedCount} folders` : 'Delete folder'}
        message={
          selectedCount > 1
            ? `Delete ${selectedCount} selected folders and their contents? This cannot be undone.`
            : `Delete “${flat.find((f) => f.id === selectedIds[0])?.name ?? 'this folder'}” and its contents? This cannot be undone.`
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          const ids = pruneNestedFolderIds(getSelectedFolderIds(), folders)
          if (!ids.length) return
          void run(async () => {
            for (const id of ids) {
              await getClient().deleteFolder(id)
            }
            if (ids.includes(selectedFolderId ?? '')) {
              navigate('/')
            }
          }, ids.length === 1 ? 'Folder deleted' : `${ids.length} folders deleted`)
        }}
      />
    </div>
  )
}
