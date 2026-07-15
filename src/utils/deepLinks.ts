/** Deep-link paths for console folder / article views. */

export function folderPath(folderId: string): string {
  return `/folder/${encodeURIComponent(folderId)}`
}

export function articlePath(folderId: string, articleId: string): string {
  return `/folder/${encodeURIComponent(folderId)}/article/${encodeURIComponent(articleId)}`
}

/** Decode a react-router param that was encodeURIComponent'd in builders. */
export function decodeIdParam(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
