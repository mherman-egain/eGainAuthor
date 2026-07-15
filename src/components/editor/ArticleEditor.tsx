import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonBlock } from '@/components/common/Skeleton'
import { HtmlEditor } from '@/components/editor/HtmlEditor'
import { isCheckedOutByUser } from '@/api/mappers'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { formatDate, statusLabel } from '@/utils/format'
import styles from './ArticleEditor.module.css'

export function ArticleEditor() {
  const {
    selectedArticleId,
    articleDetail,
    articleLoading,
    draftTitle,
    draftContent,
    articleDirty,
    setDraftTitle,
    setDraftContent,
    markClean,
    refreshArticle,
    language,
    setPropertiesOpen,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const user = useSessionStore((s) => s.user)
  const pushToast = useToastStore((s) => s.push)

  const isCheckedOut = Boolean(articleDetail?.checkedOut)
  const canEdit = Boolean(
    articleDetail && isCheckedOutByUser(articleDetail, user),
  )

  if (!selectedArticleId) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <EmptyState
            title="No article selected"
            body="Select an article from the list, or create a new one."
          />
        </div>
      </div>
    )
  }

  if (articleLoading || !articleDetail) {
    return (
      <div className={styles.panel} style={{ padding: '1rem' }}>
        <SkeletonBlock height={48} />
        <div style={{ height: 12 }} />
        <SkeletonBlock height={320} />
      </div>
    )
  }

  const save = async () => {
    try {
      await getClient().editArticle({
        id: articleDetail.id,
        name: draftTitle,
        content: draftContent,
        lastModifiedDate: articleDetail.lastModifiedDate,
        language,
        notes: articleDetail.notes,
        includeInGenAI: articleDetail.includeInGenAI,
        description: articleDetail.description,
        keywords: articleDetail.keywords,
        summary: articleDetail.summary,
      })
      markClean()
      pushToast({ type: 'success', message: 'Article saved' })
      await refreshArticle()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      })
    }
  }

  const checkout = async () => {
    try {
      await getClient().checkout(
        articleDetail.id,
        articleDetail.lastModifiedDate,
        language,
      )
      pushToast({ type: 'success', message: 'Article checked out' })
      await refreshArticle()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Checkout failed',
      })
    }
  }

  const checkin = async () => {
    try {
      if (articleDirty) await save()
      await getClient().checkin(
        articleDetail.id,
        articleDetail.lastModifiedDate,
        language,
      )
      pushToast({ type: 'success', message: 'Article checked in' })
      await refreshArticle()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Check-in failed',
      })
    }
  }

  const publish = async () => {
    try {
      if (articleDirty) await save()
      await getClient().publish(
        articleDetail.id,
        articleDetail.lastModifiedDate,
        language,
      )
      pushToast({ type: 'success', message: 'Article published' })
      await refreshArticle()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Publish failed',
      })
    }
  }

  const contentKey = `${articleDetail.id}:${articleDetail.lastModifiedDate ?? ''}:${canEdit ? 'edit' : 'ro'}`

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <Button
          variant="primary"
          size="sm"
          disabled={isCheckedOut}
          onClick={() => void checkout()}
        >
          Checkout
        </Button>
        {canEdit ? (
          <Button size="sm" onClick={() => void checkin()}>
            Check-in
          </Button>
        ) : null}
        <Button size="sm" disabled={!canEdit || !articleDirty} onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canEdit}
          onClick={() => void publish()}
        >
          Publish
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPropertiesOpen(true)}>
          Properties
        </Button>
        {articleDirty ? <span className={styles.dirty}>Unsaved changes</span> : null}
      </div>

      <div className={styles.titleRow}>
        <input
          className={styles.titleInput}
          value={draftTitle}
          disabled={!canEdit}
          onChange={(e) => setDraftTitle(e.target.value)}
          aria-label="Article title"
        />
      </div>
      <div className={styles.metaRow}>
        <span>{statusLabel(articleDetail.status)}</span>
        <span>·</span>
        <span>ID {articleDetail.alternateId || articleDetail.id}</span>
        <span>·</span>
        <span>Updated {formatDate(articleDetail.lastModifiedDate)}</span>
        {isCheckedOut ? (
          <>
            <span>·</span>
            <span>
              {canEdit
                ? 'Checked out by you'
                : `Checked out by ${articleDetail.checkedOutBy || 'another user'}`}
            </span>
          </>
        ) : null}
      </div>

      <div className={styles.editorShell}>
        <HtmlEditor
          key={contentKey}
          contentKey={contentKey}
          value={draftContent}
          editable={canEdit}
          onChange={setDraftContent}
        />
      </div>
    </div>
  )
}
