import { useEffect, useState } from 'react'
import { isCheckedOutByUser } from '@/api/mappers'
import { Button } from '@/components/common/Button'
import { EmptyState } from '@/components/common/EmptyState'
import { Modal } from '@/components/common/Modal'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'
import { useToastStore } from '@/store/toastStore'
import { formatDate, statusLabel } from '@/utils/format'
import styles from './PropertiesPanel.module.css'

/** Form body for the article properties popup (no chrome — Modal supplies it). */
export function PropertiesPanel() {
  const { articleDetail, articleTypes, language, refreshArticle, draftTitle } =
    useConsoleStore()
  const getClient = useSessionStore((s) => s.getClient)
  const user = useSessionStore((s) => s.user)
  const pushToast = useToastStore((s) => s.push)
  const [notes, setNotes] = useState('')
  const [includeGenAI, setIncludeGenAI] = useState(false)
  const [articleType, setArticleType] = useState('General')
  const [versionsOpen, setVersionsOpen] = useState(false)

  useEffect(() => {
    if (!articleDetail) return
    setNotes(articleDetail.notes ?? '')
    setIncludeGenAI(Boolean(articleDetail.includeInGenAI))
    setArticleType(articleDetail.articleType ?? 'General')
  }, [articleDetail])

  if (!articleDetail) {
    return (
      <EmptyState title="No selection" body="Select an article to view metadata." />
    )
  }

  const canEdit = isCheckedOutByUser(articleDetail, user)

  const saveMeta = async () => {
    try {
      await getClient().editArticle({
        id: articleDetail.id,
        notes,
        includeInGenAI: includeGenAI,
        articleType,
        lastModifiedDate: articleDetail.lastModifiedDate,
        language,
        name: draftTitle || articleDetail.name,
      })
      pushToast({ type: 'success', message: 'Properties saved' })
      await refreshArticle()
    } catch (err) {
      pushToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not save properties',
      })
    }
  }

  return (
    <div className={styles.dialogBody}>
      {!canEdit ? (
        <p className={styles.value} style={{ marginTop: 0 }}>
          {articleDetail.checkedOut
            ? `Checked out by ${articleDetail.checkedOutBy || 'another user'}. Checkout the article yourself to edit properties.`
            : 'Checkout the article to edit properties.'}
        </p>
      ) : null}
      <section>
        <h3 className={styles.sectionTitle}>Overview</h3>
        <div className={styles.row}>
          <span className={styles.label}>Status</span>
          <span className={styles.value}>{statusLabel(articleDetail.status)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Article ID</span>
          <span className={styles.value}>{articleDetail.id}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Alternate ID</span>
          <span className={styles.value}>{articleDetail.alternateId || '—'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Created</span>
          <span className={styles.value}>
            {formatDate(articleDetail.createdDate)}
            {articleDetail.createdBy ? ` · ${articleDetail.createdBy}` : ''}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Last modified</span>
          <span className={styles.value}>
            {formatDate(articleDetail.lastModifiedDate)}
            {articleDetail.lastModifiedBy ? ` · ${articleDetail.lastModifiedBy}` : ''}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Publish date</span>
          <span className={styles.value}>{formatDate(articleDetail.publishDate)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Language</span>
          <span className={styles.value}>{articleDetail.language || language}</span>
        </div>
      </section>

      <section className={styles.field}>
        <h3 className={styles.sectionTitle}>Article type</h3>
        <select
          value={articleType}
          disabled={!canEdit}
          onChange={(e) => setArticleType(e.target.value)}
        >
          {(articleTypes.length
            ? articleTypes
            : [
                { id: 'g', name: 'General' },
                { id: 'f', name: 'FAQ' },
              ]
          ).map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h3 className={styles.sectionTitle}>AI settings</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={includeGenAI}
            disabled={!canEdit}
            onChange={(e) => setIncludeGenAI(e.target.checked)}
          />
          Include in GenAI
        </label>
      </section>

      <section className={styles.field}>
        <h3 className={styles.sectionTitle}>Notes</h3>
        <textarea
          value={notes}
          disabled={!canEdit}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes for authors…"
        />
      </section>

      <Button
        variant="primary"
        size="sm"
        disabled={!canEdit}
        onClick={() => void saveMeta()}
      >
        Save properties
      </Button>

      <section>
        <h3 className={styles.sectionTitle}>Topics</h3>
        {articleDetail.topics?.length ? (
          <div className={styles.chipList}>
            {articleDetail.topics.map((t) => (
              <span key={t.id} className={styles.chip}>
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.value}>No topics</span>
        )}
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Attachments</h3>
        {articleDetail.attachments?.length ? (
          articleDetail.attachments.map((a) => (
            <div key={a.id} className={styles.attach}>
              <strong>{a.name}</strong>
              <div style={{ color: 'var(--eg-muted)', fontSize: '0.72rem' }}>
                {a.contentType || 'file'}
                {a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}
              </div>
            </div>
          ))
        ) : (
          <span className={styles.value}>No attachments</span>
        )}
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Custom attributes</h3>
        {articleDetail.customAttributes?.length ? (
          articleDetail.customAttributes.map((c) => (
            <div key={c.name} className={styles.row}>
              <span className={styles.label}>{c.name}</span>
              <span className={styles.value}>{c.value}</span>
            </div>
          ))
        ) : (
          <span className={styles.value}>None</span>
        )}
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
            Version history
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
            View
          </Button>
        </div>
        <span className={styles.value}>
          Current version: {articleDetail.version ?? '—'}
        </span>
      </section>

      <Modal open={versionsOpen} title="Version history" onClose={() => setVersionsOpen(false)}>
        {articleDetail.versions?.length ? (
          articleDetail.versions.map((v) => (
            <div key={v.id} className={styles.version}>
              <strong>v{v.versionNumber ?? v.id}</strong>
              <div style={{ color: 'var(--eg-muted)' }}>
                {formatDate(v.createdDate)}
                {v.createdBy ? ` · ${v.createdBy}` : ''}
                {v.isPublished ? ' · Published' : ''}
              </div>
            </div>
          ))
        ) : (
          <p style={{ color: 'var(--eg-muted)' }}>No version records available.</p>
        )}
      </Modal>
    </div>
  )
}
