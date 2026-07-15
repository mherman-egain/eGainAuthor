/**
 * Optimistic-concurrency stamp: every article detail API response updates the
 * lastModified date for that article id. Mutating calls must send the stamp
 * from the most recent detail-level call (get / checkout / edit / …).
 *
 * Do not seed this from folder list/search rows — those often carry a different
 * or lower-precision lastModified than the checked-out version.
 */

const stamps = new Map<string, string>()

export function rememberArticleLastModified(
  articleId: string | undefined | null,
  lastModifiedDate: string | undefined | null,
): void {
  const id = articleId != null ? String(articleId) : ''
  const date = lastModifiedDate?.trim()
  if (!id || !date) return
  stamps.set(id, date)
}

export function getArticleLastModified(
  articleId: string | undefined | null,
): string | undefined {
  if (articleId == null) return undefined
  return stamps.get(String(articleId))
}

/**
 * Prefer the stamp from the most recent article detail API call.
 * Fall back to an explicit UI value only when no stamp exists yet.
 */
export function resolveArticleLastModified(
  articleId: string | undefined | null,
  explicit?: string | null,
): string | undefined {
  const stamped = getArticleLastModified(articleId)
  if (stamped) return stamped
  const fromExplicit = explicit?.trim()
  return fromExplicit || undefined
}

export function clearArticleLastModified(articleId?: string): void {
  if (articleId == null) {
    stamps.clear()
    return
  }
  stamps.delete(String(articleId))
}
