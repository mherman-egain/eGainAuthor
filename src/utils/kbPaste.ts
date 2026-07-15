import {
  isInvalidFolderMoveDestination,
  pruneNestedFolderIds,
} from '@/utils/folderSelection'
import { useConsoleStore } from '@/store/consoleStore'
import { useSessionStore } from '@/store/sessionStore'

export type PasteResult =
  | { kind: 'articles'; mode: 'copy' | 'cut'; count: number }
  | { kind: 'folders'; mode: 'copy' | 'cut'; count: number }

/**
 * Paste the in-app clipboard into a destination folder.
 * Cut clears the clipboard; copy leaves it for repeated paste.
 */
export async function pasteClipboardIntoFolder(
  destinationFolderId: string,
): Promise<PasteResult | null> {
  const state = useConsoleStore.getState()
  const clip = state.clipboard
  if (!clip?.ids.length) return null

  const client = useSessionStore.getState().getClient()

  if (clip.kind === 'articles') {
    if (clip.mode === 'cut') {
      if (destinationFolderId === state.selectedFolderId) {
        // Still run move so the user can cut then select dest; if same folder,
        // the API may no-op or error — treat as already there when all selected
        // live in this folder list.
        const inFolder = new Set(state.articles.map((a) => a.id))
        if (clip.ids.every((id) => inFolder.has(id))) {
          throw new Error('Articles are already in this folder')
        }
      }
      await client.moveArticles(clip.ids, destinationFolderId)
      useConsoleStore.getState().clearClipboard()
      return { kind: 'articles', mode: 'cut', count: clip.ids.length }
    }
    const copied = await client.copyArticles(
      clip.ids,
      destinationFolderId,
      state.language,
    )
    return { kind: 'articles', mode: 'copy', count: copied.length }
  }

  const ids = pruneNestedFolderIds(clip.ids, state.folders)
  if (!ids.length) return null
  if (isInvalidFolderMoveDestination(state.folders, ids, destinationFolderId)) {
    throw new Error('Cannot paste a folder into itself or one of its children')
  }

  for (const id of ids) {
    if (clip.mode === 'cut') {
      await client.moveFolder(id, destinationFolderId)
    } else {
      await client.copyFolder(id, destinationFolderId)
    }
  }
  if (clip.mode === 'cut') useConsoleStore.getState().clearClipboard()
  return { kind: 'folders', mode: clip.mode, count: ids.length }
}

export function pasteSuccessMessage(result: PasteResult): string {
  if (result.kind === 'articles') {
    if (result.mode === 'cut') {
      return result.count === 1 ? 'Article moved' : `${result.count} articles moved`
    }
    return result.count === 1 ? 'Article pasted' : `${result.count} articles pasted`
  }
  if (result.mode === 'cut') {
    return result.count === 1 ? 'Folder moved' : `${result.count} folders moved`
  }
  return result.count === 1 ? 'Folder pasted' : `${result.count} folders pasted`
}
