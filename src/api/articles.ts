import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  ArticleVersion,
  AttachmentRef,
  CreateArticleInput,
  EditArticleInput,
} from '@/types'
import { rememberArticleLastModified } from './articleStamp'
import {
  absoluteCompositeUrl,
  assertCompositeAllOk,
  chunkArray,
  executeComposite,
} from './composite'
import { apiRequest, wsPath, type RequestAuth } from './http'
import {
  extractVersionLastModified,
  extractWorkingVersionId,
  mapArticleDetail,
  mapArticleSummary,
  mapArticleType,
  unwrapList,
} from './mappers'

function langParam(language?: string): string {
  return `$lang=${encodeURIComponent(language || 'en-us')}`
}

type VersionStamp = { lastModifiedDate: string; versionId?: string }

/**
 * Edit Article / Check-in request shape from docs:
 * versions.version.lastModified (+ optional name/content/description/…).
 * Do NOT send version id here (that is Edit Version API only) — it returns
 * "Unsupported parameter in request body".
 * Do NOT send includeInGenAI / articleType on this API.
 */
function versionEditPayload(
  stamp: VersionStamp,
  fields: {
    name?: string
    content?: string
    description?: string
    keywords?: string
    summary?: string
  },
) {
  const version: Record<string, unknown> = {
    lastModified: { date: stamp.lastModifiedDate },
  }
  if (fields.name !== undefined) version.name = fields.name
  if (fields.content !== undefined) version.content = fields.content
  if (fields.description !== undefined) version.description = fields.description
  if (fields.keywords !== undefined) version.keywords = fields.keywords
  if (fields.summary !== undefined) version.summary = fields.summary
  return { versions: { version: [version] } }
}

/** Check-in / publish: only id + version lastModified (docs). */
function versionConcurrencyOnly(stamp: VersionStamp) {
  return {
    versions: {
      version: [{ lastModified: { date: stamp.lastModifiedDate } }],
    },
  }
}

/**
 * lastModified for edit/checkin/publish must be the *version* being edited.
 * Use Get Latest Version — when the caller holds the checkout lock, this is the
 * transient working copy (not the article-level lastModified).
 */
async function fetchVersionConcurrencyStamp(
  auth: RequestAuth,
  articleId: string,
  language: string,
): Promise<VersionStamp> {
  const encoded = encodeURIComponent(articleId)
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/article/${encoded}/latest`)}?$attribute=all&${langParam(language)}`,
  )

  // Response is Articles schema: article[] with nested versions.version[]
  const articles = unwrapList(data, ['article', 'articles'])
  const raw = articles[0] ?? data
  let lastModifiedDate = extractVersionLastModified(raw)
  let versionId = extractWorkingVersionId(raw)

  // Fallback: list versions for this article
  if (!lastModifiedDate) {
    const versionsData = await apiRequest(
      auth,
      `${wsPath(`kb/article/${encoded}/version`)}?$attribute=all&${langParam(language)}`,
    )
    // May be { version: [...] } or { article: [{ versions: ... }] }
    const asArticle = {
      versions: versionsData,
      version: unwrapList(versionsData, ['version', 'versions']),
    }
    lastModifiedDate = extractVersionLastModified(asArticle)
    versionId = extractWorkingVersionId(asArticle) ?? versionId

    if (!lastModifiedDate) {
      // Last resort: wrap version list
      const versions = unwrapList(versionsData, ['version', 'versions'])
      for (const v of versions) {
        const d = extractVersionLastModified({ versions: { version: [v] } })
        if (d) {
          lastModifiedDate = d
          versionId = extractWorkingVersionId({ versions: { version: [v] } }) ?? versionId
          break
        }
      }
      // Prefer highest versionNumber entry if still scanning
      if (!lastModifiedDate && versions.length > 0) {
        lastModifiedDate = extractVersionLastModified({
          versions: { version: versions },
        })
        versionId =
          extractWorkingVersionId({ versions: { version: versions } }) ?? versionId
      }
    }
  }

  if (!lastModifiedDate) {
    throw new Error(
      `Could not read versions.version.lastModified for article ${articleId}. Reload and try again.`,
    )
  }

  rememberArticleLastModified(articleId, lastModifiedDate)
  return { lastModifiedDate, versionId }
}

function rememberMapped(article: ArticleDetail | ArticleSummary): void {
  rememberArticleLastModified(article.id, article.lastModifiedDate)
}

/** Map article payload and persist lastModified from version or article root. */
function mapDetailAndRemember(
  raw: unknown,
  folderIdFallback?: string,
): ArticleDetail {
  const detail = mapArticleDetail(raw, folderIdFallback)
  const fromRaw = extractVersionLastModified(raw)
  if (fromRaw) detail.lastModifiedDate = fromRaw
  const versionId = extractWorkingVersionId(raw)
  if (versionId) detail.versionId = versionId
  rememberMapped(detail)
  return detail
}

/** List/search rows — map only; do not overwrite the concurrency stamp. */
function mapSummaryOnly(
  raw: unknown,
  folderIdFallback?: string,
): ArticleSummary {
  return mapArticleSummary(raw, folderIdFallback)
}

/**
 * After a mutating call: use response body when present, otherwise GET the
 * article so the concurrency stamp always advances.
 */
async function detailFromResponseOrGet(
  auth: RequestAuth,
  articleId: string,
  language: string,
  data: unknown,
  folderIdFallback?: string,
): Promise<ArticleDetail> {
  if (data !== undefined && data !== null && data !== '') {
    const list = unwrapList(data, ['article'])
    const raw = list[0] ?? data
    // Empty `{}` / non-article payloads — fall through to GET
    if (raw && typeof raw === 'object' && ('id' in (raw as object) || 'article' in (raw as object) || 'versions' in (raw as object))) {
      return mapDetailAndRemember(raw, folderIdFallback)
    }
    if (list.length > 0) {
      return mapDetailAndRemember(list[0], folderIdFallback)
    }
  }
  return getArticle(auth, articleId, language)
}

export async function listArticlesInFolder(
  auth: RequestAuth,
  folderId: string,
  language = 'en-us',
): Promise<ArticleSummary[]> {
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article')}?folder=${encodeURIComponent(folderId)}&$attribute=all&${langParam(language)}`,
  )
  return unwrapList(data, ['article', 'articles']).map((a) =>
    mapSummaryOnly(a, folderId),
  )
}

export async function getArticle(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<ArticleDetail> {
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/article/${articleId}`)}?$attribute=all&${langParam(language)}`,
  )
  const list = unwrapList(data, ['article'])
  return mapDetailAndRemember(list[0] ?? data)
}

export async function createArticle(
  auth: RequestAuth,
  input: CreateArticleInput,
): Promise<ArticleDetail> {
  const language = input.language || 'en-us'
  const body = {
    article: {
      name: input.name,
      description: input.description,
      keywords: input.keywords,
      summary: input.summary,
      articleType: input.articleType ? { name: input.articleType } : { name: 'General' },
      folder: { id: input.folderId },
      content: input.content ? { text: input.content } : undefined,
      language: { code: language },
    },
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article')}?$attribute=all&${langParam(language)}`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  const list = unwrapList(data, ['article'])
  const detail = mapDetailAndRemember(list[0] ?? data, input.folderId)
  if (!detail.lastModifiedDate) {
    return getArticle(auth, detail.id, language)
  }
  return detail
}

export async function editArticle(
  auth: RequestAuth,
  input: EditArticleInput,
): Promise<ArticleDetail> {
  const language = input.language || 'en-us'
  // Version being edited (checkout working copy when we hold the lock).
  const stamp = await fetchVersionConcurrencyStamp(auth, input.id, language)
  // Docs: PUT /ws/v20/kb/article — only documented optional fields under version.
  const body = {
    article: [
      {
        id: input.id,
        ...versionEditPayload(stamp, {
          name: input.name,
          content: input.content,
          description: input.description,
          keywords: input.keywords,
          summary: input.summary,
        }),
      },
    ],
  }
  if (import.meta.env.DEV) {
    console.info(
      '[editArticle] body=',
      JSON.stringify(body),
    )
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article')}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  )
  return detailFromResponseOrGet(auth, input.id, language, data)
}

export async function deleteArticle(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<void> {
  await deleteArticles(auth, [articleId], language)
}

export async function deleteArticles(
  auth: RequestAuth,
  articleIds: string[],
  language = 'en-us',
): Promise<void> {
  if (articleIds.length === 0) return
  const ids = articleIds.map((id) => encodeURIComponent(id)).join(',')
  await apiRequest(
    auth,
    `${wsPath(`kb/article/${ids}`)}?${langParam(language)}`,
    { method: 'DELETE' },
  )
}

export async function moveArticles(
  auth: RequestAuth,
  articleIds: string[],
  destinationFolderId: string,
): Promise<void> {
  // Docs: POST /ws/v20/kb/article/{IDs}/move — IDs in path; destination folder in body only.
  if (articleIds.length === 0) return
  const ids = articleIds.map((id) => encodeURIComponent(id)).join(',')
  const body = {
    folder: { id: destinationFolderId },
  }
  await apiRequest(auth, wsPath(`kb/article/${ids}/move`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function copyArticle(
  auth: RequestAuth,
  articleId: string,
  destinationFolderId: string,
  language = 'en-us',
): Promise<ArticleDetail | void> {
  const body = {
    article: { id: articleId },
    folder: { id: destinationFolderId },
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article/copy')}?$attribute=all&${langParam(language)}`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  if (!data) return
  const list = unwrapList(data, ['article'])
  return mapDetailAndRemember(list[0] ?? data, destinationFolderId)
}

/**
 * Copy many articles into a folder.
 * `POST …/article/copy` is one-id-only, so N>1 uses the Composite API
 * (one round-trip per chunk) instead of serial browser calls.
 */
export async function copyArticles(
  auth: RequestAuth,
  articleIds: string[],
  destinationFolderId: string,
  language = 'en-us',
): Promise<ArticleDetail[]> {
  if (articleIds.length === 0) return []
  if (articleIds.length === 1) {
    const one = await copyArticle(
      auth,
      articleIds[0]!,
      destinationFolderId,
      language,
    )
    return one ? [one] : []
  }

  const results: ArticleDetail[] = []
  const copyUrl = absoluteCompositeUrl(
    auth,
    `kb/article/copy?$attribute=all&${langParam(language)}`,
  )

  for (const chunk of chunkArray(articleIds)) {
    const nested = chunk.map((id) => ({
      method: 'POST' as const,
      url: copyUrl,
      requestBodyText: JSON.stringify({
        article: { id },
        folder: { id: destinationFolderId },
      }),
    }))
    const compositeResults = await executeComposite(auth, nested)
    assertCompositeAllOk(compositeResults, 'Copy articles')
    for (const r of compositeResults) {
      if (!r.body) continue
      const list = unwrapList(r.body, ['article'])
      const detail = mapDetailAndRemember(list[0] ?? r.body, destinationFolderId)
      results.push(detail)
    }
  }
  return results
}

export async function checkoutArticle(
  auth: RequestAuth,
  articleId: string,
  _lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail> {
  // Docs: PUT /ws/v20/kb/article/{IDs}/checkout — empty body; $lang required.
  void _lastModifiedDate
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/article/${encodeURIComponent(articleId)}/checkout`)}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      skipJsonContentType: true,
    },
  )
  return detailFromResponseOrGet(auth, articleId, language, data)
}

export async function checkinArticle(
  auth: RequestAuth,
  articleId: string,
  _lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail> {
  void _lastModifiedDate
  const stamp = await fetchVersionConcurrencyStamp(auth, articleId, language)
  // Docs: PUT /ws/v20/kb/article/checkin — id + versions.version.lastModified only.
  const body = {
    article: [
      {
        id: articleId,
        ...versionConcurrencyOnly(stamp),
      },
    ],
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article/checkin')}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  )
  return detailFromResponseOrGet(auth, articleId, language, data)
}

export async function publishArticle(
  auth: RequestAuth,
  articleId: string,
  _lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail> {
  void _lastModifiedDate
  const stamp = await fetchVersionConcurrencyStamp(auth, articleId, language)
  // Docs: PUT /ws/v20/kb/article/publish — id + versions.version.lastModified only.
  const body = {
    article: [
      {
        id: articleId,
        ...versionConcurrencyOnly(stamp),
      },
    ],
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article/publish')}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  )
  return detailFromResponseOrGet(auth, articleId, language, data)
}

export async function getArticleVersions(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<ArticleVersion[]> {
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/article/${articleId}/version`)}?$attribute=all&${langParam(language)}`,
  )
  const rawVersions = unwrapList(data, ['version', 'versions'])
  const date = extractVersionLastModified({ versions: { version: rawVersions } })
  if (date) rememberArticleLastModified(articleId, date)

  return rawVersions.map((v) => {
    const o = v as Record<string, unknown>
    const lastModifiedDate = extractVersionLastModified({
      versions: { version: [v] },
    })
    return {
      id: String(o.id ?? ''),
      versionNumber: (o.versionNumber as string | number) ?? o.id,
      createdDate:
        typeof o.created === 'object' && o.created
          ? String((o.created as { date?: string }).date ?? '')
          : (o.createdDate as string | undefined),
      createdBy:
        typeof o.createdBy === 'object' && o.createdBy
          ? String((o.createdBy as { name?: string }).name ?? '')
          : (o.createdBy as string | undefined),
      lastModifiedDate,
      isPublished: Boolean(o.isPublished ?? o.published),
      label: o.label as string | undefined,
    }
  })
}

export async function listArticleTypes(auth: RequestAuth): Promise<ArticleType[]> {
  // Docs: GET /kb/articleType?department={Id} — department from logged-in user
  const dept = auth.departmentId
  if (!dept) {
    throw new Error(
      'Cannot load article types: logged-in user has no home department id.',
    )
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/articleType')}?department=${encodeURIComponent(dept)}&$attribute=all`,
  )
  return unwrapList(data, ['articleType', 'articleTypes']).map(mapArticleType)
}

export async function getArticleAttachments(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<AttachmentRef[]> {
  try {
    const data = await apiRequest(
      auth,
      `${wsPath('kb/attachment')}?article=${encodeURIComponent(articleId)}&$attribute=all&${langParam(language)}`,
    )
    return unwrapList(data, ['attachment', 'attachments']).map((a) => {
      const o = a as Record<string, unknown>
      return {
        id: String(o.id ?? ''),
        name: String(o.name ?? o.fileName ?? 'attachment'),
        size: Number(o.size) || undefined,
        contentType: (o.contentType as string) || undefined,
        createdDate:
          typeof o.created === 'object' && o.created
            ? String((o.created as { date?: string }).date ?? '')
            : (o.createdDate as string | undefined),
      }
    })
  } catch {
    // Attachments may be embedded on the article resource
    const article = await getArticle(auth, articleId, language)
    return article.attachments ?? []
  }
}

export async function getArticleNotes(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<string> {
  const article = await getArticle(auth, articleId, language)
  return article.notes ?? ''
}

export async function searchArticles(
  auth: RequestAuth,
  query: string,
  language = 'en-us',
): Promise<ArticleSummary[]> {
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article')}?$attribute=all&${langParam(language)}&name=*${encodeURIComponent(query)}*`,
  )
  return unwrapList(data, ['article', 'articles']).map((a) => mapSummaryOnly(a))
}
