/** HTML5 DnD payload for article move onto folders. */
export const ARTICLE_DND_MIME = 'application/x-egain-article-ids'

export function setArticleDragData(
  dt: DataTransfer,
  articleIds: string[],
): void {
  const payload = JSON.stringify({ articleIds })
  dt.setData(ARTICLE_DND_MIME, payload)
  // Fallback for environments that strip custom MIME types
  dt.setData('text/plain', articleIds.join(','))
  dt.effectAllowed = 'move'
}

export function readArticleDragIds(dt: DataTransfer): string[] {
  const custom = dt.getData(ARTICLE_DND_MIME)
  if (custom) {
    try {
      const parsed = JSON.parse(custom) as { articleIds?: string[] }
      if (Array.isArray(parsed.articleIds)) {
        return parsed.articleIds.map(String).filter(Boolean)
      }
    } catch {
      // fall through
    }
  }
  const plain = dt.getData('text/plain')
  if (!plain) return []
  return plain
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
