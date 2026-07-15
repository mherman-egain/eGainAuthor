import type { FolderNode } from '@/types'

/** Depth-first folder ids (preorder) for Shift+range selection. */
export function collectFolderIdsDepthFirst(
  nodes: FolderNode[],
  acc: string[] = [],
): string[] {
  for (const n of nodes) {
    acc.push(n.id)
    if (n.children?.length) collectFolderIdsDepthFirst(n.children, acc)
  }
  return acc
}

export function findFolderInList(
  nodes: FolderNode[],
  id: string,
): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const found = findFolderInList(n.children, id)
      if (found) return found
    }
  }
  return null
}

/** True if `maybeDescendantId` is under `ancestorId` (not equal). */
export function isFolderDescendantOf(
  nodes: FolderNode[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  if (ancestorId === maybeDescendantId) return false
  const ancestor = findFolderInList(nodes, ancestorId)
  if (!ancestor) return false
  return findFolderInList(ancestor.children ?? [], maybeDescendantId) != null
}

/**
 * When moving/copying multiple folders, drop ids that are nested under
 * another selected folder so a parent move covers the children.
 */
export function pruneNestedFolderIds(
  ids: string[],
  folders: FolderNode[],
): string[] {
  const set = new Set(ids)
  return ids.filter(
    (id) =>
      ![...set].some(
        (other) => other !== id && isFolderDescendantOf(folders, other, id),
      ),
  )
}

/** Destinations that would create a cycle for any of the moving folders. */
export function isInvalidFolderMoveDestination(
  folders: FolderNode[],
  movingIds: string[],
  destinationParentId: string,
): boolean {
  for (const id of movingIds) {
    if (id === destinationParentId) return true
    if (isFolderDescendantOf(folders, id, destinationParentId)) return true
  }
  return false
}
