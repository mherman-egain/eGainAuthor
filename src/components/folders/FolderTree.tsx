import { useMemo, useState } from 'react'
import type { FolderNode } from '@/types'
import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { SearchInput } from '@/components/common/SearchInput'
import { SkeletonList } from '@/components/common/Skeleton'
import { ConfirmDialog, Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
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
}: {
  node: FolderNode
  depth: number
}) {
  const {
    selectedFolderId,
    expandedFolderIds,
    toggleFolderExpanded,
    selectFolder,
  } = useConsoleStore()
  const hasChildren =
    Boolean(node.children?.length) || Boolean(node.hasMoreChildren)
  const expanded = expandedFolderIds.has(node.id)

  return (
    <div>
      <button
        type="button"
        className={styles.nodeBtn}
        style={{ paddingLeft: `${0.4 + depth * 0.85}rem` }}
        aria-selected={selectedFolderId === node.id}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => selectFolder(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && hasChildren && !expanded) {
            toggleFolderExpanded(node.id)
          }
          if (e.key === 'ArrowLeft' && hasChildren && expanded) {
            toggleFolderExpanded(node.id)
          }
        }}
      >
        <span
          className={styles.chevron}
          onClick={(e) => {
            if (!hasChildren) return
            e.stopPropagation()
            toggleFolderExpanded(node.id)
          }}
          role={hasChildren ? 'button' : undefined}
          aria-hidden={!hasChildren}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className={styles.folderIcon} aria-hidden>
          ▢
        </span>
        <span className={styles.name}>{node.name}</span>
      </button>
      {hasChildren && expanded
        ? node.children!.map((child) => (
            <FolderRow key={child.id} node={child} depth={depth + 1} />
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
    loadFolders,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const pushToast = useToastStore((s) => s.push)

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
  const selected = flat.find((f) => f.id === selectedFolderId)

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

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Folders</span>
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
          disabled={!selected}
          onClick={() => {
            setName(selected?.name ?? '')
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
          disabled={!selected}
          onClick={() => {
            setDestId(selected?.parentId || flat[0]?.id || '')
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
          disabled={!selected}
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
      <div className={`${styles.tree} app-scroll`} role="tree">
        {foldersLoading ? (
          <SkeletonList rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState title="No folders" body="Create a folder or adjust your filter." />
        ) : (
          visible.map((node) => <FolderRow key={node.id} node={node} depth={0} />)
        )}
      </div>

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
                if (!selected || !name.trim()) return
                void run(async () => {
                  await getClient().editFolder({
                    id: selected.id,
                    name: name.trim(),
                    lastModifiedDate: selected.lastModifiedDate,
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
        title="Copy folder to…"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!selected || !destId) return
                void run(async () => {
                  await getClient().copyFolder(selected.id, destId)
                  setMoveOpen(false)
                }, 'Folder copied')
              }}
            >
              Copy
            </Button>
            <Button
              onClick={() => {
                if (!selected || !destId) return
                void run(async () => {
                  await getClient().moveFolder(selected.id, destId)
                  setMoveOpen(false)
                }, 'Folder moved')
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
              .filter((f) => f.id !== selected?.id)
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
        title="Delete folder"
        message={`Delete “${selected?.name ?? 'this folder'}” and its contents? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!selected) return
          void run(async () => {
            await getClient().deleteFolder(selected.id)
          }, 'Folder deleted')
        }}
      />
    </div>
  )
}
