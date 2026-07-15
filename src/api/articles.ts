import type {
  ArticleDetail,
  ArticleSummary,
  ArticleType,
  ArticleVersion,
  AttachmentRef,
  CreateArticleInput,
  EditArticleInput,
} from '@/types'
import { apiRequest, wsPath, type RequestAuth } from './http'
import {
  mapArticleDetail,
  mapArticleSummary,
  mapArticleType,
  unwrapList,
} from './mappers'

function langParam(language?: string): string {
  return `$lang=${encodeURIComponent(language || 'en-us')}`
}

/** Optimistic concurrency for checkin / publish / edit (docs: versions.version.lastModified). */
function versionLastModified(lastModifiedDate?: string) {
  if (!lastModifiedDate) return undefined
  return {
    versions: {
      version: [{ lastModified: { date: lastModifiedDate } }],
    },
  }
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
    mapArticleSummary(a, folderId),
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
  return mapArticleDetail(list[0] ?? data)
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
  return mapArticleDetail(list[0] ?? data, input.folderId)
}

export async function editArticle(
  auth: RequestAuth,
  input: EditArticleInput,
): Promise<ArticleDetail> {
  const language = input.language || 'en-us'
  // Docs: PUT /ws/v20/kb/article — Articles schema; id + versions.version.lastModified required.
  const body = {
    article: [
      {
        id: input.id,
        name: input.name,
        description: input.description,
        keywords: input.keywords,
        summary: input.summary,
        notes: input.notes,
        articleType: input.articleType ? { name: input.articleType } : undefined,
        content: input.content !== undefined ? { text: input.content } : undefined,
        ...versionLastModified(input.lastModifiedDate),
        includeInGenAI:
          input.includeInGenAI === undefined
            ? undefined
            : input.includeInGenAI
              ? 'yes'
              : 'no',
        customAttributes: input.customAttributes
          ? {
              customAttribute: input.customAttributes.map((c) => ({
                name: c.name,
                value: c.value,
              })),
            }
          : undefined,
      },
    ],
  }
  const data = await apiRequest(
    auth,
    `${wsPath('kb/article')}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  )
  const list = unwrapList(data, ['article'])
  return mapArticleDetail(list[0] ?? data)
}

export async function deleteArticle(
  auth: RequestAuth,
  articleId: string,
  language = 'en-us',
): Promise<void> {
  await apiRequest(
    auth,
    `${wsPath(`kb/article/${articleId}`)}?${langParam(language)}`,
    { method: 'DELETE' },
  )
}

export async function moveArticles(
  auth: RequestAuth,
  articleIds: string[],
  destinationFolderId: string,
): Promise<void> {
  // Docs: POST /ws/v20/kb/article/{IDs}/move — IDs in path; destination folder in body only.
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
  return mapArticleDetail(list[0] ?? data, destinationFolderId)
}

export async function checkoutArticle(
  auth: RequestAuth,
  articleId: string,
  _lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail | void> {
  // Docs: PUT /ws/v20/kb/article/{IDs}/checkout — empty body; $lang required.
  // lastModified is unused (kept for client signature compatibility).
  void _lastModifiedDate
  const data = await apiRequest(
    auth,
    `${wsPath(`kb/article/${encodeURIComponent(articleId)}/checkout`)}?$attribute=all&${langParam(language)}`,
    {
      method: 'PUT',
      skipJsonContentType: true,
    },
  )
  if (!data) return
  const list = unwrapList(data, ['article'])
  return mapArticleDetail(list[0] ?? data)
}

export async function checkinArticle(
  auth: RequestAuth,
  articleId: string,
  lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail | void> {
  // Docs: PUT /ws/v20/kb/article/checkin — body requires id + versions.version.lastModified.
  const body = {
    article: [
      {
        id: articleId,
        ...versionLastModified(lastModifiedDate),
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
  if (!data) return
  const list = unwrapList(data, ['article'])
  return mapArticleDetail(list[0] ?? data)
}

export async function publishArticle(
  auth: RequestAuth,
  articleId: string,
  lastModifiedDate?: string,
  language = 'en-us',
): Promise<ArticleDetail | void> {
  // Docs: PUT /ws/v20/kb/article/publish — body requires id + versions.version.lastModified.
  const body = {
    article: [
      {
        id: articleId,
        ...versionLastModified(lastModifiedDate),
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
  if (!data) return
  const list = unwrapList(data, ['article'])
  return mapArticleDetail(list[0] ?? data)
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
  return unwrapList(data, ['version', 'versions']).map((v) => {
    const o = v as Record<string, unknown>
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
  return unwrapList(data, ['article', 'articles']).map((a) => mapArticleSummary(a))
}
