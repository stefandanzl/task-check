import {Notice, type App} from 'obsidian'
import {writable} from 'svelte/store'

import {combineFileLines, getAllLinesFromFile, getFileFromPath} from './utils/helpers'
import {navToFile} from './utils/files'

export type UndoChange = {filePath: string; line: number; before: string; after: string}
export type UndoEntry = {label: string; changes: UndoChange[]}

const MAX_UNDO = 10
const entries: UndoEntry[] = []

// UI-facing state: how many undos are available and a label for the next one.
export const undoState = writable<{count: number; label: string | null}>({count: 0, label: null})

const sync = () => {
  const top = entries[entries.length - 1]
  undoState.set({count: entries.length, label: top?.label ?? null})
}

/** Record a single logical task edit (may span multiple lines/files, e.g. a drag cascade). */
export const pushUndo = (entry: UndoEntry) => {
  entries.push(entry)
  if (entries.length > MAX_UNDO) entries.shift()
  sync()
}

export const clearUndo = () => {
  entries.length = 0
  sync()
}

/**
 * Reverts the most recent recorded edit. Each changed line is restored only if
 * it still matches its `after` snapshot (found at the recorded line, or by
 * content elsewhere); lines that have since changed are skipped. Navigates to
 * the first changed line so the user sees what was undone.
 */
export const undoLast = async (app: App, navigate = true) => {
  const entry = entries.pop()
  if (!entry) {
    new Notice('Nothing to undo')
    return
  }
  sync()

  const first = entry.changes[0]
  if (navigate && first) {
    await navToFile(app, first.filePath, new MouseEvent('click'), first.line)
  }

  const byFile = new Map<string, UndoChange[]>()
  for (const c of entry.changes) {
    if (!byFile.has(c.filePath)) byFile.set(c.filePath, [])
    byFile.get(c.filePath)!.push(c)
  }
  for (const [filePath, changes] of byFile) {
    const file = getFileFromPath(app.vault, filePath)
    if (!file) continue
    const lines = getAllLinesFromFile(await app.vault.read(file))
    for (const c of changes) {
      if (lines[c.line] === c.after) {
        lines[c.line] = c.before
      } else {
        const idx = lines.indexOf(c.after)
        if (idx >= 0) lines[idx] = c.before
        // else: the line changed since — leave it alone
      }
    }
    await app.vault.modify(file, combineFileLines(lines))
  }

  new Notice(`Undid: ${entry.label}`)
}
