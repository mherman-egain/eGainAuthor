import { useEffect, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Header } from '@/components/layout/Header'
import { FolderTree } from '@/components/folders/FolderTree'
import { ArticleList } from '@/components/articles/ArticleList'
import { ArticleEditor } from '@/components/editor/ArticleEditor'
import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { useResizablePanel } from '@/hooks/useResizablePanel'
import { useSessionStore } from '@/store/sessionStore'
import { useConsoleStore } from '@/store/consoleStore'
import { useToastStore } from '@/store/toastStore'
import { articlePath, decodeIdParam, folderPath } from '@/utils/deepLinks'
import styles from './ConsolePage.module.css'

const NARROW_MQ = '(max-width: 1100px)'

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none">
      <path
        d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UnpinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none">
      <path
        d="M12 17v5M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0-1.68.91M2 2l20 20M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ConsolePage() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated)
  const getClient = useSessionStore((s) => s.getClient)
  const navigate = useNavigate()
  const params = useParams<{ folderId?: string; articleId?: string }>()
  const routeFolderId = decodeIdParam(params.folderId)
  const routeArticleId = decodeIdParam(params.articleId)
  const {
    loadFolders,
    loadArticleTypes,
    folders,
    foldersLoading,
    selectedFolderId,
    selectFolder,
    selectArticle,
    loadArticles,
    propertiesOpen,
    setPropertiesOpen,
    propertiesAnchored,
    setPropertiesAnchored,
    mobilePanel,
    setMobilePanel,
  } = useConsoleStore()
  const pushToast = useToastStore((s) => s.push)

  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('Untitled article')
  const [booting, setBooting] = useState(true)
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false,
  )
  const { width: folderWidth, resizeHandlers: folderResize } = useResizablePanel(
    'folderWidth',
    { initial: 280, min: 180, max: 480 },
  )
  const { width: articleWidth, resizeHandlers: articleResize } = useResizablePanel(
    'articleWidth',
    { initial: 300, min: 200, max: 520 },
  )

  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Narrow viewports can't host the docked panel — drop the anchor and close
  // so properties only appear after an explicit Properties button press.
  useEffect(() => {
    if (!narrow) return
    setPropertiesAnchored(false)
    setPropertiesOpen(false)
  }, [narrow, setPropertiesAnchored, setPropertiesOpen])

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

  const firstFolderId = folders[0]?.id

  // Keep console selection in sync with the deep-link URL.
  useEffect(() => {
    if (!isAuthenticated() || booting || foldersLoading) return

    if (!routeFolderId) {
      if (firstFolderId) navigate(folderPath(firstFolderId), { replace: true })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        if (selectedFolderId !== routeFolderId) {
          await selectFolder(routeFolderId)
        }
        if (cancelled) return
        if (routeArticleId) {
          if (useConsoleStore.getState().selectedArticleId !== routeArticleId) {
            await selectArticle(routeArticleId)
          }
          setMobilePanel('editor')
        } else if (useConsoleStore.getState().selectedArticleId) {
          await selectArticle(null)
          setMobilePanel('articles')
        }
      } catch {
        // selection errors surface via store/toasts
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    booting,
    foldersLoading,
    firstFolderId,
    routeFolderId,
    routeArticleId,
    selectedFolderId,
    selectFolder,
    selectArticle,
    navigate,
    setMobilePanel,
  ])

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  const docked = propertiesAnchored && !narrow
  const showDockedProps = docked && propertiesOpen
  const showModalProps = propertiesOpen && !docked

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
      navigate(articlePath(selectedFolderId, article.id))
      setMobilePanel('editor')
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not create article',
      })
    }
  }

  const anchorProperties = () => {
    setPropertiesAnchored(true)
    setPropertiesOpen(true)
  }

  const unanchorProperties = () => {
    setPropertiesAnchored(false)
    setPropertiesOpen(true)
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

      <div
        className={clsx(styles.body, showDockedProps && styles.bodyWithProps)}
        style={
          {
            '--eg-folder-w': `${folderWidth}px`,
            '--eg-article-w': `${articleWidth}px`,
          } as CSSProperties
        }
      >
        <div
          className={clsx(
            styles.folderCol,
            mobilePanel === 'folders' && styles.show,
          )}
        >
          <FolderTree />
          {!narrow ? (
            <div
              className={styles.resizeHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize folders panel"
              aria-valuenow={folderWidth}
              aria-valuemin={180}
              aria-valuemax={480}
              {...folderResize}
            />
          ) : null}
        </div>

        <div
          className={clsx(
            styles.articleCol,
            mobilePanel === 'articles' && styles.show,
          )}
        >
          <ArticleList onCreateArticle={openCreate} />
          {!narrow ? (
            <div
              className={styles.resizeHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize articles panel"
              aria-valuenow={articleWidth}
              aria-valuemin={200}
              aria-valuemax={520}
              {...articleResize}
            />
          ) : null}
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

        {showDockedProps ? (
          <aside className={styles.propsCol} aria-label="Article properties">
            <div className={styles.propsHeader}>
              <h2 className={styles.propsTitle}>Properties</h2>
              <Button
                variant="ghost"
                size="sm"
                icon
                title="Unanchor properties"
                aria-label="Unanchor properties"
                onClick={unanchorProperties}
              >
                <UnpinIcon />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                aria-label="Close properties"
                onClick={() => setPropertiesOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className={`${styles.propsBody} app-scroll`}>
              <PropertiesPanel />
            </div>
          </aside>
        ) : null}
      </div>

      <Modal
        open={showModalProps}
        title="Article properties"
        size="lg"
        onClose={() => setPropertiesOpen(false)}
        headerActions={
          narrow ? null : (
            <Button
              variant="ghost"
              size="sm"
              icon
              title="Anchor properties to the right"
              aria-label="Anchor properties to the right"
              onClick={anchorProperties}
            >
              <PinIcon />
            </Button>
          )
        }
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
