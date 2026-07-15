import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonBlock } from '@/components/common/Skeleton'
import { HtmlEditor } from '@/components/editor/HtmlEditor'
import { resolveArticleLastModified } from '@/api/articleStamp'
import { isCheckedOutByUser } from '@/api/mappers'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { formatDate, statusLabel } from '@/utils/format'
import styles from './ArticleEditor.module.css'

const AUTO_SAVE_IDLE_MS = 5000
const SAVED_STATUS_MS = 2500

type SaveStatus = 'idle' | 'saving' | 'saved'

export function ArticleEditor() {
  const {
    selectedArticleId,
    articleDetail,
    articleLoading,
    articleLoadError,
    selectArticle,
    draftTitle,
    draftContent,
    articleDirty,
    autoSave,
    setDraftTitle,
    setDraftContent,
    acceptEditorBaseline,
    markClean,
    setAutoSave,
    applyArticleApiResult,
    language,
    propertiesOpen,
    propertiesAnchored,
    setPropertiesOpen,
  } = useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const user = useSessionStore((s) => s.user)
  const pushToast = useToastStore((s) => s.push)
  const savingRef = useRef(false)
  const savedClearRef = useRef<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const isCheckedOut = Boolean(articleDetail?.checkedOut)
  const canEdit = Boolean(
    articleDetail && isCheckedOutByUser(articleDetail, user),
  )

  useEffect(() => {
    return () => {
      if (savedClearRef.current != null) window.clearTimeout(savedClearRef.current)
    }
  }, [])

  // Drop "Saved" once the author starts editing again.
  useEffect(() => {
    if (articleDirty && saveStatus === 'saved') setSaveStatus('idle')
  }, [articleDirty, saveStatus])

  useEffect(() => {
    if (savedClearRef.current != null) {
      window.clearTimeout(savedClearRef.current)
      savedClearRef.current = null
    }
    setSaveStatus('idle')
  }, [selectedArticleId])

  /** Always use stamp from the most recent article API response. */
  const currentLastModified = () => {
    const latest = useConsoleStore.getState().articleDetail
    return resolveArticleLastModified(
      latest?.id ?? articleDetail!.id,
      latest?.lastModifiedDate ?? articleDetail!.lastModifiedDate,
    )
  }

  const save = async () => {
    const state = useConsoleStore.getState()
    const detail = state.articleDetail
    if (!detail || savingRef.current) return
    savingRef.current = true
    if (savedClearRef.current != null) {
      window.clearTimeout(savedClearRef.current)
      savedClearRef.current = null
    }
    setSaveStatus('saving')
    try {
      const updated = await getClient().editArticle({
        id: detail.id,
        name: state.draftTitle,
        content: state.draftContent,
        lastModifiedDate: currentLastModified(),
        language: state.language,
        notes: detail.notes,
        includeInGenAI: detail.includeInGenAI,
        description: detail.description,
        keywords: detail.keywords,
        summary: detail.summary,
      })
      markClean()
      applyArticleApiResult(updated)
      setSaveStatus('saved')
      savedClearRef.current = window.setTimeout(() => {
        setSaveStatus('idle')
        savedClearRef.current = null
      }, SAVED_STATUS_MS)
    } catch (err) {
      setSaveStatus('idle')
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      })
      throw err
    } finally {
      savingRef.current = false
    }
  }

  // Auto-save when dirty and the author has been idle for 5 seconds.
  useEffect(() => {
    if (articleLoading) return
    if (!autoSave || !canEdit || !articleDirty || !articleDetail) return
    if (selectedArticleId !== articleDetail.id) return
    const timer = window.setTimeout(() => {
      const state = useConsoleStore.getState()
      if (!state.autoSave || !state.articleDirty) return
      if (state.selectedArticleId !== state.articleDetail?.id) return
      void save().catch(() => undefined)
    }, AUTO_SAVE_IDLE_MS)
    return () => window.clearTimeout(timer)
    // draftTitle/draftContent reset the idle clock on each edit.
  }, [
    autoSave,
    canEdit,
    articleDirty,
    draftTitle,
    draftContent,
    articleDetail?.id,
    selectedArticleId,
    articleLoading,
  ])

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

  if (articleLoading) {
    return (
      <div className={styles.panel} style={{ padding: '1rem' }}>
        <SkeletonBlock height={48} />
        <div style={{ height: 12 }} />
        <SkeletonBlock height={320} />
      </div>
    )
  }

  if (!articleDetail) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <EmptyState
            title="Couldn't load this article"
            body={articleLoadError || 'Something went wrong while loading this article.'}
            action={
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void selectArticle(selectedArticleId)}
                >
                  Try again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void selectArticle(null)}>
                  Back to list
                </Button>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  const checkout = async () => {
    try {
      const updated = await getClient().checkout(
        articleDetail.id,
        currentLastModified(),
        language,
      )
      applyArticleApiResult(updated)
      pushToast({ type: 'success', message: 'Article checked out' })
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Checkout failed',
      })
    }
  }

  const checkin = async () => {
    try {
      if (useConsoleStore.getState().articleDirty) await save()
      const updated = await getClient().checkin(
        articleDetail.id,
        currentLastModified(),
        language,
      )
      applyArticleApiResult(updated)
      pushToast({ type: 'success', message: 'Article checked in' })
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Check-in failed',
      })
    }
  }

  const publish = async () => {
    try {
      if (useConsoleStore.getState().articleDirty) await save()
      const updated = await getClient().publish(
        articleDetail.id,
        currentLastModified(),
        language,
      )
      applyArticleApiResult(updated)
      pushToast({ type: 'success', message: 'Article published' })
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Publish failed',
      })
    }
  }

  // Remount editor when article or lock mode changes — not on every lastModified bump
  // (save/checkin would wipe the caret if LMD were in the key).
  const contentKey = `${articleDetail.id}:${canEdit ? 'edit' : 'ro'}:${articleDetail.version ?? ''}`

  const statusChip = canEdit
    ? { label: 'Editing', cls: styles.chipEditing }
    : isCheckedOut
      ? {
          label: `Locked by ${articleDetail.checkedOutBy || 'another user'}`,
          cls: styles.chipLocked,
        }
      : { label: 'Read-only', cls: styles.chipReadonly }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={clsx(styles.statusChip, statusChip.cls)}>
          {statusChip.label}
        </span>
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
        <Button
          size="sm"
          disabled={!canEdit || !articleDirty}
          onClick={() => void save().catch(() => undefined)}
        >
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setPropertiesOpen(propertiesAnchored ? !propertiesOpen : true)
          }
        >
          Properties
        </Button>
        <label className={styles.autoSave} title="Save after 5 seconds of idle editing">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
          />
          Auto Save
        </label>
        <span
          className={clsx(
            styles.saveHint,
            saveStatus === 'idle' && articleDirty && styles.saveHintDirty,
          )}
          aria-live="polite"
        >
          {saveStatus === 'saving'
            ? 'Saving…'
            : saveStatus === 'saved'
              ? 'Saved'
              : articleDirty
                ? 'Unsaved changes'
                : null}
        </span>
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
      </div>

      <div className={styles.editorShell}>
        <HtmlEditor
          key={contentKey}
          contentKey={contentKey}
          value={draftContent}
          editable={canEdit}
          onChange={setDraftContent}
          onBaseline={acceptEditorBaseline}
        />
      </div>
    </div>
  )
}
