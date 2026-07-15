import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import clsx from 'clsx'
import { Header } from '@/components/layout/Header'
import { FolderTree } from '@/components/folders/FolderTree'
import { ArticleList } from '@/components/articles/ArticleList'
import { ArticleEditor } from '@/components/editor/ArticleEditor'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { useSessionStore } from '@/store/sessionStore'
import { useConsoleStore } from '@/store/consoleStore'
import { useToastStore } from '@/store/toastStore'
import styles from './ConsolePage.module.css'

export function ConsolePage() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const getClient = useSessionStore((s) => s.getClient)
  const {
    loadFolders,
    loadArticleTypes,
    selectedFolderId,
    selectArticle,
    loadArticles,
    propertiesOpen,
    setPropertiesOpen,
    mobilePanel,
    setMobilePanel,
  } = useConsoleStore()
  const pushToast = useToastStore((s) => s.push)

  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('Untitled article')
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) return
    let cancelled = false
    ;(async () => {
      setBooting(true)
      try {
        await Promise.all([loadFolders(), loadArticleTypes()])
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loadFolders, loadArticleTypes])

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  const openCreate = () => {
    setTitle('Untitled article')
    setCreateOpen(true)
  }

  const createArticle = async () => {
    if (!selectedFolderId || !title.trim()) {
      pushToast({ type: 'error', message: 'Select a folder and enter a title.' })
      return
    }
    try {
      const article = await getClient().createArticle({
        name: title.trim(),
        folderId: selectedFolderId,
        content: '<p></p>',
      })
      pushToast({ type: 'success', message: 'Article created' })
      setCreateOpen(false)
      setTitle('Untitled article')
      await loadArticles(selectedFolderId)
      await selectArticle(article.id)
      setMobilePanel('editor')
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not create article',
      })
    }
  }

  return (
    <div className={styles.shell}>
      <Header onCreateArticle={openCreate} />

      <div className={styles.mobileTabs}>
        <Button
          size="sm"
          variant={mobilePanel === 'folders' ? 'primary' : 'ghost'}
          onClick={() => setMobilePanel('folders')}
        >
          Folders
        </Button>
        <Button
          size="sm"
          variant={mobilePanel === 'articles' ? 'primary' : 'ghost'}
          onClick={() => setMobilePanel('articles')}
        >
          Articles
        </Button>
        <Button
          size="sm"
          variant={mobilePanel === 'editor' ? 'primary' : 'ghost'}
          onClick={() => setMobilePanel('editor')}
        >
          Editor
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPropertiesOpen(true)}>
          Properties
        </Button>
      </div>

      <div className={styles.body}>
        <div
          className={clsx(
            styles.folderCol,
            mobilePanel === 'folders' && styles.show,
          )}
        >
          <FolderTree />
        </div>

        <div
          className={clsx(
            styles.articleCol,
            mobilePanel === 'articles' && styles.show,
          )}
        >
          <ArticleList onCreateArticle={openCreate} />
        </div>

        <main
          className={clsx(styles.main, mobilePanel === 'editor' && styles.show)}
        >
          {booting ? (
            <div className={styles.booting}>Loading…</div>
          ) : (
            <ArticleEditor />
          )}
        </main>
      </div>

      <Modal
        open={propertiesOpen}
        title="Article properties"
        size="lg"
        onClose={() => setPropertiesOpen(false)}
      >
        <PropertiesPanel />
      </Modal>

      <Modal
        open={createOpen}
        title="New article"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void createArticle()}>
              Create
            </Button>
          </>
        }
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            style={{
              padding: '0.55rem',
              borderRadius: 6,
              border: '1px solid var(--eg-border)',
            }}
          />
        </label>
        {!selectedFolderId ? (
          <p style={{ color: 'var(--eg-danger)', fontSize: 13, marginBottom: 0 }}>
            Select a folder first.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
